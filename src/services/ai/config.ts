// ============================================
// AI Provider Configuration
// ============================================
// This is the ONLY file that determines which AI provider is used.
// To switch providers, change the `provider` field below.
//
// Supported providers: 'qwen' | 'gemini' | 'claude' | 'gpt' | 'llama' | 'deepseek'
//
// The frontend only communicates with the edge function.
// Provider-specific configuration lives in the edge function (backend).

export const AI_CONFIG = {
  // Current AI provider
  provider: 'qwen' as const,

  // Edge function endpoint (relative to Supabase URL)
  edgeFunction: 'ai-scan',

  // Maximum file size (4MB - matches existing upload-attachment limit)
  maxFileSize: 4 * 1024 * 1024,

  // Allowed file types
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  allowedPdfType: ['application/pdf'],

  // Confidence thresholds
  highConfidenceThreshold: 0.8, // Fields above this are considered reliable
  lowConfidenceThreshold: 0.5, // Fields below this need manual review

  // Document classification confidence threshold
  classificationConfidenceThreshold: 0.7, // Below this, ask user to choose manually

  // Rate limiting (matches backend)
  maxScansPerMinute: 10,

  // Processing step messages
  processingMessages: {
    uploading: 'Uploading document...',
    reading: 'Reading document...',
    classifying: 'Classifying document type...',
    extracting: 'Extracting data...',
    matching: 'Matching customer...',
    preparing: 'Preparing form...',
  },
} as const;

// ============================================
// Provider-specific UI labels
// ============================================
export const PROVIDER_LABELS: Record<string, string> = {
  qwen: 'AI Scanner',
  gemini: 'Gemini Scanner',
  claude: 'Claude Scanner',
  gpt: 'GPT Scanner',
  llama: 'Llama Scanner',
  deepseek: 'DeepSeek Scanner',
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  credit_invoice: 'Credit Invoice / Bill',
  payment_receipt: 'Payment Receipt',
  bank_receipt: 'Bank Receipt',
  unknown: 'Unknown Document',
};

export const DOCUMENT_TYPE_ICONS: Record<string, string> = {
  credit_invoice: '📄',
  payment_receipt: '💵',
  bank_receipt: '🏦',
  unknown: '❓',
};