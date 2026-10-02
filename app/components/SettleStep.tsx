'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, type Dispatch } from 'react';
import { renderCard } from '../../lib/card.ts';
import { formatMoney } from '../../lib/money.ts';
import type { Reconciliation } from '../../lib/receipt.ts';
import { encodeState } from '../../lib/share.ts';
import { settleUp, type Component, type SplitResult } from '../../lib/split.ts';
import { summaryText } from '../../lib/summary.ts';
import type { Action, AppState } from './state';
import { Avatar, Button, Card, Icon } from './ui';

const EXTRA_LABEL: Record<Exclude<Component, 'items'>, string> = {
  discount: 'Discount',
  service: 'Service charge',
  tax: 'Tax',
  tip: 'Tip',
  adjust: 'Unreconciled difference',
};

export default function SettleStep({ state, split, rec, dispatch }: { state: AppState; split: SplitResult; rec: Reconciliation; dispatch: Dispatch<Action> }) {
  const r = state.receipt!;
  const fmt = (n: number) => formatMoney(n, r.currency);
  const byId = new Map(state.people.map((p) => [p.id, p]));
  const items = new Map(r.items.map((it) => [it.id, it]));
  const [open, setOpen] = useState<string | null>(null);
  const [link, setLink] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const transfers = settleUp(split, state.payerId);
  const max = Math.max(1, ...split.people.map((s) => Math.abs(s.total)));

  useEffect(() => {
    let live = true;
    encodeState({ receipt: r, people: state.people, assignments: state.assignments, options: state.options, payerId: state.payerId })
      .then((enc) => live && setLink(`${window.location.origin}/#s=${enc}`))
      .catch(() => live && setLink(''));
    return () => {
      live = false;
    };
  }, [r, state.people, state.assignments, state.options, state.payerId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const text = summaryText(r, state.people, split, state.payerId, link || undefined);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(`${what} copied`);
    } catch {
      setToast('Copy failed. Select the text and copy it by hand.');
    }
  };

  const shareText = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${r.merchant || 'Bill'} split`, text });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    void copy(text, 'Summary');
  };

  const makeImage = async () => {
    setBusy(true);
    try {
      const blob = await renderCard(r, state.people, split, state.payerId);
      setImage({ url: URL.createObjectURL(blob), blob });
      const file = new File([blob], 'splitsnap.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Bill split' }).catch(() => undefined);
      }
    } catch {
      setToast('Could not draw the image in this browser.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {state.source === 'link' && (
        <p className="rounded-2xl bg-navy-wash px-4 py-3 text-[13.5px] leading-snug text-ink-soft ring-1 ring-line">
          Opened from a shared link. The whole split lives inside the link itself, so nothing was loaded from a server. You can change it and send a new link.
        </p>
      )}

      <section className="dots relative overflow-hidden rounded-[26px] bg-navy p-5 text-white shadow-[0_24px_48px_-24px_rgba(17,27,77,.8)] sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(255,138,92,.4),transparent_65%)]" />
        <p className="relative text-[13px] font-medium text-white/70">{[r.merchant || 'Receipt', r.date].filter(Boolean).join('  ·  ')}</p>
        <p className="num relative mt-1 text-[40px] font-semibold leading-none tracking-tight sm:text-[48px]">{fmt(split.payTotal)}</p>
        <p className="relative mt-2 text-[13.5px] text-white/75">
          Split {split.people.length} ways. Shares add up exactly to the total.
        </p>
      </section>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {split.people.map((s, i) => {
            const p = byId.get(s.id)!;
            const expanded = open === s.id;
            const extras = (Object.keys(EXTRA_LABEL) as (keyof typeof EXTRA_LABEL)[]).filter((k) => s[k] !== 0);
            return (
              <li key={s.id} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-navy-wash/60">
                  <Avatar name={p.name} color={p.color} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{p.name}</span>
                      {s.id === state.payerId && <span className="rounded-full bg-good-bg px-2 py-0.5 text-[11px] font-semibold text-good">paid</span>}
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-navy-wash">
                      <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${(Math.abs(s.total) / max) * 100}%`, background: p.color }} />
                    </span>
                  </span>
                  <span className="num text-right text-[17px] font-semibold">{fmt(s.total)}</span>
                  <Icon name="back" size={16} className={`text-ink-faint transition ${expanded ? 'rotate-90' : '-rotate-90'}`} />
                </button>
                {expanded && (
                  <div className="num animate-rise space-y-1 bg-navy-wash/50 px-4 pb-3.5 pt-1 text-[13px] text-ink-soft">
                    {s.lines.map((l) => (
                      <div key={l.itemId} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate font-sans">
                          {items.get(l.itemId)?.name || 'Item'}
                          {l.of > 1 && <span className="text-ink-faint"> (1/{l.of} of {fmt(items.get(l.itemId)?.total ?? 0)})</span>}
                        </span>
                        <span>{fmt(l.amount)}</span>
                      </div>
                    ))}
                    {extras.map((k) => (
                      <div key={k} className="flex justify-between gap-3">
                        <span className="font-sans">{EXTRA_LABEL[k]}{state.options[k as 'tax'] === 'even' && k !== 'adjust' ? ', even split' : ''}</span>
                        <span>{fmt(s[k])}</span>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3 border-t border-line pt-1 font-semibold text-ink">
                      <span className="font-sans">Total</span>
                      <span>{fmt(s.total)}</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {split.unassigned.total !== 0 && (
          <p className="border-t border-line bg-warn-bg px-4 py-2.5 text-[13px] text-warn">
            {fmt(split.unassigned.total)} is not assigned to anyone yet.
          </p>
        )}
        {rec.residual !== 0 && (
          <p className="border-t border-line px-4 py-2.5 text-[12.5px] leading-snug text-ink-faint">
            The receipt did not add up by {fmt(Math.abs(rec.residual))}. That difference is shared by what each person had, shown as &quot;Unreconciled difference&quot;.
          </p>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-lg font-bold tracking-tight">Settle up</h2>
        {transfers.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {transfers.map((t) => (
              <li key={t.from} className="flex items-center gap-2.5 rounded-2xl bg-navy-wash px-3 py-2.5">
                <Avatar name={byId.get(t.from)!.name} color={byId.get(t.from)!.color} size={28} />
                <span className="min-w-0 flex-1 text-[14.5px]">
                  <b className="font-semibold">{byId.get(t.from)!.name}</b> pays <b className="font-semibold">{byId.get(t.to)!.name}</b>
                </span>
                <span className="num font-semibold">{fmt(t.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2">
            <p className="text-[14px] text-ink-soft">Who paid the bill? Pick them to see who owes what.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Who paid">
              {state.people.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={state.payerId === p.id} onClick={() => dispatch({ type: 'payer', id: p.id })} className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13.5px] font-semibold ring-1 ring-line transition hover:ring-line-strong">
                  <Avatar name={p.name} color={p.color} size={24} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button onClick={shareText} className="col-span-2 sm:col-span-1">
            <Icon name="share" size={18} /> Share
          </Button>
          <Button variant="secondary" onClick={() => copy(text, 'Summary')}>
            <Icon name="copy" size={18} /> Copy text
          </Button>
          <Button variant="secondary" onClick={() => link && copy(link, 'Link')} disabled={!link}>
            <Icon name="link" size={18} /> Copy link
          </Button>
          <Button variant="secondary" onClick={makeImage} disabled={busy} className="col-span-2 sm:col-span-1">
            <Icon name="image" size={18} /> {busy ? 'Drawing...' : 'Make image'}
          </Button>
        </div>

        {image && (
          <div className="mt-4 animate-rise rounded-2xl bg-navy-wash p-3 ring-1 ring-line">
            <img src={image.url} alt="Summary card image" className="mx-auto max-h-[420px] rounded-xl shadow-md" />
            <div className="mt-3 flex justify-center">
              <a href={image.url} download={`${(r.merchant || 'bill').replace(/[^\w-]+/g, '-').toLowerCase()}-split.png`} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-navy px-4 text-[14px] font-semibold text-white hover:bg-navy-deep">
                <Icon name="upload" size={16} className="rotate-180" /> Download PNG
              </a>
            </div>
          </div>
        )}

        <details className="group mt-4 rounded-2xl ring-1 ring-line">
          <summary className="cursor-pointer list-none px-4 py-3 text-[13.5px] font-semibold text-ink-soft">Preview the text</summary>
          <pre className="num overflow-x-auto whitespace-pre-wrap break-all border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-ink-soft">{text}</pre>
        </details>

        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-faint">
          How rounding works: everything is counted in whole cents. A shared dish splits evenly, and any leftover cent goes to whoever has the smallest total so far. Tax, tip and charges use the largest remainder method. Each column and each person adds up exactly, so nobody is a cent short.
        </p>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2">
        <Button variant="secondary" onClick={() => dispatch({ type: 'step', step: 'assign' })} className="flex-1 lg:flex-none">
          Edit split
        </Button>
        <Button onClick={shareText} className="flex-[2] lg:ml-auto lg:flex-none lg:px-8">
          <Icon name="share" size={18} /> Send to group
        </Button>
      </div>

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit animate-rise rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-white shadow-lg lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}
