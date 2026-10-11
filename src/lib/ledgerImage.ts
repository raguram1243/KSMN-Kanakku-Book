/**
 * Renders a customer's unpaid bills as a WhatsApp attachment: a PNG for a
 * short ledger, a multi-page PDF once there are too many bills to read as a
 * single picture.
 *
 * Why a canvas and not the server's statement PDF: WhatsApp shows an image
 * inline in the chat, so the customer sees the amount without opening
 * anything, and canvas draws with the device's own fonts — which means Tamil
 * and the rupee sign come out right. The statement PDF can do neither:
 * pdf-lib's built-in fonts are WinAnsi only, which is why that file says
 * "Rs." instead of "₹", and pdf-lib maps characters to glyphs without the
 * reordering Tamil needs. The PDF here is built from these same canvas pages,
 * so Tamil survives into the document too.
 *
 * Nothing here touches the network. It draws from data the customer page has
 * already loaded.
 */

export interface LedgerImageRow {
  /** Pre-formatted for display, e.g. "11 Oct 2026". */
  date: string
  /** Entry code, e.g. "KSMN-0045-03". */
  code: string
  description: string
  amountDue: number
}

export interface LedgerImageInput {
  customerName: string
  customerCode?: string | null
  phone?: string | null
  rows: LedgerImageRow[]
  /**
   * The figure the customer is asked to pay, already net of any advance.
   * When `advanceAdjusted` is set this must equal the sum of `rows` minus it,
   * otherwise the image shows a deduction that does not add up. The customer
   * page satisfies this: the rows are the unpaid entries, which sum to the
   * balance, and totalDue is that balance minus the advance.
   */
  totalDue: number
  /** Advance already held against the customer, shown as a deduction. */
  advanceAdjusted?: number
  language: 'en' | 'ta'
}

export type LedgerAttachmentKind = 'png' | 'pdf'

export interface LedgerAttachment {
  blob: Blob
  /** PNG data URL of the first page, for previewing before sending. */
  previewUrl: string
  fileName: string
  kind: LedgerAttachmentKind
  pageCount: number
}

/**
 * More unpaid bills than this and a single image becomes an unreadable strip
 * in a chat, so the attachment switches to a paginated PDF instead.
 */
export const PDF_THRESHOLD_ROWS = 20

/** Rows per PDF page, and the smaller limit for a page that also carries the
 *  totals block. Both keep a page within A4 proportions. */
const ROWS_PER_PDF_PAGE = 20
const ROWS_ON_TOTALS_PAGE = 17

const FIRM_NAME = 'KSM Nataraja Nadar Firm'

// Nirmala UI carries Tamil on Windows; system-ui covers it on Android and iOS.
const FONT_STACK = "'Segoe UI', 'Nirmala UI', system-ui, -apple-system, sans-serif"

const LABELS = {
  en: {
    subtitle: 'Statement of unpaid bills',
    billsTotal: 'Bills total',
    date: 'Date',
    bill: 'Bill',
    details: 'Details',
    due: 'Amount due',
    more: (n: number) => `+ ${n} more ${n === 1 ? 'bill' : 'bills'} not shown`,
    advance: 'Less: advance paid',
    total: 'Total outstanding',
    asOn: (d: string) => `As on ${d}`,
    nothing: 'No unpaid bills',
    page: (i: number, n: number) => `Page ${i} of ${n}`,
  },
  ta: {
    subtitle: 'செலுத்தப்படாத பில் விவரம்',
    billsTotal: 'பில் மொத்தம்',
    date: 'தேதி',
    bill: 'பில்',
    details: 'விவரம்',
    due: 'நிலுவைத் தொகை',
    more: (n: number) => `+ மேலும் ${n} பில்கள்`,
    advance: 'முன்பணம் கழித்து',
    total: 'மொத்த நிலுவை',
    asOn: (d: string) => `${d} நிலவரப்படி`,
    nothing: 'நிலுவை இல்லை',
    page: (i: number, n: number) => `பக்கம் ${i} / ${n}`,
  },
} as const

// Logical layout units. The canvas is drawn at SCALE so the result stays sharp
// after WhatsApp re-compresses it.
const SCALE = 2
const W = 900
const PAD = 40
const ROW_H = 46
const HEAD_H = 188
const TABLE_HEAD_H = 44
const FOOT_H = 54

