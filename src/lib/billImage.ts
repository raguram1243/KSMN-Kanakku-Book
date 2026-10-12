/**
 * Draws a detailed credit entry as a printable bill: a PNG picture for up to
 * 20 items, an A4 PDF beyond that.
 *
 * Built the same way as ledgerImage.ts — canvas with the device's own fonts,
 * so Tamil names and the rupee sign render — and the PDF is assembled from the
 * same canvas pages. jsPDF is loaded on demand only for the PDF case, and this
 * whole module is itself imported on demand from the Print Bill buttons, so
 * none of it is in the main bundle.
 *
 * Deliberately shows only this one bill: no notes, no balance, no advance and
 * no customer totals. Staff print these too.
 *
 * Nothing here touches the network apart from loading the shop logo from this
 * site's own /public folder.
 */

import { amountInWords } from './amountInWords'

export interface BillItem {
  item_name: string
  qty: number
  rate: number
  amount: number
}

export interface BillInput {
  /** Entry code, used as the bill number, e.g. "KSMN-0094-3". */
  entryCode: string
  /** The entry's created_at (ISO). Shown as the bill date in IST. */
  billDate: string
  customerName: string
  customerCode?: string | null
  phone?: string | null
  items: BillItem[]
  total: number
}

/**
 * How the bill is printed on an A4 sheet:
 * - `half`: a picture on the top half of the page (cut or fold it off);
 * - `full`: a picture filling the page;
 * - `pdf`: one picture per PDF page.
 */
export type BillLayout = 'half' | 'full' | 'pdf'

export interface BillDocument {
  blob: Blob
  kind: 'png' | 'pdf'
  mimeType: 'image/png' | 'application/pdf'
  fileName: string
  /** One image per page (PNG data URLs), for the preview and for printing. */
  pageImages: string[]
  pageCount: number
  layout: BillLayout
  total: number
  /** Bill date as dd/mm/yyyy (IST), the same text the bill shows. */
  billDateText: string
}

/** Up to this many items fit on the top half of an A4 sheet. */
export const HALF_PAGE_MAX_ITEMS = 10
/** Up to this many items stay a single picture; more becomes a PDF. */
export const PICTURE_MAX_ITEMS = 20

/** The server refuses files above 4 MB. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export function billLayoutFor(itemCount: number): BillLayout {
  if (itemCount <= HALF_PAGE_MAX_ITEMS) return 'half'
  if (itemCount <= PICTURE_MAX_ITEMS) return 'full'
  return 'pdf'
}

const FIRM_NAME = 'KSM Nataraja Nadar Firm'
const DISCLAIMER =
  'This is not a GST or tax invoice. It is given only as a reminder of this credit purchase.'
const LOGO_URL = '/ksmn-logo-full.png'

// Nirmala UI carries Tamil on Windows; system-ui covers it on Android and iOS.
const FONT_STACK = "'Segoe UI', 'Nirmala UI', system-ui, -apple-system, sans-serif"

const ACCENT = '#4338ca'
const ACCENT_SOFT = '#eef2ff'
const INK = '#0f172a'
const MUTED = '#64748b'
const RULE = '#e2e8f0'

// Logical layout units; the canvas is drawn at SCALE for a sharp print.
const SCALE = 2
const W = 900
const PAD = 40
/** An A4 page in logical units (210 x 297 mm at this width). */
const A4_H = Math.round((W * 297) / 210)

const HEAD_H = 232
const TABLE_HEAD_H = 42
const LINE_H = 21
const ROW_PAD = 10
const TOTALS_H = 128
const FOOT_H = 52

// Columns: No. | Item | Qty | Rate | Amount (numbers right-aligned).
const X_NO = PAD + 12
const X_ITEM = PAD + 64
const X_QTY_R = W - PAD - 330
const X_RATE_R = W - PAD - 172
const X_AMT_R = W - PAD - 12
const ITEM_W = X_QTY_R - 96 - X_ITEM

