import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { EXTRACTION_PROMPT, ExtractedReceipt } from '../../lib/extraction.ts';

let client: OpenAI | null = null;
function openai() {
  // SDK retries 429 and 5xx with backoff; the timeout keeps a stuck call from holding the function.
  client ??= new OpenAI({ maxRetries: 2, timeout: 60_000 });
  return client;
}

export const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

export class ScanError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function scanReceipt(image: Uint8Array, mime: string) {
  const dataUrl = `data:${mime};base64,${Buffer.from(image).toString('base64')}`;
  const response = await openai().responses.parse({
    model: MODEL,
    instructions: EXTRACTION_PROMPT,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Extract this receipt.' },
          { type: 'input_image', image_url: dataUrl, detail: 'high' },
        ],
      },
    ],
    text: { format: zodTextFormat(ExtractedReceipt, 'receipt') },
    max_output_tokens: 6000,
    store: false,
  });

  if (response.status === 'incomplete') {
    throw new ScanError('The receipt was too long to read in one go. Try cropping it.', 422);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new ScanError('The model could not read this image. Try a sharper photo.', 422);
  return { parsed, usage: response.usage ?? null };
}
