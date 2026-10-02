import { lineAmount } from './money.ts';

/** Amounts are integer minor units. `discount` is a positive number that is subtracted. */
export type Item = {
  id: string;
  name: string;
  qty: number;
  unit: number | null;
  total: number;
};

export type Receipt = {
  merchant: string;
  date: string | null;
  currency: string;
  items: Item[];
  subtotal: number | null;
  tax: number;
  taxIncluded: boolean;
  tip: number;
  service: number;
  discount: number;
  total: number | null;
  notes: string[];
};

export type LineStatus = 'ok' | 'rounded' | 'mismatch' | 'unchecked';

export type LineCheck = {
  id: string;
  status: LineStatus;
  expected: number | null;
  diff: number;
};

export type CheckKey = 'lines' | 'subtotal' | 'total';
export type CheckStatus = 'ok' | 'mismatch' | 'skipped';

export type Check = {
  key: CheckKey;
  status: CheckStatus;
  expected: number | null;
  actual: number | null;
  diff: number;
  hint: string | null;
};

export type Confidence = 'high' | 'medium' | 'low';

export type Reconciliation = {
  lines: Record<string, LineCheck>;
  checks: Check[];
  itemsSum: number;
  /** Items minus discount plus every charge, built only from line items. */
  computedTotal: number;
  /** The amount the split must add up to: the printed total, or the computed one if none. */
  payTotal: number;
  /** payTotal minus computedTotal. Non-zero means the receipt does not add up. */
  residual: number;
  discountInSubtotal: boolean;
  confidence: Confidence;
  mismatchedLines: number;
};

/** A printed unit price may itself be rounded, so qty 3 at "3.33" for 10.00 is not an error. */
export function lineTolerance(qty: number): number {
  const q = Math.abs(qty);
  if (Number.isInteger(q) && q <= 1) return 0;
  return Math.max(1, Math.ceil(q * 0.5));
}

export function checkLine(item: Item): LineCheck {
  if (item.unit === null || !Number.isFinite(item.qty) || item.qty === 0) {
    return { id: item.id, status: 'unchecked', expected: null, diff: 0 };
  }
  const expected = lineAmount(item.qty, item.unit);
  const diff = item.total - expected;
  if (diff === 0) return { id: item.id, status: 'ok', expected, diff };
  const status = Math.abs(diff) <= lineTolerance(item.qty) ? 'rounded' : 'mismatch';
  return { id: item.id, status, expected, diff };
}

export function sumItems(items: Item[]): number {
  return items.reduce((acc, it) => acc + it.total, 0);
}

export function chargesTotal(r: Receipt): number {
  return (r.taxIncluded ? 0 : r.tax) + r.service + r.tip;
}

export function reconcile(r: Receipt): Reconciliation {
  const lines: Record<string, LineCheck> = {};
  let mismatchedLines = 0;
  let roundedLines = 0;
  for (const it of r.items) {
    const c = checkLine(it);
    lines[it.id] = c;
    if (c.status === 'mismatch') mismatchedLines++;
    if (c.status === 'rounded') roundedLines++;
  }

  const itemsSum = sumItems(r.items);
  const computedTotal = itemsSum - r.discount + chargesTotal(r);
  const checks: Check[] = [];

  checks.push({
    key: 'lines',
    status: mismatchedLines > 0 ? 'mismatch' : r.items.length ? 'ok' : 'skipped',
    expected: null,
    actual: null,
    diff: 0,
    hint:
      mismatchedLines > 0
        ? `${mismatchedLines} line${mismatchedLines === 1 ? '' : 's'} where qty x price does not match the line total.`
        : null,
  });

  let discountInSubtotal = false;
  if (r.subtotal === null) {
    checks.push({ key: 'subtotal', status: 'skipped', expected: itemsSum, actual: null, diff: 0, hint: 'No subtotal on the receipt.' });
  } else if (r.subtotal === itemsSum) {
    checks.push({ key: 'subtotal', status: 'ok', expected: itemsSum, actual: r.subtotal, diff: 0, hint: null });
  } else if (r.discount !== 0 && r.subtotal === itemsSum - r.discount) {
    discountInSubtotal = true;
    checks.push({ key: 'subtotal', status: 'ok', expected: itemsSum - r.discount, actual: r.subtotal, diff: 0, hint: 'Subtotal already includes the discount.' });
  } else {
    const diff = r.subtotal - itemsSum;
    checks.push({ key: 'subtotal', status: 'mismatch', expected: itemsSum, actual: r.subtotal, diff, hint: subtotalHint(r, diff) });
  }

  if (r.total === null) {
    checks.push({ key: 'total', status: 'skipped', expected: computedTotal, actual: null, diff: 0, hint: 'No total on the receipt, using the computed one.' });
  } else {
    // Chain from the printed subtotal so a misread item does not also fail this check.
    const base = r.subtotal ?? itemsSum;
    const expected = base - (discountInSubtotal ? 0 : r.discount) + chargesTotal(r);
    const diff = r.total - expected;
    checks.push({
      key: 'total',
      status: diff === 0 ? 'ok' : 'mismatch',
      expected,
      actual: r.total,
      diff,
      hint: diff === 0 ? null : totalHint(r, diff),
    });
  }

  const payTotal = r.total ?? computedTotal;
  const residual = payTotal - computedTotal;
  const anyMismatch = checks.some((c) => c.status === 'mismatch') || residual !== 0;
  const anySkipped = checks.some((c) => c.status === 'skipped');
  const confidence: Confidence = anyMismatch
    ? 'low'
    : anySkipped || roundedLines > 0 || r.notes.length > 0
      ? 'medium'
      : 'high';

  return { lines, checks, itemsSum, computedTotal, payTotal, residual, discountInSubtotal, confidence, mismatchedLines };
}

function subtotalHint(r: Receipt, diff: number): string {
  const missingLine = r.items.findLast((it) => it.total === -diff);
  if (missingLine) return `Off by exactly "${missingLine.name}". Was it read twice, or is it not on the receipt?`;
  return diff > 0
    ? 'Items add up to less than the subtotal. A line may be missing or misread.'
    : 'Items add up to more than the subtotal. A line may be extra or misread.';
}

function totalHint(r: Receipt, diff: number): string {
  if (r.tip === 0 && diff > 0) return 'The total is higher than subtotal plus charges. Is there a tip written in?';
  if (r.tip !== 0 && diff === -r.tip) return 'The printed total matches before the tip. Add the tip to the total if you paid it.';
  if (!r.taxIncluded && r.tax !== 0 && diff === -r.tax) return 'The total already matches without tax. Prices may include tax.';
  return 'Subtotal plus tax, tip and charges does not equal the total. Check those amounts.';
}