/** Indian digit grouping, two decimals, no symbol (for table cells). */
function num2(amount: number): string {
  return Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function money(amount: number): string {
  return `₹${num2(amount)}`
}

function qtyText(qty: number): string {
  return Number(qty || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

/** dd/mm/yyyy in India time, whatever the device's own time zone. */
export function billDateIST(iso: string): string {
  const date = iso ? new Date(iso) : new Date()
  const valid = Number.isNaN(date.getTime()) ? new Date() : date
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(valid)
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

/** Word-wraps into at most `maxLines` lines; the last line is ellipsised if needed. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = ''
  let i = 0
  for (; i < words.length; i++) {
    const next = current ? `${current} ${words[i]}` : words[i]
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next
    } else {
      lines.push(current)
      current = words[i]
      if (lines.length === maxLines - 1) break
    }
  }
  if (i < words.length) {
    // Out of lines: everything left goes on the last one, cut to fit.
    current = [current, ...words.slice(i + 1)].join(' ')
  }
  lines.push(current)
  return lines.map(line => fit(ctx, line, maxWidth))
}

let logoPromise: Promise<HTMLImageElement | null> | null = null

/** The shop logo, loaded once. A missing logo never stops the bill. */
function loadLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) {
    logoPromise = new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => {
        logoPromise = null
        resolve(null)
      }
      img.src = LOGO_URL
    })
  }
  return logoPromise
}

/** A measuring context, so pagination can know each row's height up front. */
function measuringContext(): CanvasRenderingContext2D {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) throw new Error('Could not create the bill on this device')
  return ctx
}

const ITEM_FONT = `400 16px ${FONT_STACK}`

interface PreparedRow {
  index: number
  item: BillItem
  lines: string[]
  height: number
}

function prepareRows(items: BillItem[]): PreparedRow[] {
  const ctx = measuringContext()
  ctx.font = ITEM_FONT
  return items.map((item, index) => {
    const lines = wrap(ctx, item.item_name || '—', ITEM_W, 2)
    return { index, item, lines, height: lines.length * LINE_H + ROW_PAD * 2 }
  })
}

interface PageOptions {
  showTotals: boolean
  pageIndex: number
  pageCount: number
  /** Fixed page height (PDF pages); pictures size to their content. */
  fixedHeight?: number
}