/** ₹ with Indian digit grouping. The canvas can draw this; the PDF font cannot. */
function money(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Shortens text to fit `maxWidth`, adding an ellipsis when it has to cut. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut.trim()}…`
}

/** Turns the customer page's entries into rows: only what is still owed. */
export function unpaidRowsFromEntries(
  entries: Array<{
    entry_code: string
    description?: string | null
    balance: number | string
    created_at: string
  }>,
): LedgerImageRow[] {
  return entries
    .filter(entry => Number(entry.balance) > 0.01)
    .map(entry => ({
      date: new Date(entry.created_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      code: entry.entry_code,
      description: entry.description || '—',
      amountDue: Number(entry.balance),
    }))
}

interface PageOptions {
  /** Bills left off a single-image ledger, summarised as "+N more". */
  hiddenCount?: number
  /** Totals block; on a PDF it belongs on the last page only. */
  showTotals: boolean
  pageIndex?: number
  pageCount?: number
}

/** Draws one page and returns its canvas. */
function drawLedgerPage(
  input: LedgerImageInput,
  pageRows: LedgerImageRow[],
  opts: PageOptions,
): HTMLCanvasElement {
  const t = LABELS[input.language] ?? LABELS.en
  const hidden = opts.hiddenCount ?? 0
  const hasAdvance = (input.advanceAdjusted ?? 0) > 0.01

  const MORE_H = hidden > 0 ? 38 : 0
  // With an advance there are two lines above the total band, so that the
  // arithmetic on the page adds up: bills total, less advance, then the net.
  const TOTAL_H = opts.showTotals ? (hasAdvance ? 172 : 92) : 0
  const bodyRows = Math.max(pageRows.length, pageRows.length === 0 ? 1 : 0)
  const H = HEAD_H + TABLE_HEAD_H + bodyRows * ROW_H + MORE_H + TOTAL_H + FOOT_H

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create the ledger image on this device')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Header band
  ctx.fillStyle = '#4f46e5'
  ctx.fillRect(0, 0, W, 104)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 30px ${FONT_STACK}`
  ctx.fillText(FIRM_NAME, PAD, 42)
  ctx.font = `400 17px ${FONT_STACK}`
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.fillText(t.subtitle, PAD, 74)

  // Customer
  ctx.fillStyle = '#0f172a'
  ctx.font = `600 24px ${FONT_STACK}`
  ctx.fillText(fit(ctx, input.customerName, W - PAD * 2), PAD, 138)

  const idParts = [input.customerCode, input.phone].filter(Boolean) as string[]
  if (idParts.length > 0) {
    ctx.fillStyle = '#64748b'
    ctx.font = `400 15px ${FONT_STACK}`
    ctx.fillText(idParts.join('  •  '), PAD, 166)
  }

  // Column geometry: the amount is right-aligned at the page edge.
  const xDate = PAD
  const xCode = PAD + 128
  const xDesc = PAD + 300
  const xDueRight = W - PAD
  const descWidth = xDueRight - xDesc - 150

  let y = HEAD_H

  // Table header
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(PAD, y, W - PAD * 2, TABLE_HEAD_H)
  ctx.fillStyle = '#475569'
  ctx.font = `600 14px ${FONT_STACK}`
  const headMid = y + TABLE_HEAD_H / 2
  ctx.fillText(t.date, xDate + 12, headMid)
  ctx.fillText(t.bill, xCode, headMid)
  ctx.fillText(t.details, xDesc, headMid)
  ctx.textAlign = 'right'
  ctx.fillText(t.due, xDueRight - 12, headMid)
  ctx.textAlign = 'left'
  y += TABLE_HEAD_H

  pageRows.forEach((row, index) => {
    if (index % 2 === 1) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(PAD, y, W - PAD * 2, ROW_H)
    }
    const mid = y + ROW_H / 2

    ctx.fillStyle = '#334155'
    ctx.font = `400 15px ${FONT_STACK}`
    ctx.fillText(row.date, xDate + 12, mid)

    ctx.fillStyle = '#64748b'
    ctx.font = `400 14px ${FONT_STACK}`
    ctx.fillText(fit(ctx, row.code, xDesc - xCode - 16), xCode, mid)

    ctx.fillStyle = '#0f172a'
    ctx.font = `400 15px ${FONT_STACK}`
    ctx.fillText(fit(ctx, row.description, descWidth), xDesc, mid)

    ctx.font = `600 15px ${FONT_STACK}`
    ctx.textAlign = 'right'
    ctx.fillText(money(row.amountDue), xDueRight - 12, mid)
    ctx.textAlign = 'left'

    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, y + ROW_H - 0.5)
    ctx.lineTo(W - PAD, y + ROW_H - 0.5)
    ctx.stroke()

    y += ROW_H
  })

  if (pageRows.length === 0) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = `400 15px ${FONT_STACK}`
    ctx.fillText(t.nothing, xDate + 12, y + ROW_H / 2)
    y += ROW_H
  }

  if (hidden > 0) {
    ctx.fillStyle = '#64748b'
    ctx.font = `italic 400 14px ${FONT_STACK}`
    ctx.fillText(t.more(hidden), xDate + 12, y + MORE_H / 2)
    y += MORE_H
  }

  if (opts.showTotals) {
    y += 12
    if (hasAdvance) {
      // Gross first, then the deduction, so the reader can follow how the
      // outstanding figure was reached instead of seeing the bills add up to
      // one number and the total claim another.
      const billsTotal = input.rows.reduce((sum, row) => sum + row.amountDue, 0)

      ctx.font = `400 16px ${FONT_STACK}`
      ctx.fillStyle = '#475569'
      ctx.fillText(t.billsTotal, PAD + 12, y + 18)
      ctx.textAlign = 'right'
      ctx.fillText(money(billsTotal), xDueRight - 12, y + 18)
      ctx.textAlign = 'left'
      y += 40

      ctx.fillStyle = '#047857'
      ctx.fillText(t.advance, PAD + 12, y + 18)
      ctx.textAlign = 'right'
      ctx.fillText(`- ${money(input.advanceAdjusted ?? 0)}`, xDueRight - 12, y + 18)
      ctx.textAlign = 'left'
      y += 40
    }

    ctx.fillStyle = '#eef2ff'
    ctx.fillRect(PAD, y, W - PAD * 2, 64)
    ctx.fillStyle = '#312e81'
    ctx.font = `600 19px ${FONT_STACK}`
    ctx.fillText(t.total, PAD + 16, y + 32)
    ctx.font = `700 26px ${FONT_STACK}`
    ctx.textAlign = 'right'
    ctx.fillText(money(input.totalDue), xDueRight - 16, y + 32)
    ctx.textAlign = 'left'
    y += 64
  }

  // Footer: the date on the left, the page number on the right when paginated.
  const asOn = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  ctx.fillStyle = '#94a3b8'
  ctx.font = `400 13px ${FONT_STACK}`
  ctx.fillText(t.asOn(asOn), PAD, y + 28)
  if (opts.pageCount && opts.pageCount > 1 && opts.pageIndex) {
    ctx.textAlign = 'right'
    ctx.fillText(t.page(opts.pageIndex, opts.pageCount), W - PAD, y + 28)
    ctx.textAlign = 'left'
  }

  return canvas
}

