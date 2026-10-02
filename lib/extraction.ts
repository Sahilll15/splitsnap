import { z } from 'zod';
import { isCurrencyCode, minorDigits, toMinor } from './money.ts';
import type { Receipt } from './receipt.ts';

// Structured Outputs needs every key present, so optional values are nullable instead.
export const ExtractedReceipt = z.object({
  is_receipt: z.boolean().describe('False if the image is not a purchase receipt or bill.'),
  merchant: z.string().nullable(),
  date: z.string().nullable().describe('ISO 8601 date YYYY-MM-DD if printed, else null.'),
  currency: z.string().describe('ISO 4217 code. Infer from symbols, language and address.'),
  items: z.array(
    z.object({
      name: z.string().describe('Item name as printed, expanded if abbreviated.'),
      quantity: z.number().describe('Quantity or weight. 1 if not printed.'),
      unit_price: z.number().nullable().describe('Price per unit as printed, null if not printed.'),
      line_total: z.number().describe('The amount printed for this line. Negative for a promo or void line.'),
    }),
  ),
  subtotal: z.number().nullable(),
  tax: z.number().nullable().describe('Sum of all tax and VAT lines.'),
  tax_included: z.boolean().describe('True if the tax is already inside the item prices (common for VAT).'),
  tip: z.number().nullable().describe('Tip or gratuity, including a handwritten one.'),
  service_charge: z.number().nullable(),
  discounts: z.array(z.object({ label: z.string(), amount: z.number().describe('Positive amount taken off.') })),
  total: z.number().nullable().describe('The final amount paid. Prefer a handwritten total if present.'),
  warnings: z
    .array(z.string())
    .describe('Only things a person should double-check: unreadable, cut off or ambiguous values. Not routine formatting. Usually empty.'),
});

export type ExtractedReceipt = z.infer<typeof ExtractedReceipt>;

export const EXTRACTION_PROMPT = `You read photos of receipts and restaurant bills.
Transcribe exactly what is printed or handwritten. Do not fix arithmetic: if a printed line total looks wrong, still return the printed number, because the app checks the math itself.
Give one entry per printed line item. Do not merge or split lines. Modifiers with their own price are their own line.
Return amounts as plain decimal numbers in the receipt's currency, with no symbols.
Put tax, tip, service charge and receipt-level discounts in their own fields, never in items. A discount printed as its own line under the items with a negative amount goes in discounts as a positive amount.
If the image is not a receipt, set is_receipt to false and leave the rest empty.`;

const clip = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Model output (decimals) -> app receipt (integer minor units). */
export function normalizeExtraction(x: ExtractedReceipt): Receipt {
  const currency = isCurrencyCode(x.currency) ? x.currency.toUpperCase() : 'USD';
  const d = minorDigits(currency);
  const m = (v: number | null) => (v === null ? null : toMinor(v, d));
  const notes = x.warnings.map((w) => clip(w, 160)).filter(Boolean).slice(0, 6);
  if (!isCurrencyCode(x.currency)) notes.push(`Currency "${clip(x.currency, 8)}" was not recognised, so USD is assumed.`);

  const items = x.items.slice(0, 200).map((it, i) => {
    const qty = Number.isFinite(it.quantity) && it.quantity !== 0 ? Math.round(it.quantity * 1000) / 1000 : 1;
    const total = toMinor(it.line_total, d);
    // A single item's line total is its unit price; only multi-quantity lines can be checked.
    return { id: `i${i + 1}`, name: clip(it.name, 80) || `Item ${i + 1}`, qty, unit: m(it.unit_price) ?? (qty === 1 ? total : null), total };
  });

  const date = x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null;
  return {
    merchant: clip(x.merchant, 80),
    date,
    currency,
    items,
    subtotal: m(x.subtotal),
    tax: m(x.tax) ?? 0,
    taxIncluded: x.tax_included,
    tip: m(x.tip) ?? 0,
    service: m(x.service_charge) ?? 0,
    discount: x.discounts.reduce((acc, ds) => acc + Math.abs(toMinor(ds.amount, d)), 0),
    total: m(x.total),
    notes,
  };
}
