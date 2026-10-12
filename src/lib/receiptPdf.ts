import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from './utils';

export function rs(amount: number): string {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export function firmHeader(doc: jsPDF, title: string, subtitle?: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(67, 56, 202); // indigo-700 brand accent
  doc.text('KSM Nataraja Nadar Firm', 40, 48);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(title, 40, 66);
  let y = 80;
  if (subtitle) {
    doc.setTextColor(110);
    doc.text(subtitle, 40, y);
    doc.setTextColor(0);
    y += 14;
  }
  doc.setDrawColor(79, 70, 229); // indigo-600 rule
  doc.setLineWidth(0.8);
  doc.line(40, y, doc.internal.pageSize.getWidth() - 40, y);
  doc.setLineWidth(0.2);
  return y + 14;
}

export function firmFooter(doc: jsPDF): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text('Thank you for your business! - KSM Nataraja Nadar Firm', 40, h - 24);
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.text(`Page ${p} of ${n}`, w - 40, h - 24, { align: 'right' });
  }
  doc.setTextColor(0);
}

// Kept in its own module so screens that never load jsPDF can use it too.
export { amountInWords } from './amountInWords';

/** Web Share Level 2 file share with WhatsApp-text fallback. Returns true if handled. */
export async function sharePdfFile(file: File, title: string, text: string): Promise<'shared' | 'unsupported' | 'dismissed'> {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[]; title: string; text: string }) => Promise<void> };
  try {
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title, text });
      return 'shared';
    }
  } catch {
    return 'dismissed';
  }
  return 'unsupported';
}

export { formatDate };
export type { jsPDF };
export { autoTable };
