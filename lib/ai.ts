import { APIConnectionError, APIError } from 'openai';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/** GROQ_API_KEY first, then GROQ_API_KEYS (comma or newline separated), trimmed and without duplicates. */
export function groqKeys(env: Record<string, string | undefined> = process.env): string[] {
  const all = [env.GROQ_API_KEY ?? '', ...(env.GROQ_API_KEYS ?? '').split(/[,\n]/)].map((k) => k.trim());
  return [...new Set(all.filter(Boolean))];
}

/** Rate limits (429, and 413 for one request over Groq's per-minute token budget), server errors
 *  and network failures are worth one retry on another provider. */
export function shouldFallback(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return status === 429 || status === 413 || status >= 500;
  return err instanceof APIConnectionError;
}

/** Runs the Groq call, then the OpenAI call once if Groq failed in a way another provider might not. */
export async function withFallback<T>(
  groq: () => Promise<T>,
  openai: (() => Promise<T>) | null,
  warn: (message: string) => void = console.warn,
): Promise<T> {
  try {
    return await groq();
  } catch (err) {
    if (!openai || !shouldFallback(err)) throw err;
    warn(`Groq failed (${err instanceof Error ? err.message : String(err)}), retrying with OpenAI`);
    return openai();
  }
}

const HOUR = 3_600_000;
const UNIT_MS: Record<string, number> = { h: HOUR, m: 60_000, s: 1000, ms: 1 };

/** How long to rest a Groq key after this error: retry-after on 429/413 (kept between 1s and 1 day), an hour on 401/403, else 0. */
export function cooldownMs(err: unknown): number {
  const e = err as { status?: number; headers?: Headers; message?: string } | null;
  if (e?.status === 401 || e?.status === 403) return HOUR;
  if (e?.status !== 429 && e?.status !== 413) return 0;
  const header = Number(e.headers?.get?.('retry-after')) * 1000;
  const wait = e.message?.match(/try again in ([\d.hms]+)/)?.[1] ?? '';
  const parsed = [...wait.matchAll(/([\d.]+)(ms|h|m|s)/g)].reduce((t, [, n, unit]) => t + Number(n) * UNIT_MS[unit], 0);
  const ms = header > 0 ? header : parsed;
  return ms > 0 ? Math.min(Math.max(ms, 1000), 86_400_000) : 60_000;
}

const cooldowns = new WeakMap<object, { until: number; status: number }>();

/** Runs with each Groq client in turn (next on 429, 413, 401, 403), skipping ones on cooldown.
 *  Throws the last error so withFallback can decide on OpenAI. */
export async function withKeys<C extends object, T>(
  clients: C[],
  run: (client: C) => Promise<T>,
  warn: (message: string) => void = console.warn,
  now: () => number = Date.now,
): Promise<T> {
  let last: unknown = new Error('No Groq API keys configured');
  for (const [i, client] of clients.entries()) {
    const resting = cooldowns.get(client);
    if (resting && resting.until > now()) {
      last = APIError.generate(resting.status, undefined, `Groq key ${i + 1} of ${clients.length} is cooling down`, new Headers());
      continue;
    }
    try {
      return await run(client);
    } catch (err) {
      if (!shouldFallback(err) && !cooldownMs(err)) throw err;
      last = err;
      const wait = cooldownMs(err);
      warn(`Groq key ${i + 1} of ${clients.length} failed (${(err as { status?: number }).status ?? 'network'})`);
      // A 5xx or network error is Groq itself, not this key, so the other keys are skipped.
      if (!wait) break;
      cooldowns.set(client, { until: now() + wait, status: (err as { status: number }).status });
    }
  }
  throw last;
}
