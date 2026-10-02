import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExtraction, type ExtractedReceipt } from './extraction.ts';
import { reconcile } from './receipt.ts';

const base: ExtractedReceipt = {
  is_receipt: true, merchant: '  Tanuki   Ramen ', date: '2026-09-12', currency: 'gbp',
  items: [
    { name: 'Tonkotsu', quantity: 2, unit_price: 13.5, line_total: 27 },
    { name: 'Gyoza', quantity: 1, unit_price: null, line_total: 6.95 },
    { name: 'Promo', quantity: 1, unit_price: null, line_total: -1.0 },
  ],
  subtotal: 32.95, tax: 5.49, tax_included: true, tip: null, service_charge: 4.12,
  discounts: [{ label: 'Staff', amount: -2.5 }], total: 34.57, warnings: [],
};

test('converts decimals to minor units and cleans strings', () => {
  const r = normalizeExtraction(base);
  assert.equal(r.merchant, 'Tanuki Ramen');
  assert.equal(r.currency, 'GBP');
  assert.deepEqual(r.items.map((i) => [i.id, i.qty, i.unit, i.total]), [
    ['i1', 2, 1350, 2700], ['i2', 1, 695, 695], ['i3', 1, -100, -100],
  ]);
  assert.equal(r.tip, 0);
  const multi = normalizeExtraction({ ...base, items: [{ name: 'Asahi', quantity: 2, unit_price: null, line_total: 11.6 }] });
  assert.equal(multi.items[0].unit, null, 'no invented unit price for multi-quantity lines');
  assert.equal(r.service, 412);
  assert.equal(r.discount, 250, 'discount is always positive');
  assert.equal(r.total, 3457);
  assert.equal(reconcile(r).residual, 0);
});

test('unknown currency falls back to USD with a visible note', () => {
  const r = normalizeExtraction({ ...base, currency: 'dollars' });
  assert.equal(r.currency, 'USD');
  assert.match(r.notes.at(-1)!, /not recognised/);
});

test('zero-decimal currency and bad dates', () => {
  const r = normalizeExtraction({ ...base, currency: 'JPY', date: '12/09/2026', items: [{ name: '', quantity: 0, unit_price: 980, line_total: 980 }] });
  assert.equal(r.items[0].total, 980);
  assert.equal(r.items[0].qty, 1);
  assert.equal(r.items[0].name, 'Item 1');
  assert.equal(r.date, null);
});
