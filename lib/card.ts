import { formatMoney } from './money.ts';
import type { Receipt } from './receipt.ts';
import { settleUp, type Person, type SplitResult } from './split.ts';

// Browser only. next/font hashes family names, so read the real ones from the CSS variables.
function family(variable: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '...').width > max) t = t.slice(0, -1);
  return t + '...';
}

export async function renderCard(receipt: Receipt, people: Person[], result: SplitResult, payerId: string | null) {
  await document.fonts.ready;
  const sans = family('--font-ui', 'system-ui, sans-serif');
  const mono = family('--font-num', 'ui-monospace, monospace');
  const fmt = (n: number) => formatMoney(n, receipt.currency);
  const transfers = settleUp(result, payerId);
  const byId = new Map(people.map((p) => [p.id, p]));

  const W = 1080;
  const rowH = 112;
  const H = 360 + result.people.length * rowH + (transfers.length ? 90 + transfers.length * 64 : 0) + 150;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1b2a6b');
  bg.addColorStop(1, '#111b4d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = 12; x < W; x += 24) for (let y = 12; y < 300; y += 24) ctx.fillRect(x, y, 2, 2);

  ctx.fillStyle = '#ffffff';
  ctx.font = `600 30px ${sans}`;
  ctx.fillText('SplitSnap', 72, 92);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 30px ${sans}`;
  ctx.fillText(fit(ctx, [receipt.merchant || 'Receipt', receipt.date].filter(Boolean).join('  ·  '), W - 144), 72, 160);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 84px ${mono}`;
  ctx.fillText(fmt(result.payTotal), 72, 252);

  const top = 310;
  const cardH = H - top - 110;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 48, top, W - 96, cardH, 36);
  ctx.fill();

  let y = top + 56;
  for (const s of result.people) {
    const p = byId.get(s.id)!;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(120, y + 22, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 28px ${sans}`;
    ctx.textAlign = 'center';
    ctx.fillText((p.name[0] ?? '?').toUpperCase(), 120, y + 32);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#121833';
    ctx.font = `600 36px ${sans}`;
    ctx.fillText(fit(ctx, p.name + (p.id === payerId ? ' (paid)' : ''), 520), 172, y + 22);
    ctx.fillStyle = '#8a92ad';
    ctx.font = `500 24px ${sans}`;
    ctx.fillText(`${s.lines.length} item${s.lines.length === 1 ? '' : 's'}`, 172, y + 58);
    ctx.fillStyle = '#121833';
    ctx.font = `600 40px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(fmt(s.total), W - 100, y + 36);
    ctx.textAlign = 'left';
    y += rowH;
    ctx.fillStyle = '#e2e6f0';
    ctx.fillRect(100, y - 26, W - 200, 2);
  }

  if (transfers.length) {
    y += 20;
    ctx.fillStyle = '#545d7e';
    ctx.font = `600 24px ${sans}`;
    ctx.fillText('SETTLE UP', 100, y);
    y += 52;
    for (const t of transfers) {
      ctx.fillStyle = '#121833';
      ctx.font = `500 30px ${sans}`;
      ctx.fillText(fit(ctx, `${byId.get(t.from)!.name} pays ${byId.get(t.to)!.name}`, 560), 100, y);
      ctx.font = `600 30px ${mono}`;
      ctx.textAlign = 'right';
      ctx.fillText(fmt(t.amount), W - 100, y);
      ctx.textAlign = 'left';
      y += 64;
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 24px ${sans}`;
  ctx.fillText('Shares add up exactly to the receipt total.', 72, H - 50);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the image.'))), 'image/png'),
  );
}
