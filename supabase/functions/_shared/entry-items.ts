/**
 * Line items of a detailed credit entry.
 *
 * Normalising and summarising lives here so that create-entry and update-entry
 * cannot drift apart: both store the same rows, in the same order, and derive
 * the same `description` summary from them.
 */

export interface NormalizedLineItem {
  item_name: string
  qty: number
  rate: number
}

/** Number of item names shown in the generated summary before "+N more". */
const SUMMARY_NAME_LIMIT = 3

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

/**
 * Keeps only usable rows (a name and a positive quantity) and preserves the
 * order they were entered in. Anything unusable — a blank trailing row, a
 * string that is not a number — is dropped rather than stored as junk.
 */
export function normalizeLineItems(input: unknown): NormalizedLineItem[] {
  if (!Array.isArray(input)) return []

  const normalized: NormalizedLineItem[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue

    const item = raw as Record<string, unknown>
    const name = String(item.item_name ?? '').trim()
    const qty = toNumber(item.qty)
    const rate = toNumber(item.rate)

    if (!name) continue
    if (!(qty > 0)) continue
    if (!(rate >= 0)) continue

    normalized.push({ item_name: name, qty, rate })
  }

  return normalized
}

/**
 * Short human summary of the items, stored on `credit_entries.description` so
 * that lists, reports, statements and WhatsApp reminders have something to
 * show for a detailed entry. Format: "Cement, Sand, Paint +2 more".
 *
 * Migration 023 backfills existing rows with the identical format, so any
 * change here has to be mirrored there.
 */
export function summarizeLineItems(items: NormalizedLineItem[]): string {
  if (items.length === 0) return ''

  const shown = items.slice(0, SUMMARY_NAME_LIMIT).map((item) => item.item_name)
  const remaining = items.length - shown.length

  return remaining > 0 ? `${shown.join(', ')} +${remaining} more` : shown.join(', ')
}

/** Rows ready for insertion, numbered so the entered order can be restored. */
export function toItemRows(entryId: string, items: NormalizedLineItem[]) {
  return items.map((item, index) => ({
    credit_entry_id: entryId,
    item_name: item.item_name,
    qty: item.qty,
    rate: item.rate,
    sort_order: index,
  }))
}
