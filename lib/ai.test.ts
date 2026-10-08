import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai';
import { cooldownMs, groqKeys, shouldFallback, withFallback, withKeys } from './ai.ts';

const apiError = (status: number, message = 'x', headers = new Headers()) => APIError.generate(status, { error: { message } }, message, headers);
const quiet = () => {};

test('falls back on rate limits, oversized requests, server errors and network failures only', () => {
  for (const s of [413, 429, 500, 502, 503]) assert.equal(shouldFallback(apiError(s)), true, String(s));
  for (const s of [400, 401, 404, 422]) assert.equal(shouldFallback(apiError(s)), false, String(s));
  assert.equal(shouldFallback(new APIConnectionError({ message: 'reset' })), true);
  assert.equal(shouldFallback(new APIConnectionTimeoutError()), true);
  assert.equal(shouldFallback(new Error('bad json')), false);
  assert.equal(shouldFallback(null), false);
});

test('uses the Groq result when it succeeds', async () => {
  let openaiCalls = 0;
  const out = await withFallback(async () => 'groq', async () => (openaiCalls++, 'openai'), quiet);
  assert.equal(out, 'groq');
  assert.equal(openaiCalls, 0);
});

test('retries once with OpenAI after a Groq 429', async () => {
  let openaiCalls = 0;
  const out = await withFallback(async () => { throw apiError(429); }, async () => (openaiCalls++, 'openai'), quiet);
  assert.equal(out, 'openai');
  assert.equal(openaiCalls, 1);
});

test('rethrows when there is no OpenAI key or the error is not retryable', async () => {
  await assert.rejects(withFallback(async () => { throw apiError(503); }, null, quiet), { status: 503 });
  await assert.rejects(withFallback(async () => { throw apiError(400); }, async () => 'openai', quiet), { status: 400 });
});

test('an OpenAI failure after fallback surfaces as is', async () => {
  await assert.rejects(
    withFallback(async () => { throw apiError(429); }, async () => { throw apiError(401); }, quiet),
    { status: 401 },
  );
});

test('groqKeys merges GROQ_API_KEY and GROQ_API_KEYS in order without duplicates', () => {
  assert.deepEqual(groqKeys({ GROQ_API_KEY: 'b', GROQ_API_KEYS: ' a, b\nc,,\n' }), ['b', 'a', 'c']);
  assert.deepEqual(groqKeys({ GROQ_API_KEYS: 'x\r\ny' }), ['x', 'y']);
  assert.deepEqual(groqKeys({ GROQ_API_KEYS: ' , ' }), []);
  assert.deepEqual(groqKeys({}), []);
});

test('cooldownMs reads retry-after, then the "try again in" text, then defaults to 60s, kept between 1s and 1 day', () => {
  assert.equal(cooldownMs(apiError(429, 'x', new Headers({ 'retry-after': '7' }))), 7000);
  assert.equal(cooldownMs(apiError(429, 'Please try again in 6m6.7s. Need more tokens?')), 366_700);
  assert.equal(cooldownMs(apiError(413, 'Please try again in 250ms')), 1000);
  assert.equal(cooldownMs(apiError(429, 'x', new Headers({ 'retry-after': '0.01' }))), 1000);
  assert.equal(cooldownMs(apiError(429, 'x', new Headers({ 'retry-after': '9999999' }))), 86_400_000);
  assert.equal(cooldownMs(apiError(429, 'Please try again in 30h0m0s')), 86_400_000);
  assert.equal(cooldownMs(apiError(429)), 60_000);
  assert.equal(cooldownMs(apiError(401)), 3_600_000);
  assert.equal(cooldownMs(apiError(403)), 3_600_000);
  assert.equal(cooldownMs(apiError(500)), 0);
  assert.equal(cooldownMs(apiError(400)), 0);
});

const keys = () => [{ name: 'k1' }, { name: 'k2' }];

test('a rate-limited key is skipped for the next key, and stays skipped while cooling down', async () => {
  const clients = keys();
  let clock = 1_000;
  const tried: string[] = [];
  const run = async (c: { name: string }) => {
    tried.push(c.name);
    if (c.name === 'k1') throw apiError(429, 'x', new Headers({ 'retry-after': '30' }));
    return c.name;
  };
  assert.equal(await withKeys(clients, run, quiet, () => clock), 'k2');
  assert.equal(await withKeys(clients, run, quiet, () => clock), 'k2');
  assert.deepEqual(tried, ['k1', 'k2', 'k2']);
  clock += 30_001;
  await withKeys(clients, run, quiet, () => clock);
  assert.deepEqual(tried, ['k1', 'k2', 'k2', 'k1', 'k2']);
});

test('a rejected key (401) moves on to the next key, a bad request stops at once', async () => {
  const tried: string[] = [];
  const out = await withKeys(keys(), async (c) => {
    tried.push(c.name);
    if (c.name === 'k1') throw apiError(401);
    return c.name;
  }, quiet);
  assert.equal(out, 'k2');
  assert.deepEqual(tried, ['k1', 'k2']);
  await assert.rejects(withKeys(keys(), async () => { throw apiError(400); }, quiet), { status: 400 });
});

test('when every key is rate limited or cooling down, OpenAI answers', async () => {
  const clients = keys();
  const tried: string[] = [];
  const groq = () => withKeys(clients, async (c) => { tried.push(c.name); throw apiError(429); }, quiet);
  const openai = async () => (tried.push('openai'), 'openai');
  assert.equal(await withFallback(groq, openai, quiet), 'openai');
  assert.equal(await withFallback(groq, openai, quiet), 'openai');
  assert.deepEqual(tried, ['k1', 'k2', 'openai', 'openai']);
  await assert.rejects(withFallback(groq, null, quiet), { status: 429 });
});

test('a Groq 5xx goes straight to OpenAI without trying the other keys', async () => {
  const tried: string[] = [];
  const groq = () => withKeys(keys(), async (c) => { tried.push(c.name); throw apiError(503); }, quiet);
  assert.equal(await withFallback(groq, async () => (tried.push('openai'), 'openai'), quiet), 'openai');
  assert.deepEqual(tried, ['k1', 'openai']);
});
