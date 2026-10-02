'use client';

import { useState, type Dispatch } from 'react';
import { formatMoney, minorDigits, parseMoney, toPlain } from '../../lib/money.ts';
import type { Check, Reconciliation } from '../../lib/receipt.ts';
import type { Action, AppState } from './state';
import { Button, Card, Icon } from './ui';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'SGD', 'AED', 'MXN', 'BRL', 'IDR', 'KRW', 'ZAR'];

export function MoneyInput({
  value,
  digits,
  onCommit,
  label,
  nullable = false,
  className = '',
}: {
  value: number | null;
  digits: number;
  onCommit: (v: number | null) => void;
  label: string;
  nullable?: boolean;
  className?: string;
}) {
  const shown = value === null ? '' : toPlain(value, digits);
  const [draft, setDraft] = useState(shown);
  const commit = () => {
    if (draft.trim() === '' && nullable) return onCommit(null);
    const n = parseMoney(draft, digits);
    if (n === null) setDraft(shown);
    else if (n !== value) onCommit(n);
    else setDraft(shown);
  };
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={draft}
      placeholder={nullable ? 'none' : '0'}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`num w-full rounded-lg bg-transparent px-2 py-1.5 text-right outline-none transition hover:bg-navy-wash focus:bg-white focus:ring-2 focus:ring-navy/25 ${className}`}
    />
  );
}

const CHECK_LABEL: Record<Check['key'], string> = { lines: 'Each line', subtotal: 'Subtotal', total: 'Total' };

