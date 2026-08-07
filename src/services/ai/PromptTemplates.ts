// ============================================
// Prompt Templates (Frontend Reference)
// ============================================
// Client-side references to the prompts used by the backend.
// The actual prompts used by the AI are in:
//   supabase/functions/ai-scan/prompts.ts

export const PROMPT_TEMPLATES = {
  classification: 'Document classification prompt...',
  creditExtraction: 'Credit extraction prompt...',
  paymentExtraction: 'Payment extraction prompt...',
} as const;

export const DOCUMENT_TYPE_DESCRIPTIONS = {
  credit_invoice: 'Invoices, bills, or receipts showing items purchased',
  payment_receipt: 'Payment confirmations including UPI screenshots',
  bank_receipt: 'Bank statements, deposit slips, or bank transaction receipts',
  unknown: 'Documents that do not clearly fit the above categories',
} as const;