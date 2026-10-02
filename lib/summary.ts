import { formatMoney } from './money.ts';
import type { Receipt } from './receipt.ts';
import { settleUp, type Person, type SplitResult } from './split.ts';

/** Plain text a person can paste into a group chat. */
export function summaryText(receipt: Receipt, people: Person[], result: SplitResult, payerId: string | null, link?: string) {
  const fmt = (n: number) => formatMoney(n, receipt.currency);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const head = [receipt.merchant || 'Receipt', receipt.date].filter(Boolean).join(', ');
  const lines = [`${head}: ${fmt(result.payTotal)} total`, ''];

  for (const s of result.people) {
    const items = s.lines.length;
    lines.push(`${name.get(s.id)}: ${fmt(s.total)} (${items} item${items === 1 ? '' : 's'})`);
  }
  if (result.unassigned.total !== 0) lines.push(`Not assigned yet: ${fmt(result.unassigned.total)}`);

  const transfers = settleUp(result, payerId);
  if (transfers.length) {
    lines.push('');
    for (const t of transfers) lines.push(`${name.get(t.from)} pays ${name.get(t.to)} ${fmt(t.amount)}`);
  }
  if (link) lines.push('', `Details: ${link}`);
  return lines.join('\n');
}
