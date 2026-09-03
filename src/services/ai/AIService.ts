// ============================================
// AI Service
// ============================================
// Main service for AI document scanning

import { AIScanResult, ProcessingStep, AIScanRequest } from './types';

export interface AIServiceInterface {
  scanDocument(
    request: AIScanRequest,
    onProgress?: (state: ProcessingStep) => void
  ): Promise<AIScanResult>;
}

export class AIService implements AIServiceInterface {
  private static instance: AIService;

  private constructor() {}

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  async scanDocument(
    request: AIScanRequest,
    onProgress?: (state: ProcessingStep) => void
  ): Promise<AIScanResult> {
    const { file_url, file_type, mime_type } = request;

    onProgress?.({ step: 'uploading', message: 'Uploading document...', progress: 10 });
    onProgress?.({ step: 'reading', message: 'Reading document...', progress: 25 });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-scan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('ksmn_token')}`,
          },
          body: JSON.stringify({ file_url, file_type, mime_type }),
        }
      );

      onProgress?.({ step: 'classifying', message: 'Classifying document...', progress: 50 });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'AI scan failed');
      }

      onProgress?.({ step: 'extracting', message: 'Extracting data...', progress: 75 });

      const result = await response.json();
      
      onProgress?.({ step: 'preparing', message: 'Preparing form...', progress: 100 });

      return result;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'AI scan failed');
    }
  }
}

// Export singleton instance
export const aiService = AIService.getInstance();