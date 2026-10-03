import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatMoney } from '../../lib/money.ts';
import type { Receipt } from '../../lib/receipt.ts';
import { computeSplit, type Assignments, type Person } from '../../lib/split.ts';
import osteria from '../../public/samples/osteria-lume.json';
import { JsonLd } from '../components/JsonLd.tsx';
import SiteFooter from '../components/SiteFooter';
import { breadcrumbs, pageMetadata } from '../lib/seo.ts';

export const metadata: Metadata = pageMetadata({
  title: 'How it works: reading the receipt and splitting tax and tip',
  description:
    'How SplitSnap reads a receipt photo, checks the maths, splits shared dishes, tax and tip to the cent, and what is sent to the server. With a worked example.',
  path: '/how-it-works',
});

const jsonLd = {
  '@context': 'https://schema.org',
  ...breadcrumbs([
    { name: 'Home', path: '/' },
    { name: 'How it works', path: '/how-it-works' },
  ]),
};

// Worked example: the Osteria Lume sample's saved scan, split by the same code the app runs.
const receipt = osteria.receipt as Receipt;
const people: Person[] = ['Ana', 'Ben', 'Chloe', 'Dev'].map((name, i) => ({ id: `p${i + 1}`, name, color: '#000000' }));
const assignments: Assignments = {
  i1: ['p1', 'p2', 'p3', 'p4'],
  i2: ['p1', 'p2'],
  i3: ['p1', 'p3'],
  i4: ['p2'],
  i5: ['p4'],
  i6: ['p3'],
  i7: ['p1', 'p2'],
  i8: ['p1', 'p2', 'p3', 'p4'],
  i9: ['p1', 'p3', 'p4'],
};
const split = computeSplit(receipt, people, assignments);
const fmt = (n: number) => formatMoney(n, receipt.currency);
const nameOf = (id: string) => people.find((p) => p.id === id)!.name;
const listNames = (ids: string[]) => (ids.length === people.length ? 'everyone' : ids.map(nameOf).join(', '));

const card = 'rounded-[22px] bg-card p-5 shadow-[0_1px_0_rgba(18,24,51,.04),0_12px_32px_-18px_rgba(18,24,51,.22)] ring-1 ring-line sm:p-7';
const h2 = 'text-xl font-bold tracking-tight sm:text-2xl';
const body = 'mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={card}>
      <h2 id={id} className={h2}>
        {title}
      </h2>
      <div className={body}>{children}</div>
    </section>
  );
}

const STEPS = [
  { name: 'Scan', text: 'Take a photo of the receipt or upload one. Your device shrinks it, then the server sends it to a vision model that reads the items, tax, tip and total.' },
  { name: 'Check', text: 'The app redoes the receipt maths and shows what matches and what does not. You can edit any line, amount or charge before going on.' },
  { name: 'Assign', text: 'Add the people at the table, pick one, and tap what they had. Tap several people on one dish to share it.' },
  { name: 'Settle', text: 'Each person gets a total, and if one person paid, a list of who pays them back. Send it as text, an image or a link.' },
];