function ConfidenceBanner({ rec, notes, fmt }: { rec: Reconciliation; notes: string[]; fmt: (n: number) => string }) {
  const tone = {
    high: { box: 'bg-good-bg text-good ring-good/20', icon: 'check' as const, title: 'Everything adds up', body: 'Every line, the subtotal and the total check out against each other.' },
    medium: { box: 'bg-warn-bg text-warn ring-warn/20', icon: 'info' as const, title: 'Mostly checks out', body: 'Nothing contradicts itself, but some things could not be checked. Give it a quick look.' },
    low: { box: 'bg-bad-bg text-bad ring-bad/20', icon: 'alert' as const, title: 'Some numbers do not add up', body: 'The model may have misread something, or the bill itself has a mistake. Fix the highlighted values below.' },
  }[rec.confidence];
  const hints = rec.checks.filter((c) => c.status !== 'ok' && c.hint).map((c) => c.hint!);
  return (
    <div role="status" className={`rounded-2xl px-4 py-3.5 ring-1 ${tone.box}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70">
          <Icon name={tone.icon} size={17} stroke={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{tone.title}</p>
          <p className="mt-0.5 text-[14px] leading-snug opacity-90">{tone.body}</p>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {rec.checks.map((c) => (
              <li key={c.key} className="flex items-center gap-1 rounded-full bg-white/75 px-2.5 py-1 text-[12.5px] font-semibold">
                <Icon name={c.status === 'ok' ? 'check' : c.status === 'skipped' ? 'info' : 'x'} size={13} stroke={2.6} />
                {CHECK_LABEL[c.key]}
                <span className="font-medium opacity-75">{c.status === 'ok' ? 'matches' : c.status === 'skipped' ? 'not printed' : c.key === 'lines' ? `${rec.mismatchedLines} off` : `off by ${fmt(Math.abs(c.diff))}`}</span>
              </li>
            ))}
          </ul>
          {(hints.length > 0 || notes.length > 0) && (
            <ul className="mt-2.5 space-y-1 text-[13.5px] leading-snug">
              {[...hints, ...notes.map((n) => `Model note: ${n}`)].map((h) => (
                <li key={h} className="flex gap-2">
                  <span aria-hidden>·</span>
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReviewStep({
  state,
  rec,
  dispatch,
  onLiveScan,
  onRescan,
}: {
  state: AppState;
  rec: Reconciliation;
  dispatch: Dispatch<Action>;
  onLiveScan: () => void;
  onRescan: () => void;
}) {
  const r = state.receipt!;
  const digits = minorDigits(r.currency);
  const fmt = (n: number) => formatMoney(n, r.currency);
  const set = (patch: Partial<typeof r>) => dispatch({ type: 'receipt', patch });

  const totalsRow = (label: string, node: React.ReactNode, status?: Check['status'], sub?: React.ReactNode) => (
    <div className={`flex items-center justify-between gap-3 px-4 py-1.5 ${status === 'mismatch' ? 'bg-bad-bg/70' : ''}`}>
      <div className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14.5px] text-ink-soft">
          {label}
          {status === 'ok' && <Icon name="check" size={14} stroke={2.6} className="text-good" />}
          {status === 'mismatch' && <Icon name="alert" size={14} stroke={2.2} className="text-bad" />}
        </span>
        {sub}
      </div>
      <div className="w-32 shrink-0">{node}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Recognized items</h2>
            <p className="mt-0.5 text-[14px] text-ink-soft">Make sure each line matches the receipt. Tap any value to fix it.</p>
          </div>
          {state.meta && (
            <p className="num rounded-full bg-navy-wash px-3 py-1 text-[11.5px] text-ink-soft ring-1 ring-line">
              {state.source === 'sample' ? 'saved scan' : 'live scan'} · {state.meta.model} · {(state.meta.ms / 1000).toFixed(1)}s
              {state.meta.inputTokens ? ` · ${state.meta.inputTokens + (state.meta.outputTokens ?? 0)} tokens` : ''}
            </p>
          )}
        </div>
        {state.source === 'sample' && (
          <p className="mt-3 rounded-xl bg-navy-wash px-3 py-2 text-[13px] leading-snug text-ink-soft">
            This is a saved result from a real scan of the sample photo, so it loads without an API call.{' '}
            <button type="button" onClick={onLiveScan} className="font-semibold text-navy underline underline-offset-2">
              Scan it live instead
            </button>
          </p>
        )}
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_160px_110px]">
          <label className="col-span-2 sm:col-span-1">
            <span className="sr-only">Merchant</span>
            <input value={r.merchant} onChange={(e) => set({ merchant: e.target.value.slice(0, 80) })} placeholder="Merchant" className="w-full rounded-xl bg-navy-wash px-3 py-2.5 font-semibold outline-none ring-1 ring-line focus:ring-2 focus:ring-navy/30" />
          </label>
          <label>
            <span className="sr-only">Date</span>
            <input type="date" value={r.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} className="w-full rounded-xl bg-navy-wash px-3 py-2.5 text-[14px] outline-none ring-1 ring-line focus:ring-2 focus:ring-navy/30" />
          </label>
          <label>
            <span className="sr-only">Currency</span>
            <select value={r.currency} onChange={(e) => set({ currency: e.target.value })} className="w-full rounded-xl bg-navy-wash px-3 py-2.5 text-[14px] font-semibold outline-none ring-1 ring-line focus:ring-2 focus:ring-navy/30">
              {[...new Set([r.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <ConfidenceBanner rec={rec} notes={r.notes} fmt={fmt} />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">
          <span>{r.items.length} items</span>
          <span>Qty x price · line total</span>
        </div>
        <ul className="divide-y divide-line">
          {r.items.map((it) => {
            const line = rec.lines[it.id];
            const bad = line?.status === 'mismatch';
            return (
              <li key={it.id} className={`px-3 py-2.5 transition-colors sm:px-4 ${bad ? 'bg-bad-bg/60 shadow-[inset_3px_0_0_var(--color-bad)]' : ''}`}>
                <div className="flex items-center gap-2">
                  <input
                    value={it.name}
                    onChange={(e) => dispatch({ type: 'item', id: it.id, patch: { name: e.target.value.slice(0, 80) } })}
                    placeholder="Item name"
                    aria-label="Item name"
                    className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1.5 font-semibold outline-none hover:bg-navy-wash focus:bg-white focus:ring-2 focus:ring-navy/25"
                  />
                  <div className="w-28 shrink-0 sm:w-32">
                    <MoneyInput key={`t${it.total}`} value={it.total} digits={digits} label={`Line total for ${it.name}`} onCommit={(v) => dispatch({ type: 'item', id: it.id, patch: { total: v ?? 0 } })} className={`font-semibold ${bad ? 'text-bad' : ''}`} />
                  </div>
                </div>
                <div className="mt-0.5 flex items-center gap-1 pl-2 text-[13px] text-ink-faint">
                  <input
                    key={`q${it.qty}`}
                    defaultValue={String(it.qty)}
                    inputMode="decimal"
                    aria-label={`Quantity for ${it.name}`}
                    onBlur={(e) => {
                      const q = Number(e.target.value.replace(',', '.'));
                      if (Number.isFinite(q) && q > 0 && q <= 9999) dispatch({ type: 'item', id: it.id, patch: { qty: Math.round(q * 1000) / 1000 } });
                      else e.target.value = String(it.qty);
                    }}
                    className="num w-12 rounded-md bg-transparent px-1.5 py-1 text-center outline-none hover:bg-navy-wash focus:bg-white focus:ring-2 focus:ring-navy/25"
                  />
                  <span>x</span>
                  <div className="w-24">
                    <MoneyInput key={`u${it.unit}`} value={it.unit} digits={digits} nullable label={`Unit price for ${it.name}`} onCommit={(v) => dispatch({ type: 'item', id: it.id, patch: { unit: v } })} className="!text-left !py-1 text-[13px]" />
                  </div>
                  {line?.status === 'ok' && <Icon name="check" size={14} stroke={2.6} className="text-good" />}
                  {line?.status === 'rounded' && <span className="rounded-full bg-navy-wash px-2 py-0.5 text-[11.5px] font-medium text-ink-soft">rounded price</span>}
                  <button type="button" aria-label={`Remove ${it.name || 'item'}`} onClick={() => dispatch({ type: 'removeItem', id: it.id })} className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition hover:bg-bad-bg hover:text-bad">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
                {bad && line.expected !== null && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-2 text-[13px] text-bad">
                    <span>
                      {it.qty} x {fmt(it.unit!)} is {fmt(line.expected)}, but the line says {fmt(it.total)}.
                    </span>
                    <button type="button" onClick={() => dispatch({ type: 'item', id: it.id, patch: { total: line.expected! } })} className="rounded-full bg-white px-2.5 py-1 text-[12.5px] font-semibold text-bad ring-1 ring-bad/30 transition hover:bg-bad hover:text-white">
                      Use {fmt(line.expected)}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-2">
          <Button variant="ghost" onClick={() => dispatch({ type: 'addItem' })} className="w-full">
            <Icon name="plus" size={18} /> Add a line
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden py-2">
        {totalsRow('Items add up to', <p className="num px-2 py-1.5 text-right text-ink-soft">{fmt(rec.itemsSum)}</p>)}
        {totalsRow('Subtotal on receipt', <MoneyInput key={`s${r.subtotal}`} value={r.subtotal} digits={digits} nullable label="Subtotal" onCommit={(v) => set({ subtotal: v })} />, rec.checks[1].status)}
        {totalsRow('Discount', <MoneyInput key={`d${r.discount}`} value={r.discount} digits={digits} label="Discount" onCommit={(v) => set({ discount: Math.abs(v ?? 0) })} />)}
        {totalsRow('Service charge', <MoneyInput key={`v${r.service}`} value={r.service} digits={digits} label="Service charge" onCommit={(v) => set({ service: v ?? 0 })} />)}
        {totalsRow(
          'Tax',
          <MoneyInput key={`x${r.tax}`} value={r.tax} digits={digits} label="Tax" onCommit={(v) => set({ tax: v ?? 0 })} />,
          undefined,
          <label className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-faint">
            <input type="checkbox" checked={r.taxIncluded} onChange={(e) => set({ taxIncluded: e.target.checked })} className="h-3.5 w-3.5 accent-navy" />
            Already in the prices (VAT)
          </label>,
        )}
        {totalsRow('Tip', <MoneyInput key={`p${r.tip}`} value={r.tip} digits={digits} label="Tip" onCommit={(v) => set({ tip: v ?? 0 })} />)}
        <div className="mx-4 my-1 border-t border-dashed border-line-strong" />
        {totalsRow('Total paid', <MoneyInput key={`o${r.total}`} value={r.total} digits={digits} nullable label="Total" onCommit={(v) => set({ total: v })} className="text-[17px] font-bold" />, rec.checks[2].status)}
        {rec.residual !== 0 && (
          <p className="mx-4 mt-2 rounded-xl bg-warn-bg px-3 py-2 text-[13px] leading-snug text-warn">
            The lines and charges add up to {fmt(rec.computedTotal)}, which is {fmt(Math.abs(rec.residual))} {rec.residual > 0 ? 'less' : 'more'} than the total. If you carry on, that difference is shared out by what each person had, so shares still add up to {fmt(rec.payTotal)}.
          </p>
        )}
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2">
        <Button variant="secondary" onClick={onRescan} className="flex-1 lg:flex-none">
          Rescan
        </Button>
        <Button onClick={() => dispatch({ type: 'step', step: 'assign' })} disabled={r.items.length === 0} className="flex-[2] lg:ml-auto lg:flex-none lg:px-8">
          {rec.confidence === 'low' ? 'Continue anyway' : 'Confirm items'}
        </Button>
      </div>
    </div>
  );
}
