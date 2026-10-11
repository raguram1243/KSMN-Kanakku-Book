/**
 * Renders a customer's unpaid bills as a PNG, for attaching to a WhatsApp
 * reminder.
 *
 * Why a canvas and not the statement PDF: WhatsApp shows an image inline in
 * the chat, so the customer sees the amount without opening anything, and
 * canvas draws with the device's own fonts — which means Tamil and the rupee
 * sign render properly. The statement PDF cannot do either: pdf-lib's built-in
 * fonts are WinAnsi only, which is why that file says "Rs." instead of "₹".
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

export interface LedgerImageResult {
  blob: Blob
  dataUrl: string
  fileName: string
}

/** Beyond this the image is too tall to read in a chat; the rest is summarised. */
const MAX_ROWS = 20

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
  },
} as const

/** ₹ with Indian digit grouping. The canvas can draw this; the PDF cannot. */
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

export function buildLedgerImage(input: LedgerImageInput): Promise<LedgerImageResult> {
  const t = LABELS[input.language] ?? LABELS.en
  const shown = input.rows.slice(0, MAX_ROWS)
  const hidden = input.rows.length - shown.length
  const hasAdvance = (input.advanceAdjusted ?? 0) > 0.01

  // Logical layout units; the canvas is scaled up at the end so the PNG stays
  // sharp when WhatsApp re-compresses it.
  const SCALE = 2
  const W = 900
  const PAD = 40
  const ROW_H = 46
  const HEAD_H = 188
  const TABLE_HEAD_H = 44
  const MORE_H = hidden > 0 ? 38 : 0
  // With an advance there are two lines above the total band, so that the
  // arithmetic on the page adds up: bills total, less advance, then the net.
  const TOTAL_H = hasAdvance ? 172 : 92
  const FOOT_H = 54
  const H = HEAD_H + TABLE_HEAD_H + shown.length * ROW_H + MORE_H + TOTAL_H + FOOT_H

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Could not create the ledger image on this device'))
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'middle'

  // Page
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

  // Rows
  shown.forEach((row, index) => {
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

  if (shown.length === 0) {
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

  // Totals
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

  // Footer
  const asOn = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  ctx.fillStyle = '#94a3b8'
  ctx.font = `400 13px ${FONT_STACK}`
  ctx.fillText(t.asOn(asOn), PAD, y + 28)

  const safeName = (input.customerCode || input.customerName)
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'customer'
  const stamp = new Date().toISOString().slice(0, 10)
  const fileName = `ledger_${safeName}_${stamp}.png`

  const dataUrl = canvas.toDataURL('image/png')

  return new Promise<LedgerImageResult>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Could not create the ledger image on this device'))
        return
      }
      resolve({ blob, dataUrl, fileName })
    }, 'image/png')
  })
}
