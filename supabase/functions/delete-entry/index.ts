import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { parseStorageUrl } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { entry_id } = await readJson(req)

    if (!entry_id) {
      throw new HttpError(400, 'Entry ID required')
    }

    // Check if any payment allocations exist for this entry
    const { data: allocations, error: allocError } = await supabase
      .from('payment_allocations')
      .select('id')
      .eq('credit_entry_id', entry_id)
      .limit(1)

    if (allocError) throw allocError

    if (allocations && allocations.length > 0) {
      throw new HttpError(400, 'Remove/undo the payment(s) on this bill first')
    }

    // Grab the storage file URLs before the delete cascades the attachment rows away
    const { data: attachments, error: attachmentsError } = await supabase
      .from('credit_entry_attachments')
      .select('file_url')
      .eq('credit_entry_id', entry_id)

    if (attachmentsError) throw attachmentsError

    // Delete the credit entry (items cascade-delete via FK)
    const { error: deleteError } = await supabase
      .from('credit_entries')
      .delete()
      .eq('id', entry_id)

    if (deleteError) throw deleteError

    // Best-effort cleanup of the actual storage objects so orphaned files
    // don't accumulate. Failures here are non-fatal (logged) — the DB rows
    // are already gone, so we never block the user on a storage hiccup.
    for (const attachment of (attachments || []) as { file_url: string }[]) {
      const parsed = parseStorageUrl(attachment.file_url)
      if (!parsed.bucket || !parsed.path) continue
      try {
        const { error: removeError } = await supabase.storage
          .from(parsed.bucket)
          .remove([parsed.path])
        if (removeError) {
          console.warn('storage remove failed:', removeError.message)
        }
      } catch (removeErr) {
        console.warn('storage remove failed:', (removeErr as Error).message)
      }
    }

    return json(req, { success: true })
  } catch (error) {
    return errorResponse(req, error, 'delete-entry')
  }
})
