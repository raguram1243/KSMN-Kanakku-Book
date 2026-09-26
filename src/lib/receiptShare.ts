import { formatDate } from './receiptPdf';
import { sharePdfFile } from './receiptPdf';
import { buildPaymentReceiptPdf } from './receiptDoc';
import { buildStatementPdf } from './statementDoc';
import type { ReceiptData, StatementPdfData } from './receiptShareTypes';

export async function shareReceiptOnWhatsApp(
  data: ReceiptData,
  phone: string | null | undefined,
  openChat: (phone: string | null | undefined, message: string) => boolean,
): Promise<boolean> {
  const blob = buildPaymentReceiptPdf(data).output('blob');
  const net = Number(data.customer.balance ?? 0) - Number(data.customer.advance_balance ?? 0);
  const text =
    `Payment received: Rs. ${Number(data.payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} on ${formatDate(data.payment.payment_date)}.` +
    (net > 0.01 ? ` Balance outstanding: Rs. ${net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.` : ' Account settled. Thank you!') +
    ' - KSM Nataraja Nadar Firm';
  const file = new File([blob], `receipt_${data.customer.customer_code}.pdf`, { type: 'application/pdf' });
  const r = await sharePdfFile(file, 'Payment Receipt', text);
  if (r === 'shared') return true;
  return openChat(phone, text);
}

export async function shareStatementOnWhatsApp(
  data: StatementPdfData,
  phone: string | null | undefined,
  openChat: (phone: string | null | undefined, message: string) => boolean,
): Promise<boolean> {
  const blob = buildStatementPdf(data).output('blob');
  const file = new File([blob], `statement_${data.customer.customer_code}.pdf`, { type: 'application/pdf' });
  const text = `Your statement (${data.fromDate} to ${data.toDate}) from KSM Nataraja Nadar Firm is attached.`;
  const r = await sharePdfFile(file, 'Customer Statement', text);
  if (r === 'shared') return true;
  return openChat(phone, text + ' Please ask us for the PDF copy.');
}

export type { ReceiptData, StatementPdfData };
