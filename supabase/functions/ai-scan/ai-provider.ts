// ============================================
// AI Provider Interface & Factory
// ============================================
// Abstraction layer for AI providers. Currently uses OpenRouter
// (an OpenAI-compatible API) with a free, vision-capable model.
// Swap the OpenRouterProvider implementation to change providers
// without touching the rest of the ai-scan flow.
//
// Configuration (set as Supabase Edge Function secrets):
//   AI_PROVIDER        - "openrouter" selects this provider (default)
//   OPENROUTER_API_KEY - OpenRouter API key (used as Bearer token)
//   OPENROUTER_MODEL   - Free vision model ID (e.g. "provider/model:free")

export interface AIProvider {
  analyzeDocument(
    fileBytes: Uint8Array,
    mimeType: string,
    prompt: string
  ): Promise<string>;
}

export function getProvider(providerName: string): AIProvider {
  switch (providerName) {
    case 'openrouter':
      return new OpenRouterProvider();
    // Add more providers here as needed
    // case 'gemini':
    //   return new GeminiProvider();
    // case 'claude':
    //   return new ClaudeProvider();
    default:
      throw new Error(`Unknown AI provider: ${providerName}`);
  }
}

// OpenRouter Provider Implementation
// OpenRouter exposes an OpenAI-compatible /chat/completions endpoint.
// Base URL: https://openrouter.ai/api/v1
// Full path: https://openrouter.ai/api/v1/chat/completions
class OpenRouterProvider implements AIProvider {
  private endpoint: string;
  private apiKey: string;
  private model: string;

  constructor() {
    // OpenRouter is OpenAI-compatible.
    this.endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    // @ts-ignore - Deno.env is available in Edge Functions
    this.apiKey = Deno.env.get('OPENROUTER_API_KEY') || '';
    // @ts-ignore - Deno.env is available in Edge Functions
    this.model = Deno.env.get('OPENROUTER_MODEL') || '';
  }

  async analyzeDocument(
    fileBytes: Uint8Array,
    mimeType: string,
    prompt: string
  ): Promise<string> {
    const base64 = bytesToBase64(fileBytes);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.1,
      stream: false,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          // OpenRouter-recommended headers (required by some models and used
          // for free-tier usage analytics + referer verification).
          'HTTP-Referer': 'https://ksmn-kanakku-book.web.app',
          'X-Title': 'KSMN Kanakku-Book',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `OpenRouter API error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg =
            errorJson.error?.message ||
            errorJson.error?.code ||
            errorJson.error ||
            errorMsg;
        } catch {
          errorMsg = `${errorMsg}: ${errorText.substring(0, 200)}`;
        }
        console.error('[OpenRouterProvider] API error:', response.status, errorText);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenRouter API returned empty response content');
      }

      if (typeof content === 'string') {
        return content;
      }

      if (Array.isArray(content)) {
        return content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n');
      }

      throw new Error('OpenRouter API returned unexpected response format');
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        throw new Error('AI request timed out after 60 seconds. Please try again.');
      }
      throw error;
    }
  }
}

// Health check function
export async function checkAIProviderHealth(): Promise<{ status: string; message: string }> {
  try {
    const provider = new OpenRouterProvider();
    // @ts-ignore - accessing private properties for health check
    if (!provider.apiKey || !provider.model) {
      return {
        status: 'error',
        message:
          'OpenRouter API not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL environment variables.',
      };
    }
    return {
      status: 'ok',
      message: `OpenRouter provider configured (model: ${provider.model})`,
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error?.message || 'Health check failed',
    };
  }
}

// Base64 helpers (chunked to avoid call-stack limits on large files/images)
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...chunk));
  }
  if (typeof btoa !== 'undefined') {
    return btoa(chunks.join(''));
  }
  return btoaFallback(chunks.join(''));
}

function btoaFallback(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const byte1 = str.charCodeAt(i++) & 0xff;
    const byte2 = i < str.length ? str.charCodeAt(i++) & 0xff : NaN;
    const byte3 = i < str.length ? str.charCodeAt(i++) & 0xff : NaN;
    result += chars[byte1 >> 2];
    result += chars[((byte1 & 0x03) << 4) | (byte2 >> 4)];
    result += isNaN(byte2) ? '=' : chars[((byte2 & 0x0f) << 2) | (byte3 >> 6)];
    result += isNaN(byte3) ? '=' : chars[byte3 & 0x3f];
  }
  return result;
}