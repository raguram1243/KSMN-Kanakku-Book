import { AIScanResult, AIScanRequest, ProcessingState } from './types';

export interface AIProvider {
  scanDocument(
    request: AIScanRequest,
    onProgress?: (state: ProcessingState) => void
  ): Promise<AIScanResult>;
}

export function getAIProvider(): AIProvider {
  return new EdgeFunctionProvider();
}

export class EdgeFunctionProvider implements AIProvider {
  async scanDocument(
    request: AIScanRequest,
    onProgress?: (state: ProcessingState) => void
  ): Promise<AIScanResult> {
    const { file_url, file_type } = request;

    onProgress?.({ step: 'uploading', message: 'Uploading document...', progress: 10 });
    onProgress?.({ step: 'reading', message: 'Reading document...', progress: 25 });

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ksmn_token')}`,
        },
        body: JSON.stringify({ file_url, file_type }),
      }
    );

    onProgress?.({ step: 'classifying', message: 'Classifying document type...', progress: 40 });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(data.error || `AI scan failed (${response.status})`);
    }

    const data = await response.json();

    onProgress?.({ step: 'extracting', message: 'Extracting data...', progress: 60 });
    onProgress?.({ step: 'matching', message: 'Matching customer...', progress: 80 });
    onProgress?.({ step: 'preparing', message: 'Preparing form...', progress: 100 });

    return data as AIScanResult;
  }
}