import { normalizeExtraction } from '../../../lib/extraction.ts';
import { check, tooMany } from '../../server/ratelimit.ts';
import { MODEL, ScanError, scanReceipt } from '../../server/scan.ts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const fail = (error: string, status: number) => Response.json({ error }, { status });

function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const tag = String.fromCharCode(...bytes.slice(0, 4), ...bytes.slice(8, 12));
  if (tag === 'RIFFWEBP') return 'image/webp';
  return null;
}

export async function POST(req: Request) {
  const length = Number(req.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(length)) return fail('Missing content length.', 411);
  if (length > MAX_BYTES) return fail('That image is over 4MB. The app shrinks photos before upload, so try again from the page.', 413);
  if (!req.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return fail('Send the image as multipart form data in a field named "image".', 400);
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get('image');
  } catch {
    return fail('Could not read the upload.', 400);
  }
  if (!(file instanceof File) || file.size === 0) return fail('No image received.', 400);
  if (file.size > MAX_BYTES) return fail('That image is over 4MB.', 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime || !TYPES.has(mime)) return fail('That file is not a JPEG, PNG or WebP image.', 415);

  // Only well-formed requests count against the limit.
  const gate = await check(req, 'scan');
  if (!gate.ok) return tooMany(gate);

  const started = Date.now();
  try {
    const { parsed, usage } = await scanReceipt(bytes, mime);
    if (!parsed.is_receipt) return fail('That does not look like a receipt. Try a photo of the whole bill.', 422);
    const receipt = normalizeExtraction(parsed);
    if (receipt.items.length === 0) return fail('No line items found. Try a closer, flatter photo.', 422);
    return Response.json({
      receipt,
      meta: {
        model: MODEL,
        ms: Date.now() - started,
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        remaining: gate.remaining,
      },
    });
  } catch (err) {
    if (err instanceof ScanError) return fail(err.message, err.status);
    console.error('scan failed', err instanceof Error ? err.message : err);
    return fail('The scan service had a problem. Try again in a moment.', 502);
  }
}
