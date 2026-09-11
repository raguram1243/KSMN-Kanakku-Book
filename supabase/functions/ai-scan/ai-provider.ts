// ============================================
// AI Provider — Google Gemini
// ============================================
// AI Scan runs entirely on a vision model: the document image is sent to
// Gemini and comes back as structured JSON. There is no OCR or text-extraction
// step anywhere in this pipeline.
//
// ── WHERE TO PUT YOUR API KEY ────────────────────────────────────────────────
// The key is a SERVER-SIDE secret and must never reach the browser bundle.
// Never add it to a VITE_-prefixed variable: Vite inlines those into the
// JavaScript it ships, which would publish your key to every visitor.
//
//   Production (required) — set it as a Supabase Edge Function secret:
//       supabase secrets set GEMINI_API_KEY=your_key_here
//
//   Local development — add the same line to the project's .env file:
//       GEMINI_API_KEY=your_key_here
//
// Get a key from Google AI Studio: https://aistudio.google.com/apikey
//
// Optional overrides:
//   GEMINI_MODEL - model id (default: gemini-3.6-flash)
// ─────────────────────────────────────────────────────────────────────────────

// gemini-2.5-flash was the original default, but Google stopped offering it to
// newly created API keys: requests fail with "no longer available to new users".
// 3.6-flash is the current stable Flash model and supports everything this flow
// needs - generateContent, inline image input, and responseMimeType JSON.
// Override with the GEMINI_MODEL secret without touching this file.
const DEFAULT_MODEL = 'gemini-3.6-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 60_000;

// Gemini sheds load with 503 ("model is overloaded" / "high demand") and
// throttles with 429. Both are transient and usually clear within seconds, so
// they are retried rather than surfaced as a failed scan.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

