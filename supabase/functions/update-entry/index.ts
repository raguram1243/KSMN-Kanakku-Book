import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { cleanAttachments, signUrl } from '../_shared/storage.ts'
import { normalizeLineItems, summarizeLineItems, toItemRows } from '../_shared/entry-items.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { entry_id, description, total_amount, items, notes, attachments } = await readJson(req)

    if (!entry_id || typeof entry_id !== 'string') {
      throw new HttpError(400, 'Missing required fields')
    }

    // Client-supplied file links must be our own uploads (validated before anything is written)
    const newAttachments = cleanAttachments(attachments)

    // Fetch existing entry to get paid_amount
    const { data: existingEntry, error: fetchError } = await supabase
      .from('credit_entries')
      .select('paid_amount, entry_mode')
      .eq('id', entry_id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existingEntry) throw new HttpError(404, 'Entry not found')

    const isDetailed = existingEntry.entry_mode === 'detailed'
    // `items` absent means "leave the items alone"; an empty or unusable list
    // means the edit would wipe the breakdown, which is never intended.
    const itemsProvided = isDetailed && Array.isArray(items)
    const lineItems = itemsProvided ? normalizeLineItems(items) : []

    if (itemsProvided && lineItems.length === 0) {
      throw new HttpError(400, 'A detailed entry needs at least one item with a name and a quantity above zero')
    }

    // Same rules as creation. A detailed total is computed from the normalized
    // items, never taken from the client; a quick total must be a real amount.
    // A detailed edit without items leaves the total (and items) untouched.
    let newTotal: number | null = null
    if (itemsProvided) {
      newTotal = lineItems.reduce((sum, item) => sum + Math.round(item.qty * item.rate * 100) / 100, 0)
      newTotal = Math.round(newTotal * 100) / 100
    } else if (!isDetailed) {
      if (typeof total_amount !== 'number' || !Number.isFinite(total_amount) || total_amount <= 0) {
        throw new HttpError(400, 'Total amount must be a number greater than zero')
      }
      newTotal = Math.round(total_amount * 100) / 100
    }
    if (newTotal !== null && newTotal <= 0) {
      throw new HttpError(400, 'Total amount must be greater than zero')
    }

    // Validation: new amount can't be less than already paid
    if (newTotal !== null && newTotal < Number(existingEntry.paid_amount)) {
      throw new HttpError(400, `New amount cannot be less than the amount already paid (₹${existingEntry.paid_amount})`)
    }

    // The description of a detailed entry is derived from its items, so it is
    // regenerated here; sending the old one back would let it go stale.
    const entryUpdate: Record<string, unknown> = {
      notes: typeof notes === 'string' && notes ? notes : null,
    }
    if (newTotal !== null) entryUpdate.total_amount = newTotal
    if (itemsProvided) {
      entryUpdate.description = summarizeLineItems(lineItems) || null
    } else if (!isDetailed) {
      entryUpdate.description = typeof description === 'string' && description ? description : null
    }

    // Update the credit entry
    const { error: updateError } = await supabase
      .from('credit_entries')
      .update(entryUpdate)
      .eq('id', entry_id)

    if (updateError) throw updateError

    // Replace the line items, re-numbered in the order they were submitted.
    // The new rows go in before the old ones come out: there is no
    // transaction around the two calls, and a failed insert after a
    // successful delete would wipe the breakdown for good.
    if (itemsProvided) {
      const { data: previousItems, error: previousItemsError } = await supabase
        .from('credit_entry_items')
        .select('id')
        .eq('credit_entry_id', entry_id)

      if (previousItemsError) throw previousItemsError

      const { error: itemsError } = await supabase
        .from('credit_entry_items')
        .insert(toItemRows(entry_id, lineItems))

      if (itemsError) throw itemsError

      const previousIds = (previousItems || []).map((row: any) => row.id)
      if (previousIds.length > 0) {
        const { error: deleteItemsError } = await supabase
          .from('credit_entry_items')
          .delete()
          .in('id', previousIds)

        if (deleteItemsError) throw deleteItemsError
      }
    }

    // Attachments added during the edit are appended to the entry. They have
    // already been uploaded to storage by this point, so dropping them here
    // would leave orphan files and lose the photo the user just attached.
    if (newAttachments.length > 0) {
      const { error: attachError } = await supabase
        .from('credit_entry_attachments')
        .insert(newAttachments.map((a) => ({ credit_entry_id: entry_id, ...a })))

      if (attachError) throw attachError
    }

    // Re-fetch the entry with updated generated columns
    const { data: entry, error: refetchError } = await supabase
      .from('credit_entries')
      .select('*')
      .eq('id', entry_id)
      .single()

    if (refetchError) throw refetchError

    entry.photo_url = await signUrl(supabase, entry.photo_url)

    return json(req, { entry })
  } catch (error) {
    return errorResponse(req, error, 'update-entry')
  }
})
