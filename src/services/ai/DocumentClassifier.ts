// ============================================
// Document Classifier
// ============================================
// Utility functions to classify document types

import type { AIScanResult } from './types';

export class DocumentClassifier {
  /**
   * Check if the scanned document is a credit invoice
   */
  static isCreditInvoice(result: AIScanResult): boolean {
    return result.documentType === 'credit_invoice';
  }

  /**
   * Check if the scanned document is a payment receipt
   */
  static isPaymentReceipt(result: AIScanResult): boolean {
    return result.documentType === 'payment_receipt' || 
           result.documentType === 'bank_receipt';
  }

  /**
   * Check if the scanned document is a bank receipt
   */
  static isBankReceipt(result: AIScanResult): boolean {
    return result.documentType === 'bank_receipt';
  }

  /**
   * Get a human-readable label for the document type
   */
  static getLabel(documentType: string): string {
    const labels: Record<string, string> = {
      'credit_invoice': 'Credit Invoice / Bill',
      'payment_receipt': 'Payment Receipt',
      'bank_receipt': 'Bank Receipt',
      'unknown': 'Unknown Document',
    };
    return labels[documentType] || 'Unknown Document';
  }
}