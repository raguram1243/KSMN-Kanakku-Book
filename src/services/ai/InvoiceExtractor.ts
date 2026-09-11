// ============================================
// Invoice Extractor (Client-side helper)
// ============================================
// Maps AI-extracted credit data to the form fields used by QuickAddPage.
//
// AI Scan deliberately does not produce a per-item price breakdown: handwritten
// shop bills rarely show reliable unit rates, and a wrong split is worse than
// none. A scan therefore always fills the Quick Entry form — a one-line summary
// of what was bought plus the bill total.

import type { ExtractedCreditData, ConfidenceScores } from './types';

export interface PrefilledCreditEntry {
  customerName?: string;
  phoneNumber?: string;
  entryMode: 'quick';
  /** Summary of the goods, prefixed with the bill number when one was read. */
  description?: string;
  totalAmount: number;
  notes?: string;
  confidence: ConfidenceScores;
}

export class InvoiceExtractor {
  /** Bill number belongs in the description — credit entries have no invoice field. */
  static buildDescription(data: ExtractedCreditData): string | undefined {
    const summary = (data.description || '').trim();
    const invoiceNumber = (data.invoice_number || '').trim();
    if (!summary && !invoiceNumber) return undefined;
    if (!invoiceNumber) return summary;
    if (!summary) return `Bill ${invoiceNumber}`;
    return `Bill ${invoiceNumber} — ${summary}`;
  }

  static toPrefilledEntry(
    data: ExtractedCreditData,
    confidence: ConfidenceScores
  ): PrefilledCreditEntry {
    return {
      customerName: data.customer_name || undefined,
      phoneNumber: data.phone_number || undefined,
      entryMode: 'quick',
      description: InvoiceExtractor.buildDescription(data),
      totalAmount: data.grand_total || data.subtotal || 0,
      notes: data.notes || undefined,
      confidence,
    };
  }

  /** Enough to create an entry: a total, and something describing it. */
  static isValid(data: ExtractedCreditData): boolean {
    return (
      (data.grand_total > 0 || data.subtotal > 0) &&
      !!InvoiceExtractor.buildDescription(data)
    );
  }

  static getSummary(data: ExtractedCreditData): string {
    const parts: string[] = [];
    if (data.customer_name) parts.push(`Customer: ${data.customer_name}`);
    if (data.invoice_number) parts.push(`Invoice: ${data.invoice_number}`);
    if (data.invoice_date) parts.push(`Date: ${data.invoice_date}`);
    if (data.grand_total > 0) parts.push(`Total: ₹${data.grand_total.toFixed(2)}`);
    return parts.join(' | ');
  }
}