function attachmentFileName(input: LedgerImageInput, extension: 'png' | 'pdf'): string {
  const safeName =
    (input.customerCode || input.customerName)
      .replace(/[^A-Za-z0-9-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'customer'
  const stamp = new Date().toISOString().slice(0, 10)
  return `ledger_${safeName}_${stamp}.${extension}`
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Could not create the ledger image on this device'))
    }, 'image/png')
  })
}

/** Splits the bills across pages, keeping the totals page short enough to fit. */
function paginate(rows: LedgerImageRow[]): LedgerImageRow[][] {
  const pages: LedgerImageRow[][] = []
  for (let i = 0; i < rows.length; i += ROWS_PER_PDF_PAGE) {
    pages.push(rows.slice(i, i + ROWS_PER_PDF_PAGE))
  }
  if (pages.length === 0) return [[]]

  // The last page also carries the totals block, so it holds fewer rows.
  const last = pages[pages.length - 1]
  if (last.length > ROWS_ON_TOTALS_PAGE) {
    pages[pages.length - 1] = last.slice(0, ROWS_ON_TOTALS_PAGE)
    pages.push(last.slice(ROWS_ON_TOTALS_PAGE))
  }
  return pages
}

/** Single-page PNG. Bills beyond the threshold are summarised, not dropped silently. */
export async function buildLedgerImage(input: LedgerImageInput): Promise<LedgerAttachment> {
  const shown = input.rows.slice(0, PDF_THRESHOLD_ROWS)
  const canvas = drawLedgerPage(input, shown, {
    hiddenCount: input.rows.length - shown.length,
    showTotals: true,
  })
  const blob = await canvasToBlob(canvas)
  return {
    blob,
    previewUrl: canvas.toDataURL('image/png'),
    fileName: attachmentFileName(input, 'png'),
    kind: 'png',
    pageCount: 1,
  }
}

/** Multi-page PDF built from the same canvas pages, so Tamil still renders. */
export async function buildLedgerPdf(input: LedgerImageInput): Promise<LedgerAttachment> {
  // Loaded on demand: jsPDF is large, and most reminders never need a PDF.
  const { jsPDF } = await import('jspdf')

  const pages = paginate(input.rows)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let previewUrl = ''

  pages.forEach((pageRows, index) => {
    const canvas = drawLedgerPage(input, pageRows, {
      showTotals: index === pages.length - 1,
      pageIndex: index + 1,
      pageCount: pages.length,
    })
    if (index === 0) previewUrl = canvas.toDataURL('image/png')
    if (index > 0) doc.addPage()
    // JPEG, not PNG: jsPDF embeds a PNG as raw pixel data unless asked to
    // deflate it, which turned a two-page ledger into a 17 MB file nobody on
    // mobile data would download. The quality is high enough that the figures
    // stay crisp. Scaled to the page width; the page canvases are kept within
    // A4 proportions so the height always fits.
    doc.addImage(
      canvas.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0,
      0,
      pageWidth,
      pageWidth * (canvas.height / canvas.width),
    )
  })

  return {
    blob: doc.output('blob'),
    previewUrl,
    fileName: attachmentFileName(input, 'pdf'),
    kind: 'pdf',
    pageCount: pages.length,
  }
}

/**
 * The attachment for a WhatsApp reminder: an image while it still reads well
 * in a chat, a PDF once there are too many bills. Only ever one file.
 */
export function buildLedgerAttachment(input: LedgerImageInput): Promise<LedgerAttachment> {
  return input.rows.length > PDF_THRESHOLD_ROWS ? buildLedgerPdf(input) : buildLedgerImage(input)
}
