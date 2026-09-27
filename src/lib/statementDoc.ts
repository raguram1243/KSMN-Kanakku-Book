import { jsPDF } from 'jspdf';
import { buildLedgerTransactions } from './ledger';
import { autoTable, firmFooter, firmHeader, formatDate } from './receiptPdf';
import type { StatementPdfData } from './receiptShareTypes';

export function buildStatementPdf(data: StatementPdfData): jsPDF {
  const txns = buildLedgerTransactions(data.entries as never, data.payments as never);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const y0 = firmHeader(doc, 'Customer Statement', `Period: ${data.fromDate} to ${data.toDate}`);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Customer: ${data.customer.name} (${data.customer.customer_code})`, 40, y0);
  doc.text(`Phone: ${data.customer.phone}${data.customer.address ? `  |  ${data.customer.address}` : ''}`, 40, y0 + 15);
  autoTable(doc, {
    head: [['Date', 'Ref', 'Description', 'Debit (Rs.)', 'Credit (Rs.)', 'Balance (Rs.)']],
    body: txns.map((t) => [
      formatDate(t.date),
      t.reference,
      t.description.slice(0, 40),
      t.debit > 0 ? t.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-',
      t.credit > 0 ? t.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-',
      t.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    ]),
    startY: y0 + 32,
    margin: { left: 40, right: 40 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });
  firmFooter(doc);
  return doc;
}
