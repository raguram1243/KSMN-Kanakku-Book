import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { parseStorageUrl } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { customer_id } = await readJson(req)

    if (!customer_id) {
      throw new HttpError(400, 'Customer ID is required')
    }

    // Verify the customer exists (raises a clear error instead of a silent no-op)
    const { error: customerErr } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .single()

    if (customerErr) {
      throw new HttpError(404, 'Customer not found')
    }

    // Collect IDs of everything linked to this customer so we can grab the
    // storage file URLs before the transactional delete wipes the rows.
    const { data: entryIds, error: entryIdsErr } = await supabase
      .from('credit_entries')
      .select('id')
      .eq('customer_id', customer_id)
    if (entryIdsErr) throw entryIdsErr

    const { data: paymentIds, error: paymentIdsErr } = await supabase
      .from('payments')
      .select('id')
      .eq('customer_id', customer_id)
    if (paymentIdsErr) throw paymentIdsErr

    const entryIdArray = (entryIds || []).map((e: { id: string }) => e.id)
    const paymentIdArray = (paymentIds || []).map((p: { id: string }) => p.id)

    const fileUrls: string[] = []

    if (entryIdArray.length > 0) {
      const { data: entryAtts, error: entryAttErr } = await supabase
        .from('credit_entry_attachments')
        .select('file_url')
        .in('credit_entry_id', entryIdArray)
      if (entryAttErr) throw entryAttErr
      fileUrls.push(...(entryAtts || []).map((a: { file_url: string }) => a.file_url))
    }

    if (paymentIdArray.length > 0) {
      const { data: payAtts, error: payAttErr } = await supabase
        .from('payment_attachments')
        .select('file_url')
        .in('payment_id', paymentIdArray)
      if (payAttErr) throw payAttErr
      fileUrls.push(...(payAtts || []).map((a: { file_url: string }) => a.file_url))
    }

    // Transactional cascade delete of all DB rows (attachments, allocations,
    // line items, payments, entries, customers). Rolls back on any failure.
    const { error: deleteError } = await supabase.rpc('delete_customer_cascade', {
      p_customer_id: customer_id,
    })
    if (deleteError) throw deleteError

    // Best-effort cleanup of the actual storage objects so orphaned files
    // don't accumulate. Failures here are non-fatal (logged) — the DB rows
    // are already gone, so we never block the user on a storage hiccup.
    let filesRemoved = 0
    let filesSkipped = 0
    for (const fileUrl of fileUrls) {
      const parsed = parseStorageUrl(fileUrl)
      if (!parsed.bucket || !parsed.path) {
        filesSkipped++
        continue
      }
      const { error: removeError } = await supabase.storage
        .from(parsed.bucket)
        .remove([parsed.path])
      if (removeError) {
        // Non-fatal: orphaned storage file, but the records are deleted.
        console.warn('storage remove failed:', removeError.message)
        filesSkipped++
      } else {
        filesRemoved++
      }
    }

    return json(req, {
      success: true,
      files_removed: filesRemoved,
      files_skipped: filesSkipped,
    })
  } catch (error) {
    return errorResponse(req, error, 'delete-customer')
  }
})
