// ============================================
// Qwen 2.5 VL Provider Implementation
// ============================================
// Uses an OpenAI-compatible API format for the hosted
// Qwen 2.5 VL inference endpoint.
//
// Configuration (set as Supabase Edge Function secrets):
//   QWEN_API_URL  - The hosted endpoint URL
//   QWEN_API_KEY  - API key for authentication
//   QWEN_MODEL    - Model name (e.g., "qwen2.5-vl-72b-instruct")
//
// To switch to another provider later, create a new provider
// class implementing the AIProvider interface and register it
// in ai-provider.ts getProvider() factory.

import { AIProvider } from './ai-provider.ts';

export class QwenProvider implements AIProvider {
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiUrl = Deno.env.get('QWEN_API_URL') || '';
    this.apiKey = Deno.env.get('QWEN_API_KEY') || '';
    this.model = Deno.env.get('QWEN_MODEL') || 'qwen2.5-vl-72b-instruct';

    if (!this.apiUrl || !this.apiKey) {
      throw new Error(
        'QWEN_API_URL and QWEN_API_KEY must be configured as Edge Function secrets'
      );
    }
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
      temperature: 0,
      response_format: { type: 'json_object' },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `Qwen API error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.error?.message || errorJson.error || errorMsg;
        } catch {
          errorMsg = `${errorMsg}: ${errorText.substring(0, 200)}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Qwen API returned empty response content');
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

      throw new Error('Qwen API returned unexpected response format');
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        throw new Error('AI request timed out after 30 seconds. Please try again.');
      }
      throw error;
    }
  }
}

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