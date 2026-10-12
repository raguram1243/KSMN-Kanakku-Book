import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { parseStorageUrl } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { payment_id } = await readJson(req)

    if (!payment_id) {
      throw new HttpError(400, 'Payment ID required')
    }

    // Grab the storage file URLs before the delete cascades the attachment rows away
    const { data: attachments, error: attachmentsError } = await supabase
      .from('payment_attachments')
      .select('file_url')
      .eq('payment_id', payment_id)

    if (attachmentsError) throw attachmentsError

    // Delete the payment (allocations cascade-delete via FK, triggers recompute)
    const { error: deleteError } = await supabase
      .from('payments')
      .delete()
      .eq('id', payment_id)

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
    return errorResponse(req, error, 'delete-payment')
  }
})
