'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'light';

const variants: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-navy-deep shadow-[0_6px_16px_-8px_rgba(27,42,107,.8)] disabled:bg-line-strong disabled:shadow-none',
  secondary: 'bg-navy-soft text-navy hover:bg-[#d2daf3] disabled:opacity-50',
  ghost: 'bg-transparent text-ink-soft hover:bg-navy-wash hover:text-ink disabled:opacity-40',
  light: 'bg-white/12 text-white hover:bg-white/20 ring-1 ring-white/20',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition active:scale-[.97] disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-navy-wash p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
            value === o.value ? 'bg-navy text-white shadow-sm' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, color, size = 32, ring = false }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${ring ? 'ring-2 ring-white' : ''}`}
      style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

const paths: Record<string, ReactNode> = {
  camera: <><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" /><circle cx="12" cy="13" r="3.5" /></>,
  upload: <><path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.7v.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></>,
  share: <><path d="M12 15V3.5m0 0L8 7.5m4-4 4 4" /><path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H17" /></>,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 19.5c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5" /><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.8.7 3 2.3 3.5 4.7" /></>,
  receipt: <><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
  wand: <><path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6z" /></>,
};

export function Icon({ name, size = 20, className = '', stroke = 1.8 }: { name: keyof typeof paths; size?: number; className?: string; stroke?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[22px] bg-card shadow-[0_1px_0_rgba(18,24,51,.04),0_12px_32px_-18px_rgba(18,24,51,.22)] ring-1 ring-line ${className}`}>{children}</section>;
}
