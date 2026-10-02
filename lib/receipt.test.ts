import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLine, lineTolerance, reconcile, type Item, type Receipt } from './receipt.ts';

export function item(id: string, total: number, qty = 1, unit: number | null = total / qty, name = id): Item {
  return { id, name, qty, unit, total };
}

function receipt(over: Partial<Receipt> = {}): Receipt {
  const items = over.items ?? [item('a', 1200), item('b', 900, 2, 450), item('c', 650)];
  const sum = items.reduce((s, i) => s + i.total, 0);
  return {
    merchant: 'Test', date: '2026-10-01', currency: 'USD', items,
    subtotal: sum, tax: 245, taxIncluded: false, tip: 500, service: 0, discount: 0,
    total: sum + 245 + 500, notes: [], ...over,
  };
}

test('a clean receipt is high confidence with zero residual', () => {
  const r = reconcile(receipt());
  assert.equal(r.confidence, 'high');
  assert.equal(r.residual, 0);
  assert.equal(r.itemsSum, 2750);
  assert.equal(r.payTotal, 3495);
  assert.deepEqual(r.checks.map((c) => c.status), ['ok', 'ok', 'ok']);
});

test('line checks: exact, rounded unit price, mismatch, unchecked', () => {
  assert.equal(checkLine(item('x', 900, 2, 450)).status, 'ok');
  assert.equal(checkLine(item('x', 1000, 3, 333)).status, 'rounded');
  const bad = checkLine(item('x', 1250, 3, 450));
  assert.equal(bad.status, 'mismatch');
  assert.equal(bad.expected, 1350);
  assert.equal(bad.diff, -100);
  assert.equal(checkLine(item('x', 500, 1, null)).status, 'unchecked');
  assert.equal(checkLine(item('x', 500, 0, 500)).status, 'unchecked');
  assert.equal(checkLine(item('x', 501, 1, 500)).status, 'mismatch');
});

test('lineTolerance is zero for single items and grows with quantity', () => {
  assert.equal(lineTolerance(1), 0);
  assert.equal(lineTolerance(2), 1);
  assert.equal(lineTolerance(3), 2);
  assert.equal(lineTolerance(0.45), 1);
  assert.equal(lineTolerance(-1), 0);
});

test('a misread line is flagged and drops confidence to low', () => {
  const items = [item('a', 1200), { ...item('b', 900, 2, 450), total: 800 }, item('c', 650)];
  const r = reconcile(receipt({ items, subtotal: 2750, total: 3495 }));
  assert.equal(r.lines.b.status, 'mismatch');
  assert.equal(r.mismatchedLines, 1);
  assert.equal(r.confidence, 'low');
  const sub = r.checks.find((c) => c.key === 'subtotal')!;
  assert.equal(sub.status, 'mismatch');
  assert.equal(sub.diff, 100);
  // The chain from the printed subtotal still holds, so total is fine.
  assert.equal(r.checks.find((c) => c.key === 'total')!.status, 'ok');
  assert.equal(r.residual, 100);
});

test('subtotal hint names a duplicated line', () => {
  const items = [item('a', 1200), item('b', 900, 2, 450), item('c', 650), item('c2', 650, 1, 650, 'Fries')];
  const r = reconcile(receipt({ items, subtotal: 2750, total: 3495 }));
  const sub = r.checks.find((c) => c.key === 'subtotal')!;
  assert.equal(sub.diff, -650);
  assert.match(sub.hint!, /Fries/);
});

test('a discount already applied in the subtotal is recognized', () => {
  const r = reconcile(receipt({ discount: 300, subtotal: 2450, total: 2450 + 745 }));
  assert.equal(r.discountInSubtotal, true);
  assert.equal(r.checks.find((c) => c.key === 'subtotal')!.status, 'ok');
  assert.equal(r.checks.find((c) => c.key === 'total')!.status, 'ok');
  assert.equal(r.residual, 0);
});

test('a discount after the subtotal also reconciles', () => {
  const r = reconcile(receipt({ discount: 300, subtotal: 2750, total: 2450 + 745 }));
  assert.equal(r.discountInSubtotal, false);
  assert.equal(r.residual, 0);
  assert.equal(r.confidence, 'high');
});

test('tax-inclusive receipts do not add tax again', () => {
  const r = reconcile(receipt({ taxIncluded: true, tax: 458, tip: 0, total: 2750 }));
  assert.equal(r.residual, 0);
  assert.equal(r.confidence, 'high');
});

test('total hints: missing tip, tip not in printed total, tax included', () => {
  const tipMissing = reconcile(receipt({ tip: 0, total: 2750 + 245 + 500 }));
  assert.match(tipMissing.checks[2].hint!, /tip written in/);
  const tipNotInTotal = reconcile(receipt({ total: 2750 + 245 }));
  assert.match(tipNotInTotal.checks[2].hint!, /before the tip/);
  const taxInPrices = reconcile(receipt({ tip: 0, total: 2750 }));
  assert.match(taxInPrices.checks[2].hint!, /include tax/);
});

test('missing subtotal and total are skipped, not failed', () => {
  const r = reconcile(receipt({ subtotal: null, total: null }));
  assert.equal(r.checks[1].status, 'skipped');
  assert.equal(r.checks[2].status, 'skipped');
  assert.equal(r.payTotal, r.computedTotal);
  assert.equal(r.residual, 0);
  assert.equal(r.confidence, 'medium');
});

test('model notes alone make confidence medium', () => {
  assert.equal(reconcile(receipt({ notes: ['Bottom of receipt is blurry'] })).confidence, 'medium');
});

test('rounded unit prices make confidence medium, not low', () => {
  const items = [item('a', 1000, 3, 333)];
  const r = reconcile(receipt({ items, subtotal: 1000, tax: 0, tip: 0, total: 1000 }));
  assert.equal(r.lines.a.status, 'rounded');
  assert.equal(r.confidence, 'medium');
});

test('negative lines (item-level promos) count toward the subtotal', () => {
  const items = [item('a', 1200), item('promo', -200, 1, -200)];
  const r = reconcile(receipt({ items, subtotal: 1000, tax: 0, tip: 0, total: 1000 }));
  assert.equal(r.itemsSum, 1000);
  assert.equal(r.confidence, 'high');
});

test('residual is total minus what the lines add up to', () => {
  const r = reconcile(receipt({ total: 3500 }));
  assert.equal(r.residual, 5);
  assert.equal(r.confidence, 'low');
});

test('an empty receipt does not throw', () => {
  const r = reconcile(receipt({ items: [], subtotal: null, tax: 0, tip: 0, total: null }));
  assert.equal(r.itemsSum, 0);
  assert.equal(r.payTotal, 0);
  assert.equal(r.checks[0].status, 'skipped');
});
