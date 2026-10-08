import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { GROQ_BASE_URL, withFallback } from '../../lib/ai.ts';
import { EXTRACTION_PROMPT, ExtractedReceipt } from '../../lib/extraction.ts';

let openaiClient: OpenAI | null = null;
let groqClient: OpenAI | null = null;
function openai() {
  // SDK retries 429 and 5xx with backoff; the timeout keeps a stuck call from holding the function.
  openaiClient ??= new OpenAI({ maxRetries: 2, timeout: 60_000 });
  return openaiClient;
}
function groq() {
  // Shorter than OpenAI's so a stuck Groq call still leaves time for the fallback inside maxDuration.
  groqClient ??= new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: GROQ_BASE_URL, maxRetries: 1, timeout: 25_000 });
  return groqClient;
}

export const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
export const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

export class ScanError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function scanReceipt(image: Uint8Array, mime: string) {
  const dataUrl = `data:${mime};base64,${Buffer.from(image).toString('base64')}`;
  const read = async (client: OpenAI, model: string) => {
    const response = await client.responses.parse({
      model,
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
    return { response, model };
  };

  const { response, model } = process.env.GROQ_API_KEY
    ? await withFallback(() => read(groq(), GROQ_VISION_MODEL), process.env.OPENAI_API_KEY ? () => read(openai(), MODEL) : null)
    : await read(openai(), MODEL);

  if (response.status === 'incomplete') {
    throw new ScanError('The receipt was too long to read in one go. Try cropping it.', 422);
  }
  const parsed = response.output_parsed;
  if (!parsed) throw new ScanError('The model could not read this image. Try a sharper photo.', 422);
  return { parsed, model, usage: response.usage ?? null };
}