const LIMITS: [string, string][] = [
  ['Upload size', 'Up to 4 MB per image. Photos are shrunk on your device to 2000 px on the long edge and under 3.5 MB first.'],
  ['File types', 'The server accepts JPEG, PNG and WebP, checked by the file bytes. HEIC photos work when your browser can open them, because they are converted to JPEG on your device.'],
  ['Scans', 'By default, 4 live scans per hour per IP address. The hour starts at your first counted scan. The sample receipts do not count.'],
  ['Scan time', 'A scan gives up after 60 seconds. Busy or failed model calls are retried twice.'],
  ['Receipt length', 'Up to 200 line items. If a very long receipt cannot be read in one answer, the app asks you to crop it.'],
  ['People', 'Up to 30 people per bill, names up to 24 characters.'],
  ['Share links', 'The encoded split can be up to 12,000 characters, which covers a long receipt and a big table.'],
  ['Currencies', 'Any ISO 4217 currency. Amounts are kept in the smallest unit (cents, pence, whole yen). If the currency is not recognized, USD is assumed and the app says so.'],
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-dvh pb-12">
      <JsonLd data={jsonLd} />
      <header className="dots relative overflow-hidden rounded-b-[34px] bg-navy text-white lg:rounded-b-[48px]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,138,92,.35),transparent_65%)]" />
        <div className="relative mx-auto max-w-3xl px-4 pt-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-navy">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
                <path d="M9 8h6M9 12h6M9 16h3" />
              </svg>
            </span>
            <span className="text-[19px] font-bold tracking-tight">SplitSnap</span>
          </Link>
        </div>
        <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 lg:pb-20 lg:pt-10">
          <nav aria-label="Breadcrumb" className="text-[13px] text-white/75">
            <ol className="flex flex-wrap gap-1.5">
              <li>
                <Link href="/" className="hover:text-white hover:underline">
                  Home
                </Link>{' '}
                /
              </li>
              <li aria-current="page">How it works</li>
            </ol>
          </nav>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight sm:text-[34px]">How SplitSnap splits a bill</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/75 sm:text-base">
            SplitSnap is a free web app that splits a restaurant bill from a photo of the receipt. There is no account and nothing to install. It reads the
            items, tax, tip and total, checks that the numbers add up, and gives each person a share. The shares always add up to the receipt total, to the cent.
          </p>
        </div>
      </header>

      <main className="relative mx-auto -mt-10 max-w-3xl space-y-5 px-4 sm:px-6 lg:-mt-12">
        <section aria-labelledby="steps" className={card}>
          <h2 id="steps" className={h2}>
            The four steps
          </h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.name} className="rounded-2xl bg-navy-wash p-4 ring-1 ring-line">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[12px] text-white">{i + 1}</span>
                  {s.name}
                </p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-soft">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <Section id="reading" title="How the receipt is read">
          <p>
            Your browser shrinks the photo on a canvas and posts it to the app&apos;s one server route. The server checks the size and file type, counts the scan
            against the rate limit, and sends the image to the OpenAI Responses API. The default model is gpt-5.4-mini.
          </p>
          <p>
            The model answers in a fixed schema: merchant, date, currency, each line item (name, quantity, unit price, line total), subtotal, tax, whether tax is
            already in the prices, tip, service charge, discounts, total and short warnings. It is told to copy the numbers as printed and not to fix the arithmetic,
            because the app checks the maths itself.
          </p>
          <p>The sample receipts load a saved result from a real scan of the same photo, so trying a sample makes no server call.</p>
        </Section>

        <Section id="checking" title="Checking what was read">
          <p>Before you assign anything, the app runs three checks in your browser:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Each line: quantity times unit price against the line total. A printed unit price can itself be rounded, so on multi-quantity lines a small gap, up to about half a cent per unit, is allowed.</li>
            <li>The items against the printed subtotal.</li>
            <li>The subtotal, minus discounts, plus tax, tip and service, against the printed total.</li>
          </ul>
          <p>
            A banner shows each result. Any line that does not match is highlighted with a one-tap fix. For example, the Café Marigold sample reads 2 orange juices at
            €3.20 with a printed line total of €7.40, so that line is flagged with €6.40 as the suggested value.
          </p>
          <p>
            If the receipt still does not add up after your edits, nothing is hidden: the split uses the printed total, and the gap is shared out as its own line in
            proportion to what people had.
          </p>
        </Section>

        <Section id="assigning" title="Assigning items">
          <p>
            Add people, pick one, and tap the dishes they had. Tapping several people on one dish splits it evenly between them. When a dish does not divide evenly, the
            leftover cents go to whoever has the lowest item total so far, then by the order people were added, so the extra pennies do not pile up on one person.
          </p>
          <p>You can only settle once every item has someone on it.</p>
        </Section>

        <section aria-labelledby="charges" className={card}>
          <h2 id="charges" className={h2}>
            How tax, tip and charges are split
          </h2>
          <div className={body}>
            <p>
              Tax, tip, service charge and discounts can each be split by what people had (the default) or evenly. By what people had means each person pays the same
              percentage of the charge as their share of the items. Evenly means equal parts between the people who ordered something.
            </p>
            <p>
              All money is kept as whole cents. Charges are divided with the largest remainder method: everyone first gets their share rounded down, then the
              cents left over go to the people with the largest remainders, and ties go to the person added first. Every column adds up to the receipt amount, and
              every share adds up to the total. When tax is already included in the prices, as with UK VAT, it is not added again.
            </p>
          </div>

          <h3 className="mt-6 text-[17px] font-bold tracking-tight">Worked example: the Osteria Lume sample</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            The receipt has a {fmt(receipt.subtotal ?? 0)} subtotal, {fmt(receipt.tax)} tax and a {fmt(receipt.tip)} tip written in pen, for a{' '}
            {fmt(receipt.total ?? 0)} total. Here is one way four people could assign it:
          </p>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-[14px] text-ink-soft sm:grid-cols-2">
            {receipt.items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3 border-b border-line py-1">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{it.name}</span>, {listNames(assignments[it.id])}
                </span>
                <span className="num shrink-0">{fmt(it.total)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[14px]">
              <caption className="sr-only">Each person&apos;s share of the Osteria Lume bill</caption>
              <thead>
                <tr className="border-b border-line-strong text-[12px] uppercase tracking-wider text-ink-faint">
                  <th scope="col" className="py-2 pr-3 font-semibold">Person</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Items</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Tax</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Tip</th>
                  <th scope="col" className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="num">
                {split.people.map((s) => (
                  <tr key={s.id} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 font-sans font-semibold">{nameOf(s.id)}</th>
                    <td className="py-2 pr-3 text-right">{fmt(s.items)}</td>
                    <td className="py-2 pr-3 text-right">{fmt(s.tax)}</td>
                    <td className="py-2 pr-3 text-right">{fmt(s.tip)}</td>
                    <td className="py-2 text-right font-semibold">{fmt(s.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="num">
                <tr>
                  <th scope="row" className="py-2 pr-3 font-sans font-semibold">Sum</th>
                  <td className="py-2 pr-3 text-right">{fmt(split.componentTotals.items)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(split.componentTotals.tax)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(split.componentTotals.tip)}</td>
                  <td className="py-2 text-right font-semibold">{fmt(split.payTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className={body}>
            <p>
              Ana had {fmt(split.people[0].items)} of the {fmt(split.componentTotals.items)} in items, so she pays that same share of the tax:{' '}
              {fmt(receipt.tax)} times {fmt(split.people[0].items)} divided by {fmt(split.componentTotals.items)} is about $6.5017, which rounds down to{' '}
              {fmt(split.people[0].tax)}.
            </p>
            <p>
              Rounded down, the four tax shares come to $23.59, so 2 cents are left. Ben has the largest remainder and gets one. Chloe and Dev have the same items
              total and tie, so the cent goes to Chloe, who was added first. That is why their tax differs by a cent.
            </p>
          </div>
        </section>

        <section aria-labelledby="where" className={card}>
          <h2 id="where" className={h2}>
            What runs in your browser and what runs on the server
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-navy-wash p-4 ring-1 ring-line">
              <h3 className="font-semibold">In your browser</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14.5px] leading-relaxed text-ink-soft">
                <li>Shrinking the photo before upload</li>
                <li>The receipt checks and every edit you make</li>
                <li>The split, the settle-up list and the share text</li>
                <li>The share image, drawn on a canvas</li>
                <li>The share link, compressed into the part of the URL after the #, which browsers do not send to servers</li>
                <li>Keeping the current bill in this tab&apos;s session storage, so a reload does not lose it</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-navy-wash p-4 ring-1 ring-line">
              <h3 className="font-semibold">On the server</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14.5px] leading-relaxed text-ink-soft">
                <li>One route that receives the shrunk photo</li>
                <li>Size and file type checks</li>
                <li>The per IP rate limit, counted in Redis</li>
                <li>The call to OpenAI that reads the receipt, with the API key kept on the server</li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="limits" className={card}>
          <h2 id="limits" className={h2}>
            Limits
          </h2>
          <dl className="mt-4 divide-y divide-line text-[14.5px]">
            {LIMITS.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className="font-semibold">{k}</dt>
                <dd className="leading-relaxed text-ink-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Section id="privacy" title="Privacy">
          <p>
            A live scan sends the shrunk photo to this app&apos;s server, which passes it to OpenAI to be read. The request asks OpenAI not to store the response, and
            the server does not save the photo or the result.
          </p>
          <p>
            Names, assignments and the split never leave your browser unless you share them. A share link holds the whole split inside the link, so anyone you send it
            to can open it without a server. The rate limit keeps a count per IP address in Redis, which expires with the hour window.
          </p>
        </Section>

        <div className="pt-2 text-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-navy px-5 text-[15px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(27,42,107,.8)] transition hover:bg-navy-deep"
          >
            Split a bill
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
