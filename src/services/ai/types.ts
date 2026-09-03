// ============================================
// Type Definitions for AI Services
// ============================================

export interface ExtractedCreditData {
  document_type: string;
  customer_name: string;
  phone: string;
  phone_number: string; // Alias for compatibility
  invoice_number: string;
  invoice_date: string;
  description: string; // For quick mode
  items: Array<{
    item: string;
    item_name: string; // Alias for compatibility
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  grand_total: number;
  notes: string;
  confidence: {
    customer_name: number;
    invoice_number: number;
    invoice_date: number;
    grand_total: number;
  };
}

// Alias for compatibility
/**
 * Per-field confidence returned by ai-scan. The set of keys depends on the
 * document type (credit invoices report invoice_number/grand_total, receipts
 * report payment_amount/payment_method, ...), and several ai-scan paths return
 * `{}` outright - so every field is optional and extra keys are allowed.
 * Consumers already default missing scores (`confidence.customer_name || 0.5`).
 */
export type ConfidenceScores = {
  customer_name?: number;
  invoice_number?: number;
  invoice_date?: number;
  grand_total?: number;
  [field: string]: number | undefined;
};

export interface ExtractedPaymentData {
  document_type: string;
  customer_name: string;
  payment_amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string;
  upi_id: string;
  bank_name: string;
  notes: string;
  confidence: {
    customer_name: number;
    payment_amount: number;
    payment_date: number;
    payment_method: number;
  };
}

export interface PrefilledEntry {
  customerName: string;
  phoneNumber: string;
  description: string;
  lineItems: Array<{
    item_name: string;
    item: string; // Alias
    qty: number;
    quantity: number; // Alias
    unit: string;
    rate: number;
    amount: number;
  }>;
  totalAmount: number;
  notes: string;
}

export interface PrefilledPayment {
  customerName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  receiptNumber: string;
  upiId: string;
  bankName: string;
  notes: string;
}

// ============================================
// Store Types (re-exported for convenience)
// ============================================
export interface ProcessingStep {
  step: 'uploading' | 'reading' | 'classifying' | 'extracting' | 'matching' | 'preparing';
  message: string;
  progress: number;
}

export interface CustomerMatch {
  id: string;
  name: string;
  customer_code: string;
  phone: string;
  customer_type: string;
  match_type: 'exact' | 'similar' | 'none';
  match_score: number;
}

export interface AIScanResult {
  documentType: 'credit_invoice' | 'payment_receipt' | 'bank_receipt' | 'unknown';
  documentTypeConfidence: number;
  classificationReason?: string;
  extractedData: any;
  customerMatches: CustomerMatch[];
  confidence: Record<string, number>;
  fileUrl?: string;
  fileType?: 'image' | 'pdf';
  needsManualClassification?: boolean;
}

// Alias for compatibility with existing code
export type ProcessingState = ProcessingStep;
export type AIScanRequest = {
  file_url: string;
  file_type: 'image' | 'pdf';
  /** Real MIME type of the uploaded file (e.g. 'image/png'), from upload-attachment. */
  mime_type?: string;
};
