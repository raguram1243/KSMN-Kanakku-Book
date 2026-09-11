// ============================================
// Invoice Extractor (Client-side helper)
// ============================================
// Maps AI-extracted credit data to the form fields
// used by QuickAddPage.

import type { ExtractedCreditData, ConfidenceScores } from './types';

export interface PrefilledCreditEntry {
  customerName?: string;
  phoneNumber?: string;
  entryMode: 'detailed';
  lineItems: Array<{
    item_name: string;
    qty: number;
    rate: number;
    amount: number;
  }>;
  description?: string;
  totalAmount: number;
  notes?: string;
  confidence: ConfidenceScores;
}

export class InvoiceExtractor {
  /**
   * Convert AI extracted data to form pre-fill format
   */
  static toPrefilledEntry(
    data: ExtractedCreditData,
    confidence: ConfidenceScores
  ): PrefilledCreditEntry {
    const lineItems = (data.items || [])
      .filter((item) => item.item_name && item.quantity > 0)
      .map((item) => ({
        item_name: item.item_name,
        qty: item.quantity,
        rate: item.rate,
        amount: item.amount,
      }));

    return {
      customerName: data.customer_name || undefined,
      phoneNumber: data.phone_number || undefined,
      entryMode: 'detailed',
      lineItems: lineItems.length > 0 ? lineItems : [{ item_name: '', qty: 0, rate: 0, amount: 0 }],
      description: data.description || data.notes || undefined,
      totalAmount: data.grand_total || data.subtotal || 0,
      notes: data.notes || undefined,
      confidence,
    };
  }

  /**
   * Check if extracted data is valid for creating an entry
   */
  static isValid(data: ExtractedCreditData): boolean {
    return (
      (data.grand_total > 0 || data.subtotal > 0) &&
      (data.items.length > 0 || !!data.description)
    );
  }

  /**
   * Get summary of extracted data for display
   */
  static getSummary(data: ExtractedCreditData): string {
    const parts: string[] = [];
    if (data.customer_name) parts.push(`Customer: ${data.customer_name}`);
    if (data.invoice_number) parts.push(`Invoice: ${data.invoice_number}`);
    if (data.invoice_date) parts.push(`Date: ${data.invoice_date}`);
    if (data.items.length > 0) parts.push(`${data.items.length} items`);
    if (data.grand_total > 0) parts.push(`Total: ₹${data.grand_total.toFixed(2)}`);
    return parts.join(' | ');
  }
}