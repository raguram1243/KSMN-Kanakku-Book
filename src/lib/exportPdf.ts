/**
 * PDF export for the report tables, built with jsPDF + jspdf-autotable.
 *
 * Font note: jsPDF's built-in Type1 fonts (Helvetica et al.) are WinAnsi/cp1252
 * only, so the rupee sign (U+20B9) cannot be drawn — it comes out as a blank or
 * broken glyph. Every string that goes into the PDF is therefore run through
 * `toPdfText`, which rewrites "₹1,234.00" as "Rs. 1,234.00". This is a
 * PDF-only fallback; the CSV export and the on-screen tables keep the ₹ sign.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ExportPdfOptions {
  title: string
  /** Without the .pdf extension. */
  filename: string
  headers: string[]
  rows: string[][]
  /** Rendered as a bold totals row in the table footer. */
  footer?: string[]
  /** Extra line under the title, e.g. an active date range. */
  subtitle?: string
  /** Zero-based column indexes to right-align (amount columns). */
  rightAlignColumns?: number[]
  orientation?: 'portrait' | 'landscape'
}

/** Make a string safe for jsPDF's cp1252-only standard fonts. */
export function toPdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u20B9\s*/g, 'Rs. ') // ₹1,234.00 -> Rs. 1,234.00
    .replace(/[\u00A0\u202F\u2009]/g, ' ') // various non-breaking/thin spaces
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    // Anything cp1252 cannot draw (e.g. Tamil script) collapses to a single '?'
    // rather than vanishing silently, so a mangled cell stays visible.
    .replace(/[^\x20-\x7E¡-ÿ\n]+/g, '?')
}

/** Builds the document (no download) — kept separate so it can be exercised outside a browser. */
export function buildReportPdf({
  title,
  headers,
  rows,
  footer,
  subtitle,
  rightAlignColumns = [],
  orientation = 'landscape',
}: Omit<ExportPdfOptions, 'filename'>) {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const margin = 36
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(toPdfText(title), margin, margin + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  const generated = `Generated ${new Date().toLocaleString('en-IN')}`
  doc.text(toPdfText(subtitle ? `${subtitle}  |  ${generated}` : generated), margin, margin + 24)
  doc.setTextColor(0)

  const columnStyles: Record<number, { halign: 'right' }> = {}
  for (const index of rightAlignColumns) {
    columnStyles[index] = { halign: 'right' }
  }

  autoTable(doc, {
    head: [headers.map(toPdfText)],
    body: rows.map(row => row.map(toPdfText)),
    foot: footer ? [footer.map(toPdfText)] : undefined,
    startY: margin + 36,
    margin: { top: margin, right: margin, bottom: margin + 6, left: margin },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 4,
      overflow: 'linebreak',
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: 17, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    showFoot: 'lastPage',
  })

  const pageCount = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(130)
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 16, {
      align: 'right',
    })
  }

  return doc
}

export function exportPdf(options: ExportPdfOptions) {
  buildReportPdf(options).save(`${options.filename}.pdf`)
}

/** Subtitle line for report exports describing the active date filter. */
export function reportDateRangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Date range: all time'
  return 'Date range: ' + (from || 'start') + ' to ' + (to || 'today')
}
