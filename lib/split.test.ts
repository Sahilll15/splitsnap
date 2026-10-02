import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, computeSplit, evenSplit, settleUp, COMPONENTS, DEFAULT_OPTIONS, type Assignments, type Person, type SplitOptions } from './split.ts';
import { reconcile, type Item, type Receipt } from './receipt.ts';

const people = (n: number): Person[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#000000' }));
const it = (id: string, total: number): Item => ({ id, name: id, qty: 1, unit: total, total });
function rec(items: Item[], over: Partial<Receipt> = {}): Receipt {
  const sum = items.reduce((s, i) => s + i.total, 0);
  const base = { tax: 0, tip: 0, service: 0, discount: 0, taxIncluded: false, ...over };
  return {
    merchant: 'T', date: null, currency: 'USD', items, subtotal: sum, notes: [],
    total: sum - base.discount + (base.taxIncluded ? 0 : base.tax) + base.tip + base.service,
    ...base,
  } as Receipt;
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('allocate: shares sum exactly and stay within one unit of the exact share', () => {
  const rnd = mulberry32(7);
  for (let n = 0; n < 5000; n++) {
    const k = 1 + Math.floor(rnd() * 8);
    const amount = Math.floor(rnd() * 200001) - 100000;
    const weights = Array.from({ length: k }, () => (rnd() < 0.15 ? 0 : Math.floor(rnd() * 50000)));
    const out = allocate(amount, weights);
    assert.equal(sum(out), amount);
    const W = sum(weights);
    out.forEach((v, i) => {
      const exact = W === 0 ? amount / k : (amount * weights[i]) / W;
      assert.ok(Math.abs(v - exact) < 1, `share ${v} vs exact ${exact}`);
    });
  }
});

test('allocate: worked examples and the tie-break rule', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(200, [1, 1, 1]), [67, 67, 66]);
  assert.deepEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(allocate(10, [1, 2, 3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(allocate(1, [1, 1]), [1, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [3, 2]);
  assert.deepEqual(allocate(0, [3, 5]), [0, 0]);
  assert.deepEqual(allocate(7, [0, 5, 0]), [0, 7, 0]);
  // Largest remainder beats index order: 10 * 2/3 = 6.67 gets the extra unit, not index 0.
  assert.deepEqual(allocate(10, [1, 2]), [3, 7]);
  assert.deepEqual(allocate(0, []), []);
});

test('allocate: rejects bad input instead of silently losing money', () => {
  assert.throws(() => allocate(1.5, [1]));
  assert.throws(() => allocate(10, [-1, 2]));
  assert.throws(() => allocate(10, [0.5]));
  assert.throws(() => allocate(10, []));
});

test('allocate: no float overflow with large amounts and weights', () => {
  const out = allocate(999_999_999_999, [999_999_999, 1, 333_333_333]);
  assert.equal(sum(out), 999_999_999_999);
});

test('evenSplit differs by at most one unit', () => {
  for (let amount = -500; amount <= 500; amount += 17) {
    for (let n = 1; n <= 9; n++) {
      const out = evenSplit(amount, n);
      assert.equal(sum(out), amount);
      assert.ok(Math.max(...out) - Math.min(...out) <= 1);
    }
  }
});

test('single owner items and proportional tax and tip', () => {
  const r = rec([it('a', 3000), it('b', 1000)], { tax: 400, tip: 800 });
  const out = computeSplit(r, people(2), { a: ['p1'], b: ['p2'] });
  const [p1, p2] = out.people;
  assert.deepEqual([p1.items, p1.tax, p1.tip, p1.total], [3000, 300, 600, 3900]);
  assert.deepEqual([p2.items, p2.tax, p2.tip, p2.total], [1000, 100, 200, 1300]);
  assert.equal(out.payTotal, 5200);
});

test('even mode splits tax and tip equally among people with items', () => {
  const r = rec([it('a', 3000), it('b', 1000)], { tax: 401, tip: 800 });
  const opts: SplitOptions = { ...DEFAULT_OPTIONS, tax: 'even', tip: 'even' };
  const out = computeSplit(r, people(3), { a: ['p1'], b: ['p2'] }, opts);
  assert.deepEqual(out.people.map((s) => s.tax), [201, 200, 0]);
  assert.deepEqual(out.people.map((s) => s.tip), [400, 400, 0]);
  assert.equal(out.people[2].total, 0);
});

test('a shared item is split evenly and the leftover cent goes to whoever has less', () => {
  const r = rec([it('big', 2000), it('shared', 1000)]);
  const out = computeSplit(r, people(3), { big: ['p1'], shared: ['p1', 'p2', 'p3'] });
  // p1 already has 20.00, so the extra cent of 10.00 / 3 goes to p2.
  assert.deepEqual(out.people.map((s) => s.items), [2333, 334, 333]);
  assert.equal(sum(out.people.map((s) => s.total)), 3000);
});

test('leftover cents across many shared items do not all land on one person', () => {
  const items = Array.from({ length: 9 }, (_, i) => it(`s${i}`, 100));
  const assign: Assignments = Object.fromEntries(items.map((x) => [x.id, ['p1', 'p2', 'p3']]));
  const out = computeSplit(rec(items), people(3), assign);
  assert.deepEqual(out.people.map((s) => s.items), [300, 300, 300]);
});

test('assignment order inside an item does not change the result', () => {
  const r = rec([it('a', 1001), it('b', 777)], { tax: 99, tip: 150 });
  const one = computeSplit(r, people(3), { a: ['p1', 'p2', 'p3'], b: ['p3', 'p1'] });
  const two = computeSplit(r, people(3), { a: ['p3', 'p1', 'p2', 'p2'], b: ['p1', 'p3'] });
  assert.deepEqual(one, two);
});

test('item lines per person add up to their items component', () => {
  const r = rec([it('a', 1001), it('b', 777), it('c', 5)]);
  const out = computeSplit(r, people(3), { a: ['p1', 'p2', 'p3'], b: ['p3', 'p1'], c: ['p2'] });
  for (const s of out.people) assert.equal(sum(s.lines.map((l) => l.amount)), s.items);
  assert.equal(out.people[0].lines.find((l) => l.itemId === 'a')!.of, 3);
});

test('unassigned items are tracked and still part of the total', () => {
  const r = rec([it('a', 1000), it('b', 500)], { tax: 150 });
  const out = computeSplit(r, people(2), { a: ['p1'] });
  assert.deepEqual(out.unassignedItemIds, ['b']);
  assert.equal(out.unassigned.items, 500);
  assert.equal(out.unassigned.tax, 50);
  assert.equal(sum(out.people.map((s) => s.total)) + out.unassigned.total, out.payTotal);
});

test('nobody assigned: everything sits in unassigned', () => {
  const r = rec([it('a', 1000)], { tax: 80, tip: 200 });
  const out = computeSplit(r, people(2), {}, { tax: 'even', tip: 'even', service: 'even', discount: 'even' });
  assert.equal(out.unassigned.items, 1000);
  assert.equal(sum(out.people.map((s) => s.total)) + out.unassigned.total, 1280);
});

test('no people at all still balances', () => {
  const r = rec([it('a', 1000)], { tax: 80 });
  const out = computeSplit(r, [], { a: ['ghost'] });
  assert.equal(out.unassigned.total, 1080);
});

test('assignments to unknown people are ignored', () => {
  const out = computeSplit(rec([it('a', 1000)]), people(1), { a: ['p1', 'nobody'] });
  assert.equal(out.people[0].items, 1000);
});

test('discounts reduce shares proportionally and can be split evenly', () => {
  const r = rec([it('a', 3000), it('b', 1000)], { discount: 400 });
  const prop = computeSplit(r, people(2), { a: ['p1'], b: ['p2'] });
  assert.deepEqual(prop.people.map((s) => s.discount), [-300, -100]);
  const even = computeSplit(r, people(2), { a: ['p1'], b: ['p2'] }, { ...DEFAULT_OPTIONS, discount: 'even' });
  assert.deepEqual(even.people.map((s) => s.discount), [-200, -200]);
  assert.equal(sum(prop.people.map((s) => s.total)), 3600);
});

test('tax-inclusive receipts allocate no extra tax', () => {
  const r = rec([it('a', 1200), it('b', 1200)], { tax: 400, taxIncluded: true, service: 300 });
  const out = computeSplit(r, people(2), { a: ['p1'], b: ['p2'] });
  assert.deepEqual(out.people.map((s) => s.tax), [0, 0]);
  assert.deepEqual(out.people.map((s) => s.service), [150, 150]);
  assert.equal(out.payTotal, 2700);
});

test('an unreconciled receipt still splits to the printed total via an adjustment', () => {
  const r = { ...rec([it('a', 1000), it('b', 1000)], { tax: 200 }), total: 2203 };
  assert.equal(reconcile(r).residual, 3);
  const out = computeSplit(r, people(2), { a: ['p1'], b: ['p2'] });
  assert.deepEqual(out.people.map((s) => s.adjust), [2, 1]);
  assert.equal(sum(out.people.map((s) => s.total)), 2203);
});

test('a person with only a negative line does not get a negative weight', () => {
  const r = rec([it('a', 2000), it('promo', -500)], { tax: 150 });
  const out = computeSplit(r, people(2), { a: ['p1'], promo: ['p2'] });
  assert.deepEqual(out.people.map((s) => s.tax), [150, 0]);
  assert.equal(sum(out.people.map((s) => s.total)), 1650);
});

test('zero-decimal currencies split in whole units', () => {
  const r = { ...rec([it('a', 1000), it('b', 1001)], { tax: 200 }), currency: 'JPY' };
  const out = computeSplit(r, people(3), { a: ['p1', 'p2', 'p3'], b: ['p1', 'p2', 'p3'] });
  out.people.forEach((s) => assert.ok(Number.isInteger(s.total)));
  assert.equal(sum(out.people.map((s) => s.total)), 2201);
});

test('settleUp: everyone except the payer pays the payer their share', () => {
  const r = rec([it('a', 1000), it('b', 2000), it('c', 3000)]);
  const out = computeSplit(r, people(3), { a: ['p1'], b: ['p2'], c: ['p3'] });
  assert.deepEqual(settleUp(out, 'p2'), [
    { from: 'p1', to: 'p2', amount: 1000 },
    { from: 'p3', to: 'p2', amount: 3000 },
  ]);
  assert.deepEqual(settleUp(out, null), []);
});

test('property: random receipts always balance to the cent and are deterministic', () => {
  const rnd = mulberry32(2026);
  const modes = ['proportional', 'even'] as const;
  for (let n = 0; n < 3000; n++) {
    const nPeople = Math.floor(rnd() * 7);
    const ps = people(nPeople);
    const items: Item[] = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => {
      const neg = rnd() < 0.08;
      const total = (neg ? -1 : 1) * Math.floor(rnd() * 9000 + 1);
      return it(`i${i}`, total);
    });
    const assign: Assignments = {};
    for (const x of items) {
      if (rnd() < 0.1) continue;
      assign[x.id] = ps.filter(() => rnd() < 0.45).map((p) => p.id);
    }
    const r = rec(items, {
      tax: Math.floor(rnd() * 1500), tip: rnd() < 0.5 ? 0 : Math.floor(rnd() * 3000),
      service: rnd() < 0.7 ? 0 : Math.floor(rnd() * 900), discount: rnd() < 0.7 ? 0 : Math.floor(rnd() * 800),
      taxIncluded: rnd() < 0.2,
    });
    if (rnd() < 0.2) r.total = (r.total ?? 0) + Math.floor(rnd() * 21) - 10;
    if (rnd() < 0.1) r.total = null;
    const opts: SplitOptions = {
      tax: modes[Math.floor(rnd() * 2)], tip: modes[Math.floor(rnd() * 2)],
      service: modes[Math.floor(rnd() * 2)], discount: modes[Math.floor(rnd() * 2)],
    };
    const out = computeSplit(r, ps, assign, opts);
    const all = [...out.people, out.unassigned];
    assert.equal(sum(all.map((s) => s.total)), out.payTotal, `case ${n}`);
    assert.equal(out.componentTotals.items, sum(items.map((x) => x.total)));
    assert.equal(out.componentTotals.tax, r.taxIncluded ? 0 : r.tax);
    assert.equal(out.componentTotals.tip, r.tip);
    assert.equal(out.componentTotals.service, r.service);
    assert.equal(out.componentTotals.discount, 0 - r.discount);
    assert.equal(sum(COMPONENTS.map((c) => out.componentTotals[c])), out.payTotal);
    for (const s of all) {
      assert.ok(Number.isSafeInteger(s.total));
      assert.equal(s.total, sum(COMPONENTS.map((c) => s[c])));
    }
    assert.deepEqual(computeSplit(r, ps, assign, opts), out, 'deterministic');
  }
});

test('property: an even item split never differs by more than one unit between sharers', () => {
  const rnd = mulberry32(99);
  for (let n = 0; n < 2000; n++) {
    const total = Math.floor(rnd() * 100000) - 2000;
    const k = 1 + Math.floor(rnd() * 8);
    const out = computeSplit(rec([it('x', total)]), people(k), { x: people(k).map((p) => p.id) });
    const shares = out.people.map((s) => s.items);
    assert.equal(sum(shares), total);
    assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
  }
});
