// ============================================
// AI Provider Interface & Factory
// ============================================
// Abstraction layer for AI providers
// Allows swapping Qwen for other providers without changing frontend

export interface AIProvider {
  analyzeDocument(
    fileBytes: Uint8Array,
    mimeType: string,
    prompt: string
  ): Promise<string>;
}

export function getProvider(providerName: string): AIProvider {
  switch (providerName) {
    case 'qwen':
      return new QwenProvider();
    // Add more providers here as needed
    // case 'gemini':
    //   return new GeminiProvider();
    // case 'claude':
    //   return new ClaudeProvider();
    default:
      throw new Error(`Unknown AI provider: ${providerName}`);
  }
}

// Qwen Provider Implementation
class QwenProvider implements AIProvider {
  private endpoint: string;
  private apiKey: string;
  private model: string;

  constructor() {
    // @ts-ignore - Deno.env is available in Edge Functions
    this.endpoint = Deno.env.get('QWEN_API_URL') || 'https://api.example.com/v1/chat/completions';
    // @ts-ignore - Deno.env is available in Edge Functions
    this.apiKey = Deno.env.get('QWEN_API_KEY') || '';
    // @ts-ignore - Deno.env is available in Edge Functions
    this.model = Deno.env.get('QWEN_MODEL') || 'qwen2.5-vl-72b-instruct';
  }

  async analyzeDocument(
    fileBytes: Uint8Array,
    mimeType: string,
    prompt: string
  ): Promise<string> {
    // Convert to base64
    // @ts-ignore - btoa is available in Deno
    const base64 = btoa(String.fromCharCode(...fileBytes));
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Qwen API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const result = await response.json();
    return result.choices[0].message.content;
  }
}

// Health check function
export async function checkQwenHealth(): Promise<{ status: string; message: string }> {
  try {
    const provider = new QwenProvider();
    // Simple health check - just verify config exists
    // @ts-ignore - accessing private properties for health check
    if (!provider.apiKey || provider.endpoint.includes('example.com')) {
      return {
        status: 'error',
        message: 'Qwen API not configured. Set QWEN_API_URL and QWEN_API_KEY environment variables.',
      };
    }
    return {
      status: 'ok',
      message: 'Qwen provider configured',
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error?.message || 'Health check failed',
    };
  }
}
