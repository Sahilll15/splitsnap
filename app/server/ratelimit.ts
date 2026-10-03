import { peek, redisFromEnv, take, type RedisLike } from './redis.ts';

const HOUR = 60 * 60 * 1000;
const SWEEP_EVERY = 60_000;

export type Limit = { limit: number; windowMs: number };
export type Verdict =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfter: number; resetAt: number; busy?: true };
export type Rejection = Extract<Verdict, { ok: false }>;

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const LIMITS = {
  scan: {
    limit: num(process.env.RATE_LIMIT_SCAN, 4),
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, HOUR),
  },
} satisfies Record<string, Limit>;

/** Canonical key for an address: ports, zones and brackets stripped, IPv6 grouped by /64. */
export function normalizeIp(raw: string) {
  let ip = raw.trim().toLowerCase();
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'));
  ip = ip.replace(/%.*$/, '');

  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) ip = mapped[1];

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').every((o) => Number(o) <= 255) ? ip.split('.').map(Number).join('.') : 'invalid';
  }
  if (!ip.includes(':') || !/^[0-9a-f:]+$/.test(ip)) return 'invalid';

  const halves = ip.split('::');
  if (halves.length > 2) return 'invalid';
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return 'invalid';
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  if (groups.some((g) => g.length === 0 || g.length > 4)) return 'invalid';
  // One subscriber usually owns a whole /64, so finer keys would let them rotate addresses.
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

// x-real-ip is overwritten by the platform proxy (Vercel). The leftmost x-forwarded-for
// entry is whatever the client sent, so only the last hop is used.
export function clientIp(req: Request) {
  const real = req.headers.get('x-real-ip');
  if (real?.trim()) return normalizeIp(real);
  const last = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
  return last ? normalizeIp(last) : 'unknown';
}

type Entry = { hits: number[]; windowMs: number };

export function createLimiter(maxKeys = 10_000) {
  const buckets = new Map<string, Entry>();
  let lastSweep = 0;

  function sweep(now: number) {
    lastSweep = now;
    for (const [key, e] of buckets) {
      if (!e.hits.length || now - e.hits[e.hits.length - 1] >= e.windowMs) buckets.delete(key);
    }
  }

  function store(key: string, entry: Entry, now: number) {
    buckets.delete(key);
    buckets.set(key, entry);
    if (buckets.size <= maxKeys) return;
    if (now - lastSweep > SWEEP_EVERY) sweep(now);
    // Evict least recently touched keys one at a time; never wipe everyone's counters.
    while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value!);
  }

  function live(key: string, windowMs: number, now: number) {
    return (buckets.get(key)?.hits ?? []).filter((t) => now - t < windowMs);
  }

  const resetAt = (hits: number[], windowMs: number, now: number) => (hits[0] ?? now) + windowMs;
  const retryAfter = (hits: number[], windowMs: number, now: number) =>
    Math.max(1, Math.ceil((resetAt(hits, windowMs, now) - now) / 1000));

  return {
    hit(key: string, { limit, windowMs }: Limit, now = Date.now()): Verdict {
      const hits = live(key, windowMs, now);
      if (hits.length >= limit) {
        store(key, { hits, windowMs }, now);
        return { ok: false, retryAfter: retryAfter(hits, windowMs, now), resetAt: resetAt(hits, windowMs, now) };
      }
      hits.push(now);
      store(key, { hits, windowMs }, now);
      return { ok: true, remaining: limit - hits.length, resetAt: resetAt(hits, windowMs, now) };
    },
    /** Seconds until the key may try again, or 0 when it is not limited. Does not count a hit. */
    blocked(key: string, { limit, windowMs }: Limit, now = Date.now()) {
      const hits = live(key, windowMs, now);
      return hits.length >= limit ? retryAfter(hits, windowMs, now) : 0;
    },
    size: () => buckets.size,
  };
}

const busyVerdict = (now: number, err: unknown): Rejection => {
  console.error('rate limit store failed', (err as Error)?.message);
  return { ok: false, retryAfter: 60, resetAt: now + 60_000, busy: true };
};

/** Per-client windows counted in Redis when configured, else in this instance's memory. Fails closed. */
export function createLimits(app: string, getRedis: () => RedisLike | null = redisFromEnv, memory = createLimiter(), clock = Date.now) {
  return {
    async hit(bucket: string, client: string, lim: Limit): Promise<Verdict> {
      const now = clock();
      const redis = getRedis();
      if (!redis) return memory.hit(`${bucket}:${client}`, lim, now);
      try {
        const t = await take(redis, `rl:${app}:${bucket}:${client}`, lim.limit, lim.windowMs, now);
        if (t.ok) return { ok: true, remaining: t.remaining, resetAt: t.resetAt };
        return { ok: false, retryAfter: Math.max(1, Math.ceil((t.resetAt - now) / 1000)), resetAt: t.resetAt };
      } catch (err) {
        return busyVerdict(now, err);
      }
    },
    /** The rejection a hit would get right now, or null. Never counts a hit. */
    async blocked(bucket: string, client: string, lim: Limit): Promise<Rejection | null> {
      const now = clock();
      const redis = getRedis();
      try {
        if (!redis) {
          const secs = memory.blocked(`${bucket}:${client}`, lim, now);
          return secs ? { ok: false, retryAfter: secs, resetAt: now + secs * 1000 } : null;
        }
        const p = await peek(redis, `rl:${app}:${bucket}:${client}`, lim.limit, now);
        return p.ok ? null : { ok: false, retryAfter: Math.max(1, Math.ceil((p.resetAt - now) / 1000)), resetAt: p.resetAt };
      } catch (err) {
        return busyVerdict(now, err);
      }
    },
  };
}

const APP = 'splitsnap';
const limits = createLimits(APP);

export function check(req: Request, name: keyof typeof LIMITS) {
  return limits.hit(name, clientIp(req), LIMITS[name]);
}

export function isBlocked(req: Request, name: keyof typeof LIMITS) {
  return limits.blocked(name, clientIp(req), LIMITS[name]);
}

export function busy() {
  return Response.json({ error: 'The service is busy, try again in a minute.' }, { status: 503, headers: { 'retry-after': '60' } });
}

export function tooMany(verdict: Rejection) {
  if (verdict.busy) return busy();
  const minutes = Math.ceil(verdict.retryAfter / 60);
  return Response.json(
    {
      error: `Scan limit reached. This demo runs on my own API credits, so it allows a few scans per hour. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or use a sample receipt.`,
      resetAt: new Date(verdict.resetAt).toISOString(),
    },
    { status: 429, headers: { 'retry-after': String(verdict.retryAfter) } },
  );
}
