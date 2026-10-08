import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai';
import { shouldFallback, withFallback } from './ai.ts';

const apiError = (status: number) => APIError.generate(status, { error: { message: 'x' } }, 'x', new Headers());
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
