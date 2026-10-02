'use client';

import { useState, type Dispatch } from 'react';
import { formatMoney } from '../../lib/money.ts';
import type { Mode, SplitOptions, SplitResult } from '../../lib/split.ts';
import type { Action, AppState } from './state';
import { Avatar, Button, Card, Icon, Segmented } from './ui';

const MODES: { value: Mode; label: string }[] = [
  { value: 'proportional', label: 'By what they had' },
  { value: 'even', label: 'Evenly' },
];

export default function AssignStep({ state, split, dispatch }: { state: AppState; split: SplitResult; dispatch: Dispatch<Action> }) {
  const r = state.receipt!;
  const fmt = (n: number) => formatMoney(n, r.currency);
  const [name, setName] = useState('');
  const byId = new Map(state.people.map((p) => [p.id, p]));
  const active = state.activeId ? byId.get(state.activeId) : undefined;
  const assigned = r.items.length - split.unassignedItemIds.length;
  const shareOf = new Map(split.people.map((s) => [s.id, s]));

  const add = () => {
    if (!name.trim()) return;
    dispatch({ type: 'addPerson', name });
    setName('');
  };

  const charges: { key: keyof SplitOptions; label: string; amount: number }[] = [
    { key: 'tax', label: 'Tax', amount: r.taxIncluded ? 0 : r.tax },
    { key: 'tip', label: 'Tip', amount: r.tip },
    { key: 'service', label: 'Service charge', amount: r.service },
    { key: 'discount', label: 'Discount', amount: -r.discount },
  ];
  const visibleCharges = charges.filter((c) => c.amount !== 0);
  const ready = state.people.length > 0 && split.unassignedItemIds.length === 0;

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Who is splitting?</h2>
          <span className="text-[13px] text-ink-faint">{state.people.length} {state.people.length === 1 ? 'person' : 'people'}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Choose who you are assigning items to">
          {state.people.map((p) => {
            const on = p.id === state.activeId;
            return (
              <div key={p.id} className="animate-pop">
                <div
                  className={`flex items-center gap-1 rounded-full py-1 pl-1 pr-1 transition ${on ? 'bg-navy text-white shadow-[0_8px_18px_-10px_rgba(27,42,107,.9)]' : 'bg-navy-wash text-ink ring-1 ring-line hover:ring-line-strong'}`}
                >
                  <button type="button" role="radio" aria-checked={on} onClick={() => dispatch({ type: 'active', id: p.id })} className="flex items-center gap-2 rounded-full pr-1">
                    <Avatar name={p.name} color={p.color} size={30} ring={on} />
                    <span className="text-[14.5px] font-semibold">{p.name}</span>
                    <span className={`num text-[12px] ${on ? 'text-white/70' : 'text-ink-faint'}`}>{fmt(shareOf.get(p.id)?.items ?? 0)}</span>
                  </button>
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => dispatch({ type: 'removePerson', id: p.id })} className={`flex h-6 w-6 items-center justify-center rounded-full transition ${on ? 'hover:bg-white/15' : 'text-ink-faint hover:bg-white hover:text-bad'}`}>
                    <Icon name="x" size={13} stroke={2.4} />
                  </button>
                </div>
              </div>
            );
          })}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="flex items-center rounded-full bg-white py-1 pl-3.5 pr-1 ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-navy/40"
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={state.people.length ? 'Add someone' : 'Add your first name'} aria-label="Name" maxLength={24} className="w-32 bg-transparent text-[14.5px] outline-none placeholder:text-ink-faint" />
            <button type="submit" aria-label="Add person" className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-white transition hover:bg-navy-deep disabled:bg-line-strong" disabled={!name.trim()}>
              <Icon name="plus" size={17} stroke={2.4} />
            </button>
          </form>
        </div>
        <p className="mt-3 text-[13.5px] text-ink-soft">
          {active ? (
            <>
              Tap everything <b className="font-semibold text-ink">{active.name}</b> had. Tap more than one person on a dish to share it evenly.
            </>
          ) : (
            'Add the people at the table to start.'
          )}
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">
              {assigned} of {r.items.length} items assigned
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-navy-wash">
              <div className="h-full rounded-full bg-coral transition-all duration-500" style={{ width: `${(assigned / Math.max(1, r.items.length)) * 100}%` }} />
            </div>
          </div>
          {split.unassignedItemIds.length > 0 && state.people.length > 0 && (
            <Button variant="secondary" onClick={() => dispatch({ type: 'restEvenly' })} className="!min-h-9 shrink-0 !px-3.5 text-[13px]">
              <Icon name="users" size={16} /> Share the rest
            </Button>
          )}
        </div>
        <ul className="divide-y divide-line">
          {r.items.map((it) => {
            const ids = (state.assignments[it.id] ?? []).filter((id) => byId.has(id));
            const mine = !!active && ids.includes(active.id);
            const everyone = state.people.length > 0 && ids.length === state.people.length;
            return (
              <li key={it.id} className="flex items-stretch">
                <button
                  type="button"
                  disabled={!active}
                  aria-pressed={mine}
                  onClick={() => active && dispatch({ type: 'toggle', itemId: it.id, personId: active.id })}
                  className={`flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-3 text-left transition ${mine ? 'bg-navy-wash' : 'hover:bg-navy-wash/60'} disabled:cursor-default`}
                  style={mine && active ? { boxShadow: `inset 4px 0 0 ${active.color}` } : undefined}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-2 transition ${mine ? 'text-white ring-transparent' : 'ring-line-strong'}`} style={mine && active ? { background: active.color } : undefined}>
                    {mine && <Icon name="check" size={15} stroke={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {it.qty !== 1 && <span className="text-ink-faint">{it.qty} x </span>}
                      {it.name || 'Unnamed item'}
                    </span>
                    <span className={`mt-0.5 flex items-center gap-1.5 text-[12.5px] ${ids.length ? 'text-ink-soft' : 'font-semibold text-coral'}`}>
                      {ids.length > 0 && (
                        <span className="flex shrink-0 -space-x-1.5">
                          {ids.slice(0, 5).map((id) => (
                            <span key={id} className="animate-pop">
                              <Avatar name={byId.get(id)!.name} color={byId.get(id)!.color} size={18} ring />
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="truncate">
                        {ids.length === 0 ? 'Nobody yet' : ids.length === 1 ? byId.get(ids[0])!.name : `Shared by ${ids.length}, ${it.total % ids.length ? 'about ' : ''}${fmt(Math.round(it.total / ids.length))} each`}
                      </span>
                    </span>
                  </span>
                  <span className="num shrink-0 text-right font-semibold">{fmt(it.total)}</span>
                </button>
                <button
                  type="button"
                  disabled={state.people.length === 0}
                  onClick={() => dispatch({ type: 'everyone', itemId: it.id })}
                  aria-pressed={everyone}
                  aria-label={`Share ${it.name} with everyone`}
                  className={`w-12 shrink-0 border-l sm:w-16 border-line text-[11.5px] font-semibold transition ${everyone ? 'bg-navy text-white' : 'text-ink-soft hover:bg-navy-wash'} disabled:opacity-40`}
                >
                  All
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {(visibleCharges.length > 0 || state.people.length > 1) && (
        <Card className="space-y-3 p-4 sm:p-5">
          {visibleCharges.length > 0 && (
            <>
              <h2 className="text-lg font-bold tracking-tight">Tax, tip and charges</h2>
              {visibleCharges.map((c) => (
                <div key={c.key} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14.5px]">
                    {c.label} <span className="num text-ink-faint">{fmt(c.amount)}</span>
                  </span>
                  <Segmented label={`Split ${c.label} by`} value={state.options[c.key]} options={MODES} onChange={(mode) => dispatch({ type: 'option', key: c.key, mode })} />
                </div>
              ))}
              <p className="text-[12.5px] leading-snug text-ink-faint">&quot;By what they had&quot; scales each person&apos;s share to their items. &quot;Evenly&quot; splits it among everyone who ordered.</p>
            </>
          )}
          {state.people.length > 1 && (
            <div className={visibleCharges.length ? 'border-t border-line pt-3' : ''}>
              <p className="mb-2 text-[14.5px] font-semibold">Who paid the bill?</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Who paid">
                {state.people.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={state.payerId === p.id} onClick={() => dispatch({ type: 'payer', id: state.payerId === p.id ? null : p.id })} className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13.5px] font-semibold ring-1 transition ${state.payerId === p.id ? 'bg-navy text-white ring-navy' : 'ring-line hover:ring-line-strong'}`}>
                    <Avatar name={p.name} color={p.color} size={24} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2">
        <Button variant="secondary" onClick={() => dispatch({ type: 'step', step: 'review' })} className="flex-1 lg:flex-none">
          Edit bill
        </Button>
        <Button onClick={() => dispatch({ type: 'step', step: 'settle' })} disabled={!ready} className="flex-[2] lg:ml-auto lg:flex-none lg:px-8">
          {state.people.length === 0 ? 'Add people first' : ready ? 'See who owes what' : `${split.unassignedItemIds.length} left to assign`}
        </Button>
      </div>
    </div>
  );
}
