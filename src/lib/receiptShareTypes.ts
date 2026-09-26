import type { CreditEntry, Customer, Payment } from '../types';

export interface ReceiptData {
  payment: Pick<Payment, 'amount' | 'payment_date' | 'payment_method' | 'receipt_number' | 'notes'>;
  customer: Pick<Customer, 'name' | 'customer_code' | 'phone'> & { balance?: number; advance_balance?: number };
  allocations: Array<{ entry_code: string; date: string; allocated: number }>;
}

export interface StatementPdfData {
  customer: Pick<Customer, 'name' | 'customer_code' | 'phone' | 'address'>;
  fromDate: string;
  toDate: string;
  entries: CreditEntry[];
  payments: Payment[];
}
