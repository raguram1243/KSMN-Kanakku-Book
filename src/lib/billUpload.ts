import { api } from './api'
import type { BillDocument, BillInput } from './billImage'

export type { BillDocument, BillInput, BillItem } from './billImage'

export interface GeneratedBill {
  bill: BillDocument
  /** Set when the bill was made but could not be saved with the entry. */
  saveError: string | null
  /** The new attachment as the server returned it, when saved. */
  attachment: { attachment_id?: string; signed_url?: string; url?: string; file_type?: string } | null
}

/**
 * Draws the bill and saves it as the entry's generated bill (replacing any
 * earlier one on the server). The renderer, and jsPDF behind it, are loaded
 * only here, on demand, so they stay out of the main bundle.
 *
 * Throws only if the bill cannot be drawn. A failed upload is reported in
 * `saveError` so the caller can still show and print the bill.
 */
export async function generateAndSaveBill(input: BillInput, entryId: string): Promise<GeneratedBill> {
  const { buildBill } = await import('./billImage')
  const bill = await buildBill(input)
  try {
    const file = new File([bill.blob], bill.fileName, { type: bill.mimeType })
    const response = await api.uploadGeneratedBill(file, entryId)
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'Upload failed')
    }
    const attachment = await response.json().catch(() => null)
    return { bill, saveError: null, attachment }
  } catch (err) {
    return {
      bill,
      saveError: err instanceof Error && err.message ? err.message : 'Upload failed',
      attachment: null,
    }
  }
}

/** Plain numbers for the bill from rows that may hold strings (API rows). */
export function toBillItems(
  items: Array<{ item_name: string; qty: number | string; rate: number | string; amount: number | string }>,
) {
  return items.map(item => ({
    item_name: item.item_name,
    qty: Number(item.qty) || 0,
    rate: Number(item.rate) || 0,
    amount: Number(item.amount) || 0,
  }))
}
