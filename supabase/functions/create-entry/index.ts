import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { assertOwnFileUrl, cleanAttachments, signUrl } from '../_shared/storage.ts'
import { normalizeLineItems, summarizeLineItems } from '../_shared/entry-items.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TOTAL = 9_999_999_999.99

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters)`)
  return trimmed || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase)
    const body = await readJson(req)

    const customerId = body.customer_id
    if (typeof customerId !== 'string' || !UUID_RE.test(customerId)) {
      throw new HttpError(400, 'Pick a customer')
    }

    const entryMode = body.entry_mode
    if (entryMode !== 'quick' && entryMode !== 'detailed') {
      throw new HttpError(400, 'entry_mode must be "quick" or "detailed"')
    }

    // A detailed entry is its line items. Saving one without them loses the
    // breakdown for good, so refuse it. Its total is computed by the database
    // from the items; whatever total the browser sent is ignored.
    const lineItems = normalizeLineItems(body.items)
    if (entryMode === 'detailed' && lineItems.length === 0) {
      throw new HttpError(400, 'A detailed entry needs at least one item with a name and a quantity above zero')
    }
    if (lineItems.length > 500) throw new HttpError(400, 'Too many items')

    let total: number | null = null
    if (entryMode === 'quick') {
      total = Number(body.total_amount)
      if (!Number.isFinite(total) || total <= 0) {
        throw new HttpError(400, 'Amount must be a number greater than 0')
      }
      if (total > MAX_TOTAL) throw new HttpError(400, 'Amount is too large')
    }

    // Detailed entries have no description of their own, so lists, reports,
    // statements and reminders get a summary built from the items instead.
    const description = entryMode === 'detailed'
      ? summarizeLineItems(lineItems)
      : optionalText(body.description, 'Description', 1000)

    const notes = optionalText(body.notes, 'Notes', 2000)
    const photoUrl = body.photo_url ? assertOwnFileUrl(body.photo_url, 'photo_url') : null
    const attachments = cleanAttachments(body.attachments)

    // One transaction: code, entry, items, attachments, advance applied.
    const { data: result, error } = await supabase.rpc('create_credit_entry', {
      p_customer_id: customerId,
      p_entry_mode: entryMode,
      p_description: description || null,
      p_total_amount: total,
      p_items: lineItems,
      p_notes: notes,
      p_photo_url: photoUrl,
      p_attachments: attachments,
      p_created_by: caller.staff_id,
    })
    if (error) throw error

    if (caller.role === 'admin') {
      if (result?.entry?.photo_url) result.entry.photo_url = await signUrl(supabase, result.entry.photo_url)
      return json(req, result)
    }

    // Staff get an echo of the bill they entered, nothing about what is paid
    // or owed.
    const e = (result?.entry ?? {}) as Record<string, unknown>
    return json(req, {
      entry: {
        id: e.id,
        entry_code: e.entry_code,
        customer_id: e.customer_id,
        entry_mode: e.entry_mode,
        description: e.description ?? null,
        total_amount: e.total_amount,
        created_at: e.created_at,
      },
    })
  } catch (error) {
    return errorResponse(req, error, 'create-entry')
  }
})
