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
//   GEMINI_MODEL - model id (default: gemini-2.5-flash)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 60_000;

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
      throw new Error(
        'GEMINI_API_KEY is not set. Add it with: supabase secrets set GEMINI_API_KEY=your_key'
      );
    }

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
          throw new Error('Gemini rejected the API key. Check the GEMINI_API_KEY secret.');
        }
        if (response.status === 429) {
          throw new Error('Gemini rate limit reached. Please wait a moment and try again.');
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      // A prompt can be refused outright, before any candidate is produced.
      const blockReason = data?.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(`Gemini declined to process this document (${blockReason}).`);
      }

      const candidate = data?.candidates?.[0];
      if (!candidate) {
        throw new Error('Gemini returned no result for this document.');
      }

      // MAX_TOKENS means the JSON is truncated and will not parse; say so
      // plainly rather than failing later with a confusing parse error.
      if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
        throw new Error(`Gemini stopped early (${candidate.finishReason}). Please try another photo.`);
      }

      const text = (candidate.content?.parts ?? [])
        .map((part: any) => part?.text)
        .filter((t: any) => typeof t === 'string')
        .join('');

      if (!text.trim()) {
        throw new Error('Gemini returned an empty response.');
      }

      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error(
          'The document produced more data than one response can hold. Try a clearer or simpler page.'
        );
      }

      return text;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        throw new Error('AI request timed out after 60 seconds. Please try again.');
      }
      throw error;
    }
  }
}

// Health check (exposed via the function's /health path)
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

  return { status: 'ok', message: `Gemini provider configured (model: ${model})` };
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