/** Carries the upstream HTTP status so the edge function can pass it through. */
export class AIProviderError extends Error {
  status: number;
  retryable: boolean;
  /** From a Retry-After header, when Gemini sends one. */
  retryAfterMs?: number;

  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.name = 'AIProviderError';
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AIProvider {
  analyzeDocument(
    fileBytes: Uint8Array,
    mimeType: string,
    prompt: string
  ): Promise<string>;
}

export function getProvider(): AIProvider {
  return new GeminiProvider();
}

class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    // @ts-ignore - Deno.env is available in Edge Functions
    this.apiKey = Deno.env.get('GEMINI_API_KEY') || '';
    // @ts-ignore - Deno.env is available in Edge Functions
    this.model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  }

  async analyzeDocument(
    fileBytes: Uint8Array,
    mimeType: string,
    prompt: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new AIProviderError(
        'GEMINI_API_KEY is not set. Add it with: supabase secrets set GEMINI_API_KEY=your_key',
        503
      );
    }

    let lastError: any;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.attempt(fileBytes, mimeType, prompt);
      } catch (error: any) {
        lastError = error;
        const canRetry = error instanceof AIProviderError && error.retryable;
        if (!canRetry || attempt === MAX_ATTEMPTS) break;

        // Honour Retry-After when Gemini sends one, else exponential backoff.
        const wait = error.retryAfterMs ?? RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(
          `[GeminiProvider] attempt ${attempt}/${MAX_ATTEMPTS} failed (${error.status}); retrying in ${wait}ms`
        );
        await sleep(wait);
      }
    }
    throw lastError;
  }

  /** One request to Gemini. Retry policy lives in analyzeDocument. */
  private async attempt(
    fileBytes: Uint8Array,
    mimeType: string,
    prompt: string
  ): Promise<string> {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: bytesToBase64(fileBytes) } },
          ],
        },
      ],
      generationConfig: {
        // Ask Gemini for raw JSON rather than prose that happens to contain
        // JSON. This is what makes the amounts reliable - no markdown fences,
        // no commentary to parse around.
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Header auth, not ?key= — query strings end up in access logs.
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `Gemini API error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson?.error?.message || errorMsg;
        } catch {
          errorMsg = `${errorMsg}: ${errorText.substring(0, 200)}`;
        }
        console.error('[GeminiProvider] API error:', response.status, errorText);

        if (response.status === 401 || response.status === 403) {
          throw new AIProviderError(
            'Gemini rejected the API key. Check the GEMINI_API_KEY secret.',
            502
          );
        }
        // Model retired, renamed, or not enabled for this key. Say which model
        // failed and which secret changes it, instead of only echoing Google.
        if (/not (found|available)|no longer available|does not exist|unsupported model/i.test(errorMsg)) {
          throw new AIProviderError(
            `${errorMsg} (configured model: "${this.model}") - set a different one with: ` +
            'supabase secrets set GEMINI_MODEL=<model-id>',
            502
          );
        }
        if (RETRYABLE_STATUSES.includes(response.status)) {
          // 503 is Gemini shedding load ("high demand"); 429 is throttling.
          const retryAfterHeader = response.headers?.get('retry-after');
          const retryAfterMs = retryAfterHeader
            ? Math.min(Number(retryAfterHeader) * 1000 || 0, 10_000)
            : undefined;
          const friendly =
            response.status === 429
              ? 'Gemini is rate limiting this key. Please wait a moment and try again.'
              : 'Gemini is busy right now. Please try again in a moment.';
          const err = new AIProviderError(friendly, response.status === 429 ? 429 : 503, true);
          if (retryAfterMs) err.retryAfterMs = retryAfterMs;
          throw err;
        }

        // 4xx we cannot fix by retrying - surface Google's own explanation.
        throw new AIProviderError(errorMsg, 502);
      }

      const data = await response.json();

      // A prompt can be refused outright, before any candidate is produced.
      const blockReason = data?.promptFeedback?.blockReason;
      if (blockReason) {
        throw new AIProviderError(`Gemini declined to process this document (${blockReason}).`, 422);
      }

      const candidate = data?.candidates?.[0];
      if (!candidate) {
        throw new AIProviderError('Gemini returned no result for this document.', 422);
      }

      // MAX_TOKENS means the JSON is truncated and will not parse; say so
      // plainly rather than failing later with a confusing parse error.
      if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
        throw new AIProviderError(`Gemini stopped early (${candidate.finishReason}). Please try another photo.`, 422);
      }

      const text = (candidate.content?.parts ?? [])
        .map((part: any) => part?.text)
        .filter((t: any) => typeof t === 'string')
        .join('');

      if (!text.trim()) {
        throw new AIProviderError('Gemini returned an empty response.', 422, true);
      }

      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new AIProviderError(
          'The document produced more data than one response can hold. Try a clearer or simpler page.',
          422
        );
      }

      return text;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        throw new AIProviderError(
          'AI request timed out after 60 seconds. Please try again.',
          504,
          true
        );
      }
      throw error;
    }
  }
}

// Health check (exposed via the function's /health path).
// Asks Gemini which models this key can actually use, so a retired or
// mistyped model id shows up here instead of as a failed scan for a user.
export async function checkAIProviderHealth(): Promise<{ status: string; message: string }> {
  // @ts-ignore - Deno.env is available in Edge Functions
  const apiKey = Deno.env.get('GEMINI_API_KEY') || '';
  // @ts-ignore - Deno.env is available in Edge Functions
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

  if (!apiKey) {
    return {
      status: 'error',
      message:
        'GEMINI_API_KEY is not configured. Set it with: supabase secrets set GEMINI_API_KEY=your_key',
    };
  }

  let available: string[];
  try {
    available = await listUsableModels(apiKey);
  } catch (error: any) {
    // Could not reach the catalogue; the key is at least present.
    return {
      status: 'warning',
      message: `Configured model "${model}", but could not verify it: ${error?.message || 'unknown error'}`,
    };
  }

  if (!available.includes(model)) {
    const flash = available.filter((m) => m.includes('flash')).slice(0, 5);
    const suggestions = (flash.length ? flash : available.slice(0, 5)).join(', ');
    return {
      status: 'error',
      message:
        `Model "${model}" is not available to this API key. ` +
        `Pick one of: ${suggestions || '(none returned)'} ` +
        'and set it with: supabase secrets set GEMINI_MODEL=<model-id>',
    };
  }

  return { status: 'ok', message: `Gemini provider configured (model: ${model})` };
}

/** Model ids this key may call with generateContent, without the "models/" prefix. */
async function listUsableModels(apiKey: string): Promise<string[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API_BASE}?pageSize=200`, {
      headers: { 'x-goog-api-key': apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`model list request failed (${response.status})`);
    }
    const data = await response.json();
    return (data?.models ?? [])
      .filter((m: any) => (m?.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => String(m?.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error?.name === 'AbortError') throw new Error('model list request timed out');
    throw error;
  }
}
// Base64 helpers (chunked to avoid call-stack limits on large images)
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}
