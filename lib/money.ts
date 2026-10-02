// All money in this app is an integer count of the currency's minor unit (cents for USD,
// pence for GBP, whole yen for JPY). Floats only exist at the model boundary and in inputs.

const digitsCache = new Map<string, number>();

export function minorDigits(currency: string): number {
  const code = (currency || '').toUpperCase();
  const hit = digitsCache.get(code);
  if (hit !== undefined) return hit;
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  digitsCache.set(code, digits);
  return digits;
}

export function isCurrencyCode(code: string): boolean {
  if (!/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code.toUpperCase() });
    return true;
  } catch {
    return false;
  }
}

/** Parse a decimal string into minor units, rounding half away from zero. */
function decimalToMinor(sign: number, whole: string, frac: string, digits: number): number {
  const padded = (frac + '0'.repeat(digits + 1)).slice(0, digits + 1);
  const kept = padded.slice(0, digits);
  const next = Number(padded[digits] ?? '0');
  let units = Number((whole || '0') + kept);
  if (next >= 5) units += 1;
  return sign * units;
}

const THOUSANDS_COMMA = /^\d{1,3}(,\d{3})+$/;
const THOUSANDS_DOT = /^\d{1,3}(\.\d{3}){2,}$/;

/** Split "1,234.56" / "12,50" / "1.234.567" into whole and fraction digits. */
function splitDecimal(s: string): [string | null, string] {
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot !== -1 && comma !== -1) {
    const at = Math.max(dot, comma);
    const thousands = at === dot ? ',' : '.';
    const head = s.slice(0, at);
    if (head.includes(s[at])) return [null, ''];
    return [head.split(thousands).join(''), s.slice(at + 1)];
  }
  if (comma !== -1) {
    if (THOUSANDS_COMMA.test(s)) return [s.replace(/,/g, ''), ''];
    const parts = s.split(',');
    return parts.length === 2 ? [parts[0], parts[1]] : [null, ''];
  }
  if (dot !== -1) {
    if (THOUSANDS_DOT.test(s)) return [s.replace(/\./g, ''), ''];
    const parts = s.split('.');
    return parts.length === 2 ? [parts[0], parts[1]] : [null, ''];
  }
  return [s, ''];
}

/**
 * Parse what a person types into a money field. Accepts "12", "12.5", "$1,234.56", "-3.20",
 * "(3.20)" as negative, and "12,50" as a decimal comma. Returns null when it is not a number.
 */
export function parseMoney(input: string, digits = 2): number | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,\-]/g, '');
  if (s.startsWith('-')) {
    sign = -sign;
    s = s.slice(1);
  }
  if (!s || /-/.test(s)) return null;

  const [whole, frac] = splitDecimal(s);
  if (whole === null) return null;
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || (whole === '' && frac === '')) return null;
  if (whole.replace(/^0+/, '').length > 12) return null;
  const minor = decimalToMinor(sign, whole, frac, digits);
  return Object.is(minor, -0) ? 0 : minor;
}

/** Convert a model-supplied number (e.g. 12.5) to minor units without float drift (1.005 -> 101). */
export function toMinor(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) >= 1e15) return 0;
  // toFixed(digits + 3) absorbs binary noise like 1.00499999 before the half-up rounding.
  return parseMoney(value.toFixed(digits + 3), digits) ?? 0;
}

/** Plain decimal for an input field: 1250 -> "12.50", -5 -> "-0.05", 1500 JPY -> "1500". */
export function toPlain(minor: number, digits = 2): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  if (digits === 0) return sign + String(abs);
  const s = String(abs).padStart(digits + 1, '0');
  return `${sign}${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

export function formatMoney(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const value = Number(toPlain(minor, digits));
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return toPlain(minor, digits);
  }
}

/** Round qty * unit price to minor units. Quantity may be fractional (0.452 kg). */
export function lineAmount(qty: number, unitMinor: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(unitMinor)) return 0;
  const exact = qty * unitMinor;
  const rounded = Math.sign(exact) * Math.round(Math.abs(exact) + 1e-9);
  return Object.is(rounded, -0) ? 0 : rounded;
}
