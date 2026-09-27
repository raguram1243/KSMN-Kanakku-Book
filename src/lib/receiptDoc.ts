import { jsPDF } from 'jspdf';
import { amountInWords, autoTable, firmFooter, firmHeader, formatDate, rs } from './receiptPdf';
import type { ReceiptData } from './receiptShareTypes';

export function buildPaymentReceiptPdf(data: ReceiptData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = firmHeader(doc, 'Payment Receipt', `Date: ${formatDate(data.payment.payment_date)}${data.payment.receipt_number ? `  |  Receipt: ${data.payment.receipt_number}` : ''}`);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Received from: ${data.customer.name} (${data.customer.customer_code})`, 40, y);
  y += 16;
  if (data.customer.phone) { doc.text(`Phone: ${data.customer.phone}`, 40, y); y += 16; }
  if (data.payment.payment_method) { doc.text(`Mode: ${String(data.payment.payment_method).replace('_', ' ')}`, 40, y); y += 16; }
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Amount received: ${rs(data.payment.amount)}`, 40, y);
  y += 18;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(amountInWords(Number(data.payment.amount)), 40, y);
  doc.setTextColor(0);
  y += 20;
  if (data.allocations.length > 0) {
    autoTable(doc, {
      head: [['Entry', 'Date', 'Adjusted (Rs.)']],
      body: data.allocations.map((a) => [a.entry_code, formatDate(a.date), Number(a.allocated).toLocaleString('en-IN', { minimumFractionDigits: 2 })]),
      startY: y,
      margin: { left: 40, right: 40 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }
  const net = Number(data.customer.balance ?? 0) - Number(data.customer.advance_balance ?? 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Balance outstanding: ${rs(Math.max(0, net))}`, 40, y);
  firmFooter(doc);
  return doc;
}

export function downloadPaymentReceiptPdf(data: ReceiptData): void {
  buildPaymentReceiptPdf(data).save(`receipt_${data.customer.customer_code}_${data.payment.payment_date}.pdf`);
}
