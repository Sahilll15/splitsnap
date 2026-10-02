import type { Item, Receipt } from '../../lib/receipt.ts';
import { DEFAULT_OPTIONS, type Assignments, type Mode, type Person, type SplitOptions } from '../../lib/split.ts';
import type { SplitState } from '../../lib/share.ts';
import { nextColor } from '../../lib/samples.ts';

export type Step = 'scan' | 'review' | 'assign' | 'settle';
export type Source = 'scan' | 'sample' | 'link';
export type ScanMeta = { model: string; ms: number; inputTokens: number | null; outputTokens: number | null; remaining?: number };

export type AppState = {
  step: Step;
  receipt: Receipt | null;
  photoUrl: string | null;
  source: Source | null;
  sampleId: string | null;
  meta: ScanMeta | null;
  scanning: boolean;
  live: boolean;
  error: string | null;
  people: Person[];
  assignments: Assignments;
  options: SplitOptions;
  payerId: string | null;
  activeId: string | null;
  seq: number;
};

export const initialState: AppState = {
  step: 'scan',
  receipt: null,
  photoUrl: null,
  source: null,
  sampleId: null,
  meta: null,
  scanning: false,
  live: false,
  error: null,
  people: [],
  assignments: {},
  options: DEFAULT_OPTIONS,
  payerId: null,
  activeId: null,
  seq: 1,
};

export type Action =
  | { type: 'scanStart'; photoUrl: string; sampleId?: string | null; live: boolean }
  | { type: 'scanDone'; receipt: Receipt; meta: ScanMeta | null; source: Source; people?: string[] }
  | { type: 'scanError'; error: string }
  | { type: 'reset' }
  | { type: 'step'; step: Step }
  | { type: 'receipt'; patch: Partial<Receipt> }
  | { type: 'item'; id: string; patch: Partial<Item> }
  | { type: 'addItem' }
  | { type: 'removeItem'; id: string }
  | { type: 'addPerson'; name: string }
  | { type: 'removePerson'; id: string }
  | { type: 'active'; id: string }
  | { type: 'toggle'; itemId: string; personId: string }
  | { type: 'everyone'; itemId: string }
  | { type: 'restEvenly' }
  | { type: 'option'; key: keyof SplitOptions; mode: Mode }
  | { type: 'payer'; id: string | null }
  | { type: 'shared'; state: SplitState }
  | { type: 'restore'; state: AppState };

function makePeople(names: string[], start: Person[], seq: number) {
  const people = [...start];
  names.forEach((name, i) => {
    people.push({ id: `p${seq + i}`, name, color: nextColor(people.map((p) => p.color)) });
  });
  return { people, seq: seq + names.length };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'scanStart':
      return { ...s, step: 'scan', scanning: true, live: a.live, error: null, photoUrl: a.photoUrl, sampleId: a.sampleId ?? null };
    case 'scanDone': {
      const made = a.people?.length ? makePeople(a.people, [], s.seq) : { people: s.people, seq: s.seq };
      const people = made.people;
      return {
        ...s, seq: made.seq, scanning: false, error: null, receipt: a.receipt, meta: a.meta, source: a.source, step: 'review',
        people, assignments: {}, payerId: null, activeId: people[0]?.id ?? null,
      };
    }
    case 'scanError':
      return { ...s, scanning: false, error: a.error };
    case 'reset':
      return { ...initialState, seq: s.seq, people: s.people, activeId: s.people[0]?.id ?? null };
    case 'step':
      return { ...s, step: a.step };
    case 'receipt':
      return s.receipt ? { ...s, receipt: { ...s.receipt, ...a.patch } } : s;
    case 'item':
      if (!s.receipt) return s;
      return { ...s, receipt: { ...s.receipt, items: s.receipt.items.map((it) => (it.id === a.id ? { ...it, ...a.patch } : it)) } };
    case 'addItem': {
      if (!s.receipt) return s;
      const id = `n${s.seq}`;
      return { ...s, seq: s.seq + 1, receipt: { ...s.receipt, items: [...s.receipt.items, { id, name: '', qty: 1, unit: null, total: 0 }] } };
    }
    case 'removeItem': {
      if (!s.receipt) return s;
      const assignments = { ...s.assignments };
      delete assignments[a.id];
      return { ...s, assignments, receipt: { ...s.receipt, items: s.receipt.items.filter((it) => it.id !== a.id) } };
    }
    case 'addPerson': {
      const name = a.name.trim().slice(0, 24);
      if (!name || s.people.length >= 30) return s;
      const { people, seq } = makePeople([name], s.people, s.seq);
      return { ...s, people, seq, activeId: people.at(-1)!.id };
    }
    case 'removePerson': {
      const people = s.people.filter((p) => p.id !== a.id);
      const assignments = Object.fromEntries(Object.entries(s.assignments).map(([k, v]) => [k, v.filter((id) => id !== a.id)]));
      return {
        ...s, people, assignments,
        payerId: s.payerId === a.id ? null : s.payerId,
        activeId: s.activeId === a.id ? (people[0]?.id ?? null) : s.activeId,
      };
    }
    case 'active':
      return { ...s, activeId: a.id };
    case 'toggle': {
      const cur = s.assignments[a.itemId] ?? [];
      const next = cur.includes(a.personId) ? cur.filter((id) => id !== a.personId) : [...cur, a.personId];
      return { ...s, assignments: { ...s.assignments, [a.itemId]: next } };
    }
    case 'everyone': {
      const all = s.people.map((p) => p.id);
      const cur = s.assignments[a.itemId] ?? [];
      const next = cur.length === all.length ? [] : all;
      return { ...s, assignments: { ...s.assignments, [a.itemId]: next } };
    }
    case 'restEvenly': {
      if (!s.receipt) return s;
      const all = s.people.map((p) => p.id);
      const assignments = { ...s.assignments };
      for (const it of s.receipt.items) if (!(assignments[it.id]?.length)) assignments[it.id] = all;
      return { ...s, assignments };
    }
    case 'option':
      return { ...s, options: { ...s.options, [a.key]: a.mode } };
    case 'payer':
      return { ...s, payerId: a.id };
    case 'restore':
      return { ...initialState, ...a.state, scanning: false, error: null };
    case 'shared':
      return {
        ...initialState, step: 'settle', source: 'link', receipt: a.state.receipt, people: a.state.people,
        assignments: a.state.assignments, options: a.state.options, payerId: a.state.payerId,
        activeId: a.state.people[0]?.id ?? null, seq: 1000,
      };
  }
}