function drawPage(
  input: BillInput,
  rows: PreparedRow[],
  logo: HTMLImageElement | null,
  opts: PageOptions,
): HTMLCanvasElement {
  const bodyH = rows.reduce((sum, row) => sum + row.height, 0)
  const contentH = HEAD_H + TABLE_HEAD_H + bodyH + (opts.showTotals ? TOTALS_H : 0) + FOOT_H
  const H = Math.max(opts.fixedHeight ?? 0, contentH)

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create the bill on this device')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // ── Header: logo, shop name, bill number and date ──
  let textX = PAD
  if (logo && logo.naturalWidth > 0) {
    const logoH = 64
    const logoW = Math.round((logo.naturalWidth / logo.naturalHeight) * logoH)
    ctx.drawImage(logo, PAD, 28, logoW, logoH)
    textX = PAD + logoW + 18
  }
  ctx.fillStyle = ACCENT
  ctx.font = `700 28px ${FONT_STACK}`
  ctx.fillText(fit(ctx, FIRM_NAME, W - PAD - textX - 190), textX, 50)
  ctx.fillStyle = MUTED
  ctx.font = `400 15px ${FONT_STACK}`
  ctx.fillText('Credit bill', textX, 78)

  ctx.textAlign = 'right'
  ctx.fillStyle = MUTED
  ctx.font = `400 14px ${FONT_STACK}`
  ctx.fillText('Bill No.', W - PAD, 38)
  ctx.fillStyle = INK
  ctx.font = `600 17px ${FONT_STACK}`
  ctx.fillText(input.entryCode, W - PAD, 60)
  ctx.fillStyle = MUTED
  ctx.font = `400 14px ${FONT_STACK}`
  ctx.fillText(`Date: ${billDateIST(input.billDate)}`, W - PAD, 84)
  ctx.textAlign = 'left'

  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, 112)
  ctx.lineTo(W - PAD, 112)
  ctx.stroke()

  // ── Customer ──
  ctx.fillStyle = MUTED
  ctx.font = `400 14px ${FONT_STACK}`
  ctx.fillText('Bill to', PAD, 138)
  ctx.fillStyle = INK
  ctx.font = `600 22px ${FONT_STACK}`
  ctx.fillText(fit(ctx, input.customerName || '—', W - PAD * 2), PAD, 166)
  const idParts = [input.customerCode, input.phone].filter(Boolean) as string[]
  if (idParts.length > 0) {
    ctx.fillStyle = MUTED
    ctx.font = `400 15px ${FONT_STACK}`
    ctx.fillText(fit(ctx, idParts.join('  •  '), W - PAD * 2), PAD, 194)
  }

  // ── Items table ──
  let y = HEAD_H
  ctx.fillStyle = ACCENT_SOFT
  ctx.fillRect(PAD, y, W - PAD * 2, TABLE_HEAD_H)
  ctx.fillStyle = '#312e81'
  ctx.font = `600 14px ${FONT_STACK}`
  const headMid = y + TABLE_HEAD_H / 2
  ctx.fillText('No.', X_NO, headMid)
  ctx.fillText('Item', X_ITEM, headMid)
  ctx.textAlign = 'right'
  ctx.fillText('Qty', X_QTY_R, headMid)
  ctx.fillText('Rate (₹)', X_RATE_R, headMid)
  ctx.fillText('Amount (₹)', X_AMT_R, headMid)
  ctx.textAlign = 'left'
  y += TABLE_HEAD_H

  rows.forEach(row => {
    const firstMid = y + ROW_PAD + LINE_H / 2

    ctx.fillStyle = MUTED
    ctx.font = `400 15px ${FONT_STACK}`
    ctx.fillText(String(row.index + 1), X_NO, firstMid)

    ctx.fillStyle = INK
    ctx.font = ITEM_FONT
    row.lines.forEach((line, i) => ctx.fillText(line, X_ITEM, firstMid + i * LINE_H))

    ctx.textAlign = 'right'
    ctx.fillStyle = '#334155'
    ctx.font = `400 16px ${FONT_STACK}`
    ctx.fillText(qtyText(row.item.qty), X_QTY_R, firstMid)
    ctx.fillText(num2(row.item.rate), X_RATE_R, firstMid)
    ctx.fillStyle = INK
    ctx.font = `600 16px ${FONT_STACK}`
    ctx.fillText(num2(row.item.amount), X_AMT_R, firstMid)
    ctx.textAlign = 'left'

    y += row.height
    ctx.strokeStyle = RULE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, y - 0.5)
    ctx.lineTo(W - PAD, y - 0.5)
    ctx.stroke()
  })

  // ── Total and total in words (last page only) ──
  if (opts.showTotals) {
    y += 14
    ctx.fillStyle = ACCENT_SOFT
    ctx.fillRect(PAD, y, W - PAD * 2, 56)
    ctx.fillStyle = '#312e81'
    ctx.font = `600 19px ${FONT_STACK}`
    ctx.fillText('Total', PAD + 16, y + 28)
    ctx.font = `700 24px ${FONT_STACK}`
    ctx.textAlign = 'right'
    ctx.fillText(money(input.total), X_AMT_R, y + 28)
    ctx.textAlign = 'left'
    y += 56

    ctx.fillStyle = '#475569'
    ctx.font = `italic 400 15px ${FONT_STACK}`
    const words = wrap(ctx, `In words: ${amountInWords(input.total)} only`, W - PAD * 2 - 16, 2)
    words.forEach((line, i) => ctx.fillText(line, PAD + 16, y + 22 + i * 20))
  }

  // ── Footer: page number when paginated, then the light disclaimer ──
  if (opts.pageCount > 1) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = `400 13px ${FONT_STACK}`
    ctx.textAlign = 'right'
    ctx.fillText(`Page ${opts.pageIndex} of ${opts.pageCount}`, W - PAD, H - 40)
    ctx.textAlign = 'left'
  }
  ctx.fillStyle = '#a3aab5'
  ctx.font = `400 12px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.fillText(fit(ctx, DISCLAIMER, W - PAD * 2), W / 2, H - 16)
  ctx.textAlign = 'left'

  return canvas
}

/** Splits rows across A4 pages by height; the last page also fits the totals. */
function paginate(rows: PreparedRow[]): PreparedRow[][] {
  const available = A4_H - HEAD_H - TABLE_HEAD_H - FOOT_H
  const pages: PreparedRow[][] = []
  let page: PreparedRow[] = []
  let used = 0
  for (const row of rows) {
    if (used + row.height > available && page.length > 0) {
      pages.push(page)
      page = []
      used = 0
    }
    page.push(row)
    used += row.height
  }
  // The totals have to fit under the last rows; move rows over if they do not.
  if (used + TOTALS_H > available) {
    const moved: PreparedRow[] = []
    while (page.length > 1 && used + TOTALS_H > available) {
      const row = page.pop()!
      moved.unshift(row)
      used -= row.height
    }
    pages.push(page)
    page = moved
  }
  pages.push(page)
  return pages
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Could not create the bill picture on this device'))
    }, 'image/png')
  })
}

function billFileName(input: BillInput, extension: 'png' | 'pdf'): string {
  const safe = input.entryCode.replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'entry'
  return `bill_${safe}.${extension}`
}

function tooLarge(): Error {
  return new Error('The bill file is larger than 4 MB, so it cannot be saved. Try splitting the bill into two entries.')
}

/** Builds the bill: a PNG picture for up to 20 items, otherwise an A4 PDF. */
export async function buildBill(input: BillInput): Promise<BillDocument> {
  const layout = billLayoutFor(input.items.length)
  const rows = prepareRows(input.items)
  const logo = await loadLogo()
  const billDateText = billDateIST(input.billDate)

  if (layout !== 'pdf') {
    const canvas = drawPage(input, rows, logo, { showTotals: true, pageIndex: 1, pageCount: 1 })
    const blob = await canvasToBlob(canvas)
    if (blob.size > MAX_UPLOAD_BYTES) throw tooLarge()
    return {
      blob,
      kind: 'png',
      mimeType: 'image/png',
      fileName: billFileName(input, 'png'),
      pageImages: [canvas.toDataURL('image/png')],
      pageCount: 1,
      layout,
      total: input.total,
      billDateText,
    }
  }

  // Loaded on demand: jsPDF is large and only long bills need it.
  const { jsPDF } = await import('jspdf')
  const pages = paginate(rows)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageImages: string[] = []

  pages.forEach((pageRows, index) => {
    const canvas = drawPage(input, pageRows, logo, {
      showTotals: index === pages.length - 1,
      pageIndex: index + 1,
      pageCount: pages.length,
      fixedHeight: A4_H,
    })
    // JPEG keeps the file small (jsPDF embeds PNG as raw pixels); the same
    // JPEG is used for the on-screen preview and for printing.
    const jpeg = canvas.toDataURL('image/jpeg', 0.85)
    pageImages.push(jpeg)
    if (index > 0) doc.addPage()
    doc.addImage(jpeg, 'JPEG', 0, 0, pageWidth, Math.min(pageHeight, pageWidth * (canvas.height / canvas.width)))
  })

  const pdfBlob = doc.output('blob')
  if (pdfBlob.size > MAX_UPLOAD_BYTES) throw tooLarge()
  return {
    blob: new Blob([pdfBlob], { type: 'application/pdf' }),
    kind: 'pdf',
    mimeType: 'application/pdf',
    fileName: billFileName(input, 'pdf'),
    pageImages,
    pageCount: pages.length,
    layout,
    total: input.total,
    billDateText,
  }
}
