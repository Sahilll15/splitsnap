'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { downscale } from '../../lib/image.ts';
import { reconcile } from '../../lib/receipt.ts';
import { decodeState } from '../../lib/share.ts';
import { SAMPLES, type Sample } from '../../lib/samples.ts';
import { computeSplit } from '../../lib/split.ts';
import AssignStep from './AssignStep';
import ReceiptPaper from './ReceiptPaper';
import ReviewStep from './ReviewStep';
import ScanStep from './ScanStep';
import SettleStep from './SettleStep';
import { initialState, reducer, type AppState, type Step } from './state';
import { Icon } from './ui';

const STEPS: { id: Step; label: string; title: string }[] = [
  { id: 'scan', label: 'Scan', title: 'Split a bill' },
  { id: 'review', label: 'Check', title: 'Recognized items' },
  { id: 'assign', label: 'Assign', title: 'Who had what' },
  { id: 'settle', label: 'Settle', title: 'Settle up' },
];

const SESSION_KEY = 'splitsnap:v1';

function persistable(s: AppState) {
  const photoUrl = s.photoUrl?.startsWith('blob:') ? null : s.photoUrl;
  return { ...s, photoUrl, scanning: false, error: null };
}

export default function SplitApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [linkError, setLinkError] = useState<string | null>(null);
  const restored = useRef(false);
  const scanAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#s=')) {
      decodeState(decodeURIComponent(hash.slice(3)))
        .then((shared) => dispatch({ type: 'shared', state: shared }))
        .catch(() => setLinkError('That split link could not be opened. It may be cut off; ask for it again.'))
        .finally(() => (restored.current = true));
      return;
    }
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as AppState;
        if (saved?.receipt && Array.isArray(saved.people)) dispatch({ type: 'restore', state: saved });
      }
    } catch {
      // Storage can be blocked or hold stale data; starting fresh is fine.
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      if (state.receipt) sessionStorage.setItem(SESSION_KEY, JSON.stringify(persistable(state)));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Private mode or full storage: the app still works, it just will not survive a reload.
    }
  }, [state]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state.step]);

  const rec = useMemo(() => (state.receipt ? reconcile(state.receipt) : null), [state.receipt]);
  const split = useMemo(
    () => (state.receipt ? computeSplit(state.receipt, state.people, state.assignments, state.options) : null),
    [state.receipt, state.people, state.assignments, state.options],
  );

  const scanBlob = useCallback(async (file: Blob, photoUrl: string, sampleId: string | null = null) => {
    scanAbort.current?.abort();
    const ctrl = new AbortController();
    scanAbort.current = ctrl;
    dispatch({ type: 'scanStart', photoUrl, sampleId, live: true });
    try {
      const small = await downscale(file);
      const form = new FormData();
      form.append('image', small, 'receipt.jpg');
      const res = await fetch('/api/scan', { method: 'POST', body: form, signal: ctrl.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `The scan failed (${res.status}).`);
      dispatch({ type: 'scanDone', receipt: data.receipt, meta: data.meta, source: 'scan' });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      dispatch({
        type: 'scanError',
        error: offline ? 'You look offline. Connect and try again.' : err instanceof Error ? err.message : 'The scan failed.',
      });
    }
  }, []);

  const onFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
        dispatch({ type: 'scanError', error: 'That is not an image. Choose a photo of the receipt.' });
        return;
      }
      void scanBlob(file, URL.createObjectURL(file));
    },
    [scanBlob],
  );

  const onSample = useCallback(async (sample: Sample) => {
    dispatch({ type: 'scanStart', photoUrl: sample.image, sampleId: sample.id, live: false });
    try {
      const res = await fetch(`/samples/${sample.id}.json`);
      if (!res.ok) throw new Error('Could not load that sample.');
      const data = await res.json();
      dispatch({ type: 'scanDone', receipt: data.receipt, meta: data.meta, source: 'sample', people: sample.people });
    } catch (err) {
      dispatch({ type: 'scanError', error: err instanceof Error ? err.message : 'Could not load that sample.' });
    }
  }, []);

  const liveScanSample = useCallback(async () => {
    const sample = SAMPLES.find((s) => s.id === state.sampleId);
    if (!sample) return;
    const blob = await fetch(sample.image).then((r) => r.blob());
    void scanBlob(blob, sample.image, sample.id);
  }, [scanBlob, state.sampleId]);

  const startOver = () => {
    scanAbort.current?.abort();
    history.replaceState(null, '', window.location.pathname);
    dispatch({ type: 'reset' });
  };

  const stepIndex = STEPS.findIndex((s) => s.id === state.step);
  const current = STEPS[stepIndex];
  const settleReady = !!split && state.people.length > 0 && split.unassignedItemIds.length === 0;
  const reachable = (i: number) => i === 0 || (state.receipt !== null && (i < 3 || settleReady));
  const showPaper = state.receipt && rec && state.step !== 'scan';

  return (
    <div className="min-h-dvh pb-28 lg:pb-12">
      <header className="dots relative overflow-hidden rounded-b-[34px] bg-navy text-white lg:rounded-b-[48px]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,138,92,.35),transparent_65%)]" />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 pt-4 sm:px-6">
          <button type="button" onClick={startOver} className="flex items-center gap-2.5 rounded-xl" aria-label="SplitSnap, start a new bill">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-navy">
              <Icon name="receipt" size={20} stroke={2} />
            </span>
            <span className="text-[19px] font-bold tracking-tight">SplitSnap</span>
          </button>
          {state.receipt && (
            <button type="button" onClick={startOver} className="rounded-full px-3 py-1.5 text-sm font-semibold text-white/80 ring-1 ring-white/25 transition hover:bg-white/10 hover:text-white">
              New bill
            </button>
          )}
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pb-24 lg:pt-10">
          <div className="flex items-center gap-3">
            {stepIndex > 0 && (
              <button
                type="button"
                aria-label="Back"
                onClick={() => dispatch({ type: 'step', step: STEPS[stepIndex - 1].id })}
                className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 lg:hidden"
              >
                <Icon name="back" size={22} stroke={2.2} />
              </button>
            )}
            <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[34px]">
              {state.step === 'scan' ? (
                <>
                  Split the bill <span className="text-coral">before the card machine</span> comes back.
                </>
              ) : (
                current.title
              )}
            </h1>
          </div>
          {state.step === 'scan' && (
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/75 sm:text-base">
              Snap the receipt. Check what was read. Tap who had what. Everyone gets an exact share that adds up to the cent.
            </p>
          )}
          <nav aria-label="Steps" className="mt-6">
            <ol className="flex flex-wrap gap-1">
              {STEPS.map((s, i) => {
                const done = i < stepIndex;
                const here = i === stepIndex;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!reachable(i) || here}
                      onClick={() => dispatch({ type: 'step', step: s.id })}
                      aria-current={here ? 'step' : undefined}
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold transition sm:px-3 sm:text-[13px] ${
                        here ? 'bg-white text-navy' : done ? 'bg-white/15 text-white hover:bg-white/25' : 'text-white/55 ring-1 ring-white/15'
                      }`}
                    >
                      <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] ${here ? 'bg-navy text-white' : done ? 'bg-coral text-navy-deep' : 'bg-white/10'}`}>
                        {done ? <Icon name="check" size={12} stroke={3} /> : i + 1}
                      </span>
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      <main className={`relative mx-auto -mt-10 max-w-6xl px-4 sm:px-6 lg:-mt-14 ${showPaper ? 'lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-8' : ''}`}>
        {linkError && (
          <div role="alert" className="mb-4 rounded-2xl bg-bad-bg px-4 py-3 text-sm font-medium text-bad ring-1 ring-bad/20">
            {linkError}
          </div>
        )}
        {showPaper && (
          <aside className="hidden lg:sticky lg:top-6 lg:block">
            <ReceiptPaper receipt={state.receipt!} rec={rec!} photoUrl={state.photoUrl} />
          </aside>
        )}
        <div key={state.step} className="min-w-0 animate-rise">
          {state.step === 'scan' && (
            <ScanStep scanning={state.scanning} live={state.live} error={state.error} photoUrl={state.photoUrl} sampleId={state.sampleId} onFile={onFile} onSample={onSample} onCancel={startOver} />
          )}
          {state.step === 'review' && state.receipt && rec && (
            <ReviewStep state={state} rec={rec} dispatch={dispatch} onLiveScan={liveScanSample} onRescan={startOver} />
          )}
          {state.step === 'assign' && state.receipt && split && <AssignStep state={state} split={split} dispatch={dispatch} />}
          {state.step === 'settle' && state.receipt && split && rec && <SettleStep state={state} split={split} rec={rec} dispatch={dispatch} />}
        </div>
      </main>

      <footer className="mx-auto mt-14 max-w-6xl px-4 text-[13px] leading-relaxed text-ink-faint sm:px-6">
        Photos go to OpenAI to be read and are not stored by this app. Share links carry the whole split inside the link, so nothing is saved on a server.
      </footer>
    </div>
  );
}
