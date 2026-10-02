'use client';

/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { formatMoney } from '../../lib/money.ts';
import type { Receipt, Reconciliation } from '../../lib/receipt.ts';
import { Segmented } from './ui';

export default function ReceiptPaper({ receipt, rec, photoUrl }: { receipt: Receipt; rec: Reconciliation; photoUrl: string | null }) {
  const [view, setView] = useState<'read' | 'photo'>('read');
  const fmt = (n: number) => formatMoney(n, receipt.currency);
  const showPhoto = view === 'photo' && photoUrl;

  const row = (label: string, value: number | null, opts: { bold?: boolean; bad?: boolean } = {}) =>
    value === null ? null : (
      <div className={`flex justify-between gap-3 ${opts.bold ? 'text-[15px] font-semibold text-ink' : ''} ${opts.bad ? 'rounded bg-bad-bg px-1 text-bad' : ''}`}>
        <span>{label}</span>
        <span>{fmt(value)}</span>
      </div>
    );

  return (
    <div>
      {photoUrl && (
        <div className="mb-3 flex justify-center">
          <Segmented
            label="Receipt view"
            value={view}
            onChange={setView}
            options={[
              { value: 'read', label: 'What was read' },
              { value: 'photo', label: 'Photo' },
            ]}
          />
        </div>
      )}
      <div className="drop-shadow-[0_18px_30px_rgba(18,24,51,.22)]">
        {showPhoto ? (
          <img src={photoUrl} alt="The receipt photo" className="w-full rounded-2xl bg-white object-contain" />
        ) : (
          <div className="torn bg-paper px-6 py-9 text-[13px] leading-[1.7] text-ink-soft num">
            <p className="text-center text-[15px] font-semibold uppercase tracking-[.18em] text-ink">{receipt.merchant || 'Receipt'}</p>
            <p className="text-center">{[receipt.date, receipt.currency].filter(Boolean).join('  ·  ')}</p>
            <div className="my-3 border-t-2 border-dashed border-line-strong" />
            <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              <span>Item</span>
              <span>Price</span>
            </div>
            {receipt.items.map((it) => {
              const bad = rec.lines[it.id]?.status === 'mismatch';
              return (
                <div key={it.id} className={`flex justify-between gap-3 ${bad ? 'rounded bg-bad-bg px-1 text-bad' : ''}`}>
                  <span className="min-w-0 truncate">
                    {it.qty !== 1 && <span className="text-ink-faint">{it.qty} </span>}
                    {it.name || 'Unnamed item'}
                  </span>
                  <span className={bad ? 'underline decoration-wavy decoration-bad/70' : ''}>{fmt(it.total)}</span>
                </div>
              );
            })}
            <div className="my-3 border-t-2 border-dashed border-line-strong" />
            {row('Subtotal', receipt.subtotal, { bad: rec.checks[1].status === 'mismatch' })}
            {receipt.discount !== 0 && row('Discount', -receipt.discount)}
            {receipt.service !== 0 && row('Service', receipt.service)}
            {receipt.tax !== 0 && row(receipt.taxIncluded ? 'Tax (included)' : 'Tax', receipt.tax)}
            {receipt.tip !== 0 && row('Tip', receipt.tip)}
            <div className="mt-1">{row('Total', rec.payTotal, { bold: true, bad: rec.checks[2].status === 'mismatch' })}</div>
            <div className="my-3 border-t-2 border-dashed border-line-strong" />
            <p className="text-center text-[11px] uppercase tracking-[.2em] text-ink-faint">Thank you</p>
            <div
              aria-hidden
              className="mx-auto mt-3 h-10 w-48 opacity-70"
              style={{ background: 'repeating-linear-gradient(90deg,#121833 0 2px,transparent 2px 4px,#121833 4px 5px,transparent 5px 8px,#121833 8px 11px,transparent 11px 12px)' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
