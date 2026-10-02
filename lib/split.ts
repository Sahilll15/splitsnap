import { reconcile, type Receipt } from './receipt.ts';

export type Person = { id: string; name: string; color: string };
export type Assignments = Record<string, string[]>;
export type Mode = 'proportional' | 'even';
export type SplitOptions = { tax: Mode; tip: Mode; service: Mode; discount: Mode };

export const DEFAULT_OPTIONS: SplitOptions = {
  tax: 'proportional',
  tip: 'proportional',
  service: 'proportional',
  discount: 'proportional',
};

export const COMPONENTS = ['items', 'discount', 'service', 'tax', 'tip', 'adjust'] as const;
export type Component = (typeof COMPONENTS)[number];

export type ItemShare = { itemId: string; amount: number; of: number };

export type Share = Record<Component, number> & {
  id: string;
  total: number;
  lines: ItemShare[];
};

export type SplitResult = {
  people: Share[];
  /** Items nobody has claimed yet, plus their proportional cut of the charges. */
  unassigned: Share;
  unassignedItemIds: string[];
  payTotal: number;
  componentTotals: Record<Component, number>;
};

const UNASSIGNED = '__unassigned__';

/** Floor division that works for negative numerators (BigInt `/` truncates toward zero). */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
}

/**
 * Split an integer `amount` across non-negative integer `weights` with the largest
 * remainder method. Shares always sum to `amount`. Leftover units go to the largest
 * fractional remainders; ties go to the lower index. A negative amount is split as its
 * absolute value and negated, so the rule is symmetric.
 */
export function allocate(amount: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(amount)) throw new Error('amount must be a safe integer');
  if (weights.length === 0) {
    if (amount !== 0) throw new Error('cannot allocate a non-zero amount to nobody');
    return [];
  }
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error('weights must be non-negative safe integers');
  }
  if (amount < 0) return allocate(-amount, weights).map((v) => (v === 0 ? 0 : -v));
  let ws = weights.map(BigInt);
  let W = ws.reduce((a, b) => a + b, 0n);
  if (W === 0n) {
    ws = weights.map(() => 1n);
    W = BigInt(weights.length);
  }
  const A = BigInt(amount);
  const shares = ws.map((w) => floorDiv(A * w, W));
  const rems = ws.map((w, i) => ({ i, r: A * w - shares[i] * W }));
  let left = A - shares.reduce((a, b) => a + b, 0n);
  rems.sort((x, y) => (x.r === y.r ? x.i - y.i : x.r > y.r ? -1 : 1));
  for (let k = 0; left > 0n; k++, left--) shares[rems[k].i] += 1n;
  return shares.map(Number);
}

export function evenSplit(amount: number, n: number): number[] {
  return allocate(amount, Array.from({ length: n }, () => 1));
}

function emptyShare(id: string): Share {
  return { id, items: 0, discount: 0, service: 0, tax: 0, tip: 0, adjust: 0, total: 0, lines: [] };
}

/**
 * Exact per-person totals in minor units. Invariants (covered by tests):
 * every component column sums to its receipt amount, and all shares sum to the pay total.
 */
export function computeSplit(
  receipt: Receipt,
  people: Person[],
  assignments: Assignments,
  options: SplitOptions = DEFAULT_OPTIONS,
): SplitResult {
  const rec = reconcile(receipt);
  const order = new Map(people.map((p, i) => [p.id, i]));
  const shares = people.map((p) => emptyShare(p.id));
  const unassigned = emptyShare(UNASSIGNED);
  const unassignedItemIds: string[] = [];

  for (const item of receipt.items) {
    const ids = [...new Set(assignments[item.id] ?? [])].filter((id) => order.has(id));
    ids.sort((a, b) => order.get(a)! - order.get(b)!);
    if (ids.length === 0) {
      unassigned.items += item.total;
      unassigned.lines.push({ itemId: item.id, amount: item.total, of: 1 });
      unassignedItemIds.push(item.id);
      continue;
    }
    // Even split; leftover cents go to whoever has the lowest running item total, then list order.
    const k = ids.length;
    const base = Number(floorDiv(BigInt(item.total), BigInt(k)));
    let extra = item.total - base * k;
    const parts = new Map(ids.map((id) => [id, base]));
    const byNeed = [...ids].sort((a, b) => {
      const d = shares[order.get(a)!].items - shares[order.get(b)!].items;
      return d !== 0 ? d : order.get(a)! - order.get(b)!;
    });
    for (let i = 0; extra > 0; i++, extra--) parts.set(byNeed[i], parts.get(byNeed[i])! + 1);
    for (const id of ids) {
      const s = shares[order.get(id)!];
      s.items += parts.get(id)!;
      s.lines.push({ itemId: item.id, amount: parts.get(id)!, of: k });
    }
  }

  // Charges are shared by people who ordered something; if nobody has, by everyone.
  const active = shares.filter((s) => s.lines.length > 0);
  const evenGroup = active.length > 0 ? active : shares;
  const propGroup = [...shares, unassigned];

  const spread = (component: Exclude<Component, 'items'>, amount: number, mode: Mode) => {
    if (amount === 0) return;
    if (mode === 'even' && evenGroup.length > 0) {
      evenSplit(amount, evenGroup.length).forEach((v, i) => (evenGroup[i][component] += v));
      return;
    }
    const weights = propGroup.map((s) => Math.max(0, s.items));
    const usable = weights.some((w) => w > 0);
    const group = usable ? propGroup : evenGroup.length ? evenGroup : [unassigned];
    allocate(amount, usable ? weights : group.map(() => 1)).forEach((v, i) => (group[i][component] += v));
  };

  spread('discount', -receipt.discount, options.discount);
  spread('service', receipt.service, options.service);
  spread('tax', receipt.taxIncluded ? 0 : receipt.tax, options.tax);
  spread('tip', receipt.tip, options.tip);
  spread('adjust', rec.residual, 'proportional');

  for (const s of [...shares, unassigned]) {
    s.total = s.items + s.discount + s.service + s.tax + s.tip + s.adjust;
  }

  const componentTotals = Object.fromEntries(
    COMPONENTS.map((c) => [c, [...shares, unassigned].reduce((a, s) => a + s[c], 0)]),
  ) as Record<Component, number>;

  return { people: shares, unassigned, unassignedItemIds, payTotal: rec.payTotal, componentTotals };
}

export type Transfer = { from: string; to: string; amount: number };

/** Everyone pays the payer back their share. */
export function settleUp(result: SplitResult, payerId: string | null): Transfer[] {
  if (!payerId) return [];
  return result.people
    .filter((s) => s.id !== payerId && s.total !== 0)
    .map((s) => ({ from: s.id, to: payerId, amount: s.total }));
}
