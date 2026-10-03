'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { SAMPLES, type Sample } from '../../lib/samples.ts';
import { Button, Card, Icon } from './ui';

const STAGES = ['Shrinking the photo', 'Reading line items', 'Reading tax, tip and totals', 'Almost there'];

function ScanningView({ photoUrl, onCancel }: { photoUrl: string | null; onCancel: () => void }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="mx-auto max-w-3xl p-5 sm:p-8">
      <div className="grid items-center gap-6 sm:grid-cols-[220px_1fr]">
        <div className="relative mx-auto h-[300px] w-[210px] overflow-hidden rounded-2xl bg-navy-wash ring-1 ring-line">
          {photoUrl && <img src={photoUrl} alt="Your receipt" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-navy/20" />
          <div className="absolute inset-x-3 h-[3px] animate-scan rounded-full bg-coral shadow-[0_0_18px_4px_rgba(255,138,92,.65)]" />
          {['left-2 top-2 border-l-[3px] border-t-[3px]', 'right-2 top-2 border-r-[3px] border-t-[3px]', 'left-2 bottom-2 border-l-[3px] border-b-[3px]', 'right-2 bottom-2 border-r-[3px] border-b-[3px]'].map((c) => (
            <span key={c} className={`absolute h-6 w-6 rounded-[6px] border-white ${c}`} />
          ))}
        </div>
        <div aria-live="polite">
          <p className="text-[13px] font-semibold uppercase tracking-[.12em] text-coral">Scanning</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">{STAGES[stage]}...</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            A vision model is reading every line. Next you check its work: the app does the maths itself and flags anything that does not add up.
          </p>
          <div className="mt-5 space-y-2.5">
            {[88, 72, 80].map((w, i) => (
              <div key={i} className="skeleton h-3.5 rounded-full" style={{ width: `${w}%` }} />
            ))}
          </div>
          <Button variant="ghost" className="mt-5 -ml-3" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Illustration() {
  return (
    <svg viewBox="0 0 220 170" className="mx-auto h-36 w-auto sm:h-40" aria-hidden>
      <ellipse cx="110" cy="156" rx="78" ry="9" fill="#dfe5f7" />
      <rect x="62" y="12" width="96" height="140" rx="16" fill="#1b2a6b" />
      <rect x="68" y="20" width="84" height="124" rx="11" fill="#f3f5fc" />
      <path d="M82 34h56v92l-4.7-3.2-4.6 3.2-4.7-3.2-4.6 3.2-4.7-3.2-4.6 3.2-4.7-3.2-4.6 3.2-4.7-3.2L82 126z" fill="#fff" stroke="#c9cfde" />
      <rect x="92" y="44" width="36" height="5" rx="2.5" fill="#1b2a6b" />
      {[58, 68, 78, 88].map((y, i) => (
        <g key={y}>
          <rect x="90" y={y} width={i === 2 ? 22 : 28} height="3.5" rx="1.75" fill="#c9cfde" />
          <rect x="120" y={y} width="12" height="3.5" rx="1.75" fill={i === 2 ? '#ff8a5c' : '#8a92ad'} />
        </g>
      ))}
      <rect x="90" y="102" width="42" height="5" rx="2.5" fill="#1b2a6b" />
      <path d="M74 30v-6h6M146 30v-6h-6M74 130v6h6M146 130v6h-6" stroke="#ff8a5c" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="176" cy="40" r="15" fill="#ff8a5c" />
      <path d="M169 40.5l4.5 4.5 8-9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="38" cy="96" r="12" fill="#2563eb" />
      <circle cx="30" cy="124" r="9" fill="#0d9488" />
      <circle cx="190" cy="112" r="10" fill="#7c3aed" />
    </svg>
  );
}

export default function ScanStep({
  scanning,
  live,
  error,
  photoUrl,
  sampleId,
  onFile,
  onSample,
  onCancel,
}: {
  scanning: boolean;
  live: boolean;
  error: string | null;
  photoUrl: string | null;
  sampleId: string | null;
  onFile: (f: File) => void;
  onSample: (s: Sample) => void;
  onCancel: () => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (scanning && live) return <ScanningView photoUrl={photoUrl} onCancel={onCancel} />;

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile(f);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card className="overflow-hidden">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={`m-3 rounded-[18px] border-2 border-dashed px-5 py-8 text-center transition sm:m-4 sm:py-10 ${
            dragging ? 'border-coral bg-[#fff6f1]' : 'border-line-strong/70 bg-navy-wash/60'
          }`}
        >
          <Illustration />
          <h2 className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">No bill yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[15px] leading-relaxed text-ink-soft">
            Take a photo of the receipt, or drop an image here. Lay it flat and fit the whole thing in the frame.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
            <Button onClick={() => camera.current?.click()} className="sm:hidden">
              <Icon name="camera" /> Take photo
            </Button>
            <Button onClick={() => upload.current?.click()} variant="primary" className="max-sm:hidden">
              <Icon name="upload" /> Upload receipt
            </Button>
            <Button onClick={() => upload.current?.click()} variant="secondary" className="sm:hidden">
              <Icon name="image" /> Choose from photos
            </Button>
          </div>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} aria-label="Take a photo of the receipt" />
          <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" onChange={pick} aria-label="Upload a receipt image" />
          <p className="mt-4 text-[12.5px] text-ink-faint">JPEG, PNG, WebP or HEIC. Big photos are shrunk on your device first.</p>
        </div>
        {error && (
          <div role="alert" className="mx-3 mb-3 flex items-start gap-3 rounded-2xl bg-bad-bg px-4 py-3 text-[14px] text-bad ring-1 ring-bad/15 sm:mx-4 sm:mb-4">
            <Icon name="alert" className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">That did not work</p>
              <p className="mt-0.5 text-bad/90">{error}</p>
            </div>
          </div>
        )}
      </Card>

      <section aria-labelledby="samples">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 id="samples" className="text-[15px] font-bold">Try a sample</h2>
          <span className="text-[12.5px] text-ink-faint">Opens instantly, no upload</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {SAMPLES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSample(s)}
              disabled={scanning}
              style={{ animationDelay: `${80 + i * 70}ms` }}
              className="group flex animate-rise items-center gap-3 rounded-[20px] bg-card p-2.5 text-left ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(18,24,51,.45)] hover:ring-line-strong disabled:opacity-60 sm:flex-col sm:items-stretch"
            >
              <span className="relative block h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-navy-wash sm:h-36 sm:w-full">
                <img
                  src={`/samples/thumbs/${s.id}-128.webp`}
                  srcSet={`/samples/thumbs/${s.id}-128.webp 128w, /samples/thumbs/${s.id}-480.webp 480w`}
                  sizes="(min-width: 640px) 240px, 64px"
                  width={128}
                  height={192}
                  alt=""
                  className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-105"
                />
                {scanning && sampleId === s.id && <span className="absolute inset-0 animate-pulse bg-navy/30" />}
              </span>
              <span className="min-w-0 px-1 sm:pb-1.5">
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-[13px] leading-snug text-ink-soft">{s.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
