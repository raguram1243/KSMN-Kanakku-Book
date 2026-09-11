// ============================================
// Payment Extractor (Client-side helper)
// ============================================
// Maps AI-extracted payment data to the form fields
// used by PaymentReceivedPage.

import type { ExtractedPaymentData, ConfidenceScores } from './types';

export interface PrefilledPayment {
  customerName?: string;
  customerId?: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  receiptNumber?: string;
  upiId?: string;
  bankName?: string;
  notes?: string;
  confidence: ConfidenceScores;
}

export class PaymentExtractor {
  /**
   * Convert AI extracted data to form pre-fill format
   */
  static toPrefilledPayment(
    data: ExtractedPaymentData,
    confidence: ConfidenceScores
  ): PrefilledPayment {
    return {
      customerName: data.customer_name || undefined,
      amount: data.payment_amount || 0,
      paymentDate: data.payment_date || new Date().toISOString().split('T')[0],
      paymentMethod: data.payment_method || '',
      receiptNumber: data.reference_number || undefined,
      upiId: data.upi_id || undefined,
      bankName: data.bank_name || undefined,
      notes: data.notes || undefined,
      confidence,
    };
  }

  /**
   * Check if extracted data is valid for creating a payment
   */
  static isValid(data: ExtractedPaymentData): boolean {
    return data.payment_amount > 0 && !!data.payment_date;
  }

  /**
   * Get summary of extracted data for display
   */
  static getSummary(data: ExtractedPaymentData): string {
    const parts: string[] = [];
    if (data.customer_name) parts.push(`Customer: ${data.customer_name}`);
    if (data.payment_amount > 0) parts.push(`Amount: ₹${data.payment_amount.toFixed(2)}`);
    if (data.payment_date) parts.push(`Date: ${data.payment_date}`);
    if (data.payment_method) parts.push(`Method: ${data.payment_method}`);
    if (data.reference_number) parts.push(`Ref: ${data.reference_number}`);
    return parts.join(' | ');
  }
}