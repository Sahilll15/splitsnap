import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peek, take } from '../app/server/redis.ts';
import { clientIp, createLimiter, createLimits, normalizeIp, tooMany } from '../app/server/ratelimit.ts';
import { fakeRedis } from './fake-redis.ts';

const lim = { limit: 2, windowMs: 60_000 };

test('take counts up to the limit and the first hit opens the window', async () => {
  const f = fakeRedis({ now: 1000 });
  const a = await take(f.redis, 'k', 2, 60_000, 1000);
  assert.deepEqual(a, { ok: true, remaining: 1, resetAt: 61_000 });
  f.clock.now = 31_000;
  const b = await take(f.redis, 'k', 2, 60_000, 31_000);
  assert.deepEqual(b, { ok: true, remaining: 0, resetAt: 61_000 });
});

test('take over the limit is refused and does not increment', async () => {
  const f = fakeRedis({ now: 0 });
  await take(f.redis, 'k', 2, 60_000, 0);
  await take(f.redis, 'k', 2, 60_000, 0);
  f.clock.now = 10;
  for (let i = 0; i < 3; i++) {
    const r = await take(f.redis, 'k', 2, 60_000, 10);
    assert.deepEqual(r, { ok: false, remaining: 0, resetAt: 60_000 });
  }
  assert.equal(f.value('k'), 2);
});

test('the window resets once the key expires', async () => {
  const f = fakeRedis({ now: 0 });
  await take(f.redis, 'k', 1, 1000, 0);
  assert.equal((await take(f.redis, 'k', 1, 1000, 500)).ok, false);
  f.clock.now = 1000;
  assert.deepEqual(await take(f.redis, 'k', 1, 1000, 1000), { ok: true, remaining: 0, resetAt: 2000 });
});

test('peek reports the same counter and never increments', async () => {
  const f = fakeRedis({ now: 0 });
  assert.deepEqual(await peek(f.redis, 'k', 2, 0), { ok: true, remaining: 2, resetAt: 0 });
  await take(f.redis, 'k', 2, 60_000, 0);
  f.clock.now = 5000;
  assert.deepEqual(await peek(f.redis, 'k', 2, 5000), { ok: true, remaining: 1, resetAt: 60_000 });
  await take(f.redis, 'k', 2, 60_000, 5000);
  assert.deepEqual(await peek(f.redis, 'k', 2, 5000), { ok: false, remaining: 0, resetAt: 60_000 });
  assert.equal(f.value('k'), 2);
});

test('createLimits uses namespaced keys and agrees between hit and blocked', async () => {
  const f = fakeRedis({ now: 0 });
  const l = createLimits('splitsnap', () => f.redis, undefined, () => f.clock.now);
  assert.equal(await l.blocked('scan', '1.2.3.4', lim), null);
  assert.deepEqual(await l.hit('scan', '1.2.3.4', lim), { ok: true, remaining: 1, resetAt: 60_000 });
  assert.equal(f.value('rl:splitsnap:scan:1.2.3.4'), 1);
  await l.hit('scan', '1.2.3.4', lim);
  f.clock.now = 30_000;
  const over = await l.hit('scan', '1.2.3.4', lim);
  assert.deepEqual(over, { ok: false, retryAfter: 30, resetAt: 60_000 });
  assert.deepEqual(await l.blocked('scan', '1.2.3.4', lim), over);
  assert.equal(f.value('rl:splitsnap:scan:1.2.3.4'), 2);
});

test('a failing Redis fails closed with a 503', async () => {
  const f = fakeRedis();
  f.fail();
  const l = createLimits('splitsnap', () => f.redis);
  const v = await l.hit('scan', '1.2.3.4', lim);
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.busy);
  assert.ok(!v.ok && (await l.blocked('scan', '1.2.3.4', lim))?.busy);
  if (!v.ok) assert.equal(tooMany(v).status, 503);
});

test('without Redis the in-memory limiter is used', async () => {
  let now = 0;
  const l = createLimits('splitsnap', () => null, undefined, () => now);
  assert.equal((await l.hit('turn', 'a', lim)).ok, true);
  assert.equal((await l.hit('turn', 'a', lim)).ok, true);
  now = 10;
  const v = await l.hit('turn', 'a', lim);
  assert.ok(!v.ok && v.retryAfter === 60 && v.resetAt === 60_000);
  assert.ok(await l.blocked('turn', 'a', lim));
});

test('normalizeIp canonicalizes and groups IPv6 by /64', () => {
  assert.equal(normalizeIp(' 203.0.113.7 '), '203.0.113.7');
  assert.equal(normalizeIp('203.0.113.7:5555'), '203.0.113.7');
  assert.equal(normalizeIp('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(normalizeIp('2001:db8:1:2:aaaa::1'), normalizeIp('2001:0db8:0001:0002:ffff:ffff:ffff:ffff'));
  assert.notEqual(normalizeIp('2001:db8:1:2::1'), normalizeIp('2001:db8:1:3::1'));
  assert.equal(normalizeIp('not-an-ip'), 'invalid');
});

test('clientIp prefers x-real-ip, then the last x-forwarded-for hop', () => {
  const h = (headers: Record<string, string>) => new Request('http://x', { headers });
  assert.equal(clientIp(h({ 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '1.1.1.1' })), '198.51.100.1');
  assert.equal(clientIp(h({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 198.51.100.2' })), '198.51.100.2');
  assert.equal(clientIp(h({})), 'unknown');
});

test('in-memory limiter evicts old keys instead of clearing active counters', () => {
  const l = createLimiter(100);
  const one = { limit: 1, windowMs: 60_000 };
  assert.equal(l.hit('attacker', one, 0).ok, true);
  for (let i = 0; i < 99; i++) l.hit(`k${i}`, one, 1);
  l.hit('attacker', one, 2);
  for (let i = 99; i < 150; i++) l.hit(`k${i}`, one, 3);
  assert.ok(l.size() <= 100);
  assert.ok(l.blocked('attacker', one, 4) > 0);
});
