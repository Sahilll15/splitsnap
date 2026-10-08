import { APIConnectionError } from 'openai';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/** Rate limits, server errors and network failures are worth one retry on another provider. */
export function shouldFallback(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  return err instanceof APIConnectionError;
}

/** Runs the Groq call, then the OpenAI call once if Groq failed in a way another provider might not. */
export async function withFallback<T>(
  groq: () => Promise<T>,
  openai: (() => Promise<T>) | null,
  warn: (message: string) => void = console.warn,
): Promise<T> {
  try {
    return await groq();
  } catch (err) {
    if (!openai || !shouldFallback(err)) throw err;
    warn(`Groq failed (${err instanceof Error ? err.message : String(err)}), retrying with OpenAI`);
    return openai();
  }
}
