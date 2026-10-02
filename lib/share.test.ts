import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeState, encodeState, MAX_ENCODED, type SplitState } from './share.ts';
import { computeSplit } from './split.ts';
import { summaryText } from './summary.ts';

const state: SplitState = {
  receipt: {
    merchant: 'Osteria "Lume" & Co', date: '2026-09-30', currency: 'USD',
    items: [
      { id: 'i1', name: 'Cacio e pepe', qty: 2, unit: 1800, total: 3600 },
      { id: 'i2', name: 'Burrata', qty: 1, unit: null, total: 1400 },
      { id: 'i3', name: 'Café crème', qty: 0.5, unit: 999, total: 500 },
    ],
    subtotal: 5500, tax: 488, taxIncluded: false, tip: 1100, service: 0, discount: 0, total: 7088, notes: [],
  },
  people: [
    { id: 'p1', name: 'Ana', color: '#ff7a59' },
    { id: 'p2', name: 'Ben', color: '#3b82f6' },
  ],
  assignments: { i1: ['p1', 'p2'], i2: ['p2'], i3: ['p1'] },
  options: { tax: 'proportional', tip: 'even', service: 'proportional', discount: 'proportional' },
  payerId: 'p2',
};

test('encode then decode returns the same split', async () => {
  const encoded = await encodeState(state);
  assert.match(encoded, /^v1\.[A-Za-z0-9_-]+$/);
  const back = await decodeState(encoded);
  assert.deepEqual(back, state);
  assert.deepEqual(
    computeSplit(back.receipt, back.people, back.assignments, back.options),
    computeSplit(state.receipt, state.people, state.assignments, state.options),
  );
});

test('decoding garbage throws instead of rendering a broken split', async () => {
  await assert.rejects(decodeState('nope'));
  await assert.rejects(decodeState('v2.abc'));
  await assert.rejects(decodeState('v1.!!!!'));
  await assert.rejects(decodeState('v1.' + 'A'.repeat(MAX_ENCODED + 1)));
  const valid = await encodeState(state);
  await assert.rejects(decodeState(valid.slice(0, -6)));
});

test('decoding rejects well-formed payloads with bad values', async () => {
  const bad = { ...state, receipt: { ...state.receipt, currency: 'dollars' } };
  await assert.rejects(decodeState(await encodeState(bad)));
});

test('summary text lists each person and who pays whom', () => {
  const r = computeSplit(state.receipt, state.people, state.assignments, state.options);
  const text = summaryText(state.receipt, state.people, r, 'p2', 'https://x.test/#s=v1.abc');
  assert.match(text, /Osteria "Lume" & Co, 2026-09-30: \$70\.88 total/);
  assert.match(text, /Ana: \$[\d.]+ \(2 items\)/);
  assert.match(text, /Ana pays Ben \$/);
  assert.match(text, /Details: https:\/\/x\.test/);
});
