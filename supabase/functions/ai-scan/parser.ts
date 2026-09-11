// ============================================
// JSON parser & data validators for AI scanning
// ============================================
// Extracts JSON from raw AI response text and
// normalizes / validates it into clean structured
// results before returning them to the frontend.

// Type-only import: ClassificationResult is an interface, so it must not be
// emitted as a runtime import.
import type { ClassificationResult } from './prompts.ts';

export interface CreditExtractionResult {
  document_type: string;
  customer_name: string;
  phone: string;
  phone_number: string;
  invoice_number: string;
  invoice_date: string;
  description: string;
  items: Array<{
    item: string;
    item_name: string;
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

export interface PaymentExtractionResult {
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

// ============================================
// Small sanitization helpers
// ============================================

function toStringValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
}

function toNumberValue(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toConfidenceValue(value: any): number {
  const n = toNumberValue(value);
  if (n <= 0) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizeConfidence(
  source: any,
  keys: string[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of keys) {
    result[key] =
      source && typeof source === 'object'
        ? toConfidenceValue(source[key])
        : 0;
  }
  return result;
}

// ============================================
// Extract JSON from AI response text
// ============================================
export function extractJsonFromText(text: string): any {
  if (!text) return null;
  const trimmed = text.trim();

  // 1. Model returned plain JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  // 2. Strip markdown code fences: ```json ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // fall through
  }

  // 3. Find the first balanced {...} or [...] block.
  const openIndexes = [candidate.indexOf('{'), candidate.indexOf('[')]
    .filter((i: number) => i !== -1);
  if (openIndexes.length === 0) return null;

  const start = Math.min(...openIndexes);
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.substring(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

// ============================================
// Classification validation
// ============================================
export function validateClassification(data: any): ClassificationResult {
  if (!data || typeof data !== 'object') {
    return { document_type: 'unknown', confidence: 0, reason: 'No data returned from AI' };
  }

  const validTypes = ['credit_invoice', 'payment_receipt', 'bank_receipt', 'unknown'];
  const documentType = validTypes.includes(data.document_type)
    ? data.document_type
    : 'unknown';

  const confidence = toConfidenceValue(data.confidence);
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';

  return { document_type: documentType, confidence, reason };
}

// ============================================
// Credit invoice extraction validation
// ============================================
export function validateCreditExtraction(data: any): CreditExtractionResult {
  const emptyConfidence = {
    customer_name: 0,
    invoice_number: 0,
    invoice_date: 0,
    grand_total: 0,
  };

  if (!data || typeof data !== 'object') {
    return {
      document_type: 'credit_invoice',
      customer_name: '',
      phone: '',
      phone_number: '',
      invoice_number: '',
      invoice_date: '',
      description: '',
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      grand_total: 0,
      notes: '',
      confidence: emptyConfidence,
    };
  }

  const items = Array.isArray(data.items)
    ? data.items.map((it: any) => ({
        item: toStringValue(it?.item ?? it?.item_name),
        item_name: toStringValue(it?.item ?? it?.item_name),
        quantity: toNumberValue(it?.quantity),
        unit: toStringValue(it?.unit),
        rate: toNumberValue(it?.rate),
        amount: toNumberValue(it?.amount),
      }))
    : [];

  const phone = toStringValue(data.phone_number ?? data.phone);

  return {
    document_type: 'credit_invoice',
    customer_name: toStringValue(data.customer_name),
    phone,
    phone_number: phone,
    invoice_number: toStringValue(data.invoice_number),
    invoice_date: toStringValue(data.invoice_date),
    description: toStringValue(data.description),
    items,
    subtotal: toNumberValue(data.subtotal),
    discount: toNumberValue(data.discount),
    tax: toNumberValue(data.tax),
    grand_total: toNumberValue(data.grand_total),
    notes: toStringValue(data.notes),
    confidence: sanitizeConfidence(
      data.confidence,
      ['customer_name', 'invoice_number', 'invoice_date', 'grand_total']
    ),
  };
}

// ============================================
// Payment receipt extraction validation
// ============================================
export function validatePaymentExtraction(data: any): PaymentExtractionResult {
  const emptyConfidence = {
    customer_name: 0,
    payment_amount: 0,
    payment_date: 0,
    payment_method: 0,
  };

  if (!data || typeof data !== 'object') {
    return {
      document_type: 'payment_receipt',
      customer_name: '',
      payment_amount: 0,
      payment_date: '',
      payment_method: '',
      reference_number: '',
      upi_id: '',
      bank_name: '',
      notes: '',
      confidence: emptyConfidence,
    };
  }

  const validMethods = ['cash', 'upi', 'bank_transfer', 'card', 'others', ''];
  const method = validMethods.includes(data.payment_method)
    ? data.payment_method
    : 'others';

  return {
    document_type: 'payment_receipt',
    customer_name: toStringValue(data.customer_name),
    payment_amount: toNumberValue(data.payment_amount),
    payment_date: toStringValue(data.payment_date),
    payment_method: method,
    reference_number: toStringValue(data.reference_number),
    upi_id: toStringValue(data.upi_id),
    bank_name: toStringValue(data.bank_name),
    notes: toStringValue(data.notes),
    confidence: sanitizeConfidence(
      data.confidence,
      ['customer_name', 'payment_amount', 'payment_date', 'payment_method']
    ),
  };
}

// ============================================
// Field confidence scoring
// ============================================
export function generateFieldConfidence(
  documentType: string,
  data: CreditExtractionResult | PaymentExtractionResult
): Record<string, number> {
  const keys =
    documentType === 'credit_invoice'
      ? ['customer_name', 'invoice_number', 'invoice_date', 'grand_total']
      : ['customer_name', 'payment_amount', 'payment_date', 'payment_method'];

  const source = (data && data.confidence) || {};
  return sanitizeConfidence(source, keys);
}
