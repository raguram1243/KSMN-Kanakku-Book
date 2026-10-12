import { CreditEntry, Payment, isApprovedPayment } from '../types';

export interface LedgerTransaction {
  id: string;
  date: string;
  type: 'entry' | 'payment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  status?: string;
  payment_method?: string;
  /**
   * A pending or rejected payment: listed for the admin's information but it
   * does not move the running balance and has no credit.
   */
  excluded?: boolean;
  originalData: CreditEntry | Payment;
}

/**
 * Entries and payments in date order with a running balance.
 *
 * Only approved payments count. Pending / rejected payments are dropped unless
 * `includeUnapproved` is set (the customer screen lists them, flagged
 * `excluded`, so the admin can see what is waiting) — statements and other
 * documents never show them.
 */
export function buildLedgerTransactions(
  entries: CreditEntry[],
  payments: Payment[],
  options: { includeUnapproved?: boolean } = {},
): LedgerTransaction[] {
  const transactions: LedgerTransaction[] = [];
  let runningBalance = 0;

  const listedPayments = options.includeUnapproved ? payments : payments.filter(isApprovedPayment);

  // Combine entries and payments
  const allTransactions = [
    ...entries.map(e => ({ ...e, type: 'entry' as const })),
    ...listedPayments.map(p => ({ ...p, type: 'payment' as const }))
  ];

  // Sort by date (oldest first)
  allTransactions.sort((a, b) => {
    const dateA = new Date(a.created_at);
    const dateB = new Date(b.created_at);
    return dateA.getTime() - dateB.getTime();
  });

  // Calculate running balance
  allTransactions.forEach(t => {
    const excluded = t.type === 'payment' && !isApprovedPayment(t as Payment);
    if (t.type === 'entry') {
      runningBalance += Number(t.total_amount);
    } else if (!excluded) {
      runningBalance -= Number(t.amount);
    }

    const date = t.created_at;

    // Generate smart description
    let description: string;
    if (t.type === 'entry') {
      const entry = t as CreditEntry;
      if (entry.entry_mode === 'quick' && entry.description) {
        description = entry.description;
      } else {
        description = entry.entry_code;
      }
    } else {
      const payment = t as Payment;
      if (payment.payment_method) {
        const methodLabel = payment.payment_method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        description = payment.receipt_number ? `${methodLabel} (Ref: ${payment.receipt_number})` : methodLabel;
      } else {
        description = payment.notes || 'Payment';
      }
    }

    transactions.push({
      id: t.id,
      date,
      type: t.type,
      reference: t.type === 'entry' ? (t as CreditEntry).entry_code : (t as Payment).receipt_number || 'Payment',
      description,
      debit: t.type === 'entry' ? Number(t.total_amount) : 0,
      credit: t.type === 'payment' && !excluded ? Number(t.amount) : 0,
      balance: runningBalance,
      status: t.type === 'entry' ? (t as CreditEntry).status : excluded ? (t as Payment).status : undefined,
      excluded,
      payment_method: t.type === 'payment' ? (t as Payment).payment_method : undefined,
      originalData: t as CreditEntry | Payment
    });
  });

  return transactions;
}