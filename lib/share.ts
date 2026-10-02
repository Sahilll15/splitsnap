import { z } from 'zod';
import type { Receipt } from './receipt.ts';
import type { Assignments, Person, SplitOptions } from './split.ts';

export type SplitState = {
  receipt: Receipt;
  people: Person[];
  assignments: Assignments;
  options: SplitOptions;
  payerId: string | null;
};

const VERSION = 'v1';
export const MAX_ENCODED = 12_000;

const int = z.number().int().min(-1e12).max(1e12);
const mode = z.enum(['proportional', 'even']);
const text = (max: number) => z.string().max(max);

// Short keys keep the link small enough to paste into a group chat.
const Wire = z.object({
  m: text(80), d: text(20).nullable(), c: z.string().regex(/^[A-Z]{3}$/),
  i: z.array(z.tuple([text(80), z.number().min(-1e6).max(1e6), int.nullable(), int])).max(200),
  s: int.nullable(), t: int, ti: z.boolean(), tp: int, sv: int, ds: int, to: int.nullable(),
  p: z.array(z.tuple([text(24), z.string().regex(/^#[0-9a-fA-F]{6}$/)])).max(30),
  a: z.array(z.array(z.number().int().min(0).max(29)).max(30)),
  o: z.tuple([mode, mode, mode, mode]),
  py: z.number().int().min(-1).max(29),
});

export function toWire(state: SplitState) {
  const { receipt: r, people, assignments, options, payerId } = state;
  const pIndex = new Map(people.map((p, i) => [p.id, i]));
  return {
    m: r.merchant, d: r.date, c: r.currency,
    i: r.items.map((it) => [it.name, it.qty, it.unit, it.total] as const),
    s: r.subtotal, t: r.tax, ti: r.taxIncluded, tp: r.tip, sv: r.service, ds: r.discount, to: r.total,
    p: people.map((p) => [p.name, p.color] as const),
    a: r.items.map((it) => (assignments[it.id] ?? []).map((id) => pIndex.get(id)).filter((n): n is number => n !== undefined)),
    o: [options.tax, options.tip, options.service, options.discount] as const,
    py: payerId && pIndex.has(payerId) ? pIndex.get(payerId)! : -1,
  };
}

export function fromWire(raw: unknown): SplitState {
  const w = Wire.parse(raw);
  const people: Person[] = w.p.map(([name, color], i) => ({ id: `p${i + 1}`, name, color }));
  const items = w.i.map(([name, qty, unit, total], i) => ({ id: `i${i + 1}`, name, qty, unit, total }));
  const assignments: Assignments = {};
  items.forEach((it, i) => {
    const ids = (w.a[i] ?? []).filter((n) => n < people.length).map((n) => people[n].id);
    if (ids.length) assignments[it.id] = [...new Set(ids)];
  });
  return {
    receipt: {
      merchant: w.m, date: w.d, currency: w.c, items,
      subtotal: w.s, tax: w.t, taxIncluded: w.ti, tip: w.tp, service: w.sv, discount: w.ds, total: w.to,
      notes: [],
    },
    people,
    assignments,
    options: { tax: w.o[0], tip: w.o[1], service: w.o[2], discount: w.o[3] },
    payerId: w.py >= 0 && w.py < people.length ? people[w.py].id : null,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  const reader = out.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) throw new Error('payload too large');
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    merged.set(c, at);
    at += c.length;
  }
  return merged;
}

/** State -> URL-safe string for the hash. Nothing is stored on a server. */
export async function encodeState(state: SplitState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toWire(state)));
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  return `${VERSION}.${toBase64Url(packed)}`;
}

export async function decodeState(encoded: string): Promise<SplitState> {
  const [version, body] = encoded.split('.', 2);
  if (version !== VERSION || !body) throw new Error('Unknown link format.');
  if (body.length > MAX_ENCODED) throw new Error('Link is too long.');
  // Cap the inflated size so a crafted link cannot decompress into something huge.
  const json = await pipe(fromBase64Url(body), new DecompressionStream('deflate-raw'), 200_000);
  return fromWire(JSON.parse(new TextDecoder().decode(json)));
}
