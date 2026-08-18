import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

// Buckets used by upload-attachment for customer-linked files
const STORAGE_BUCKETS = ['entry-photos', 'entry-docs'] as const

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const token = await verifyToken(authHeader)

    if (token.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { customer_id } = await req.json()

    if (!customer_id) {
      return new Response(
        JSON.stringify({ error: 'Customer ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the customer exists (raises a clear error instead of a silent no-op)
    const { error: customerErr } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .single()

    if (customerErr) {
      throw new Error('Customer not found')
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

    return new Response(
      JSON.stringify({
        success: true,
        files_removed: filesRemoved,
        files_skipped: filesSkipped,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Extract the storage bucket + object path from a public file URL produced by
// supabase.storage.getPublicUrl(). Expected shape:
//   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<object-path>
function parseStorageUrl(fileUrl: string): { bucket: string | null; path: string | null } {
  try {
    const url = new URL(fileUrl)
    // pathname looks like /storage/v1/object/public/entry-photos/<file>
    const marker = '/storage/v1/object/public/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex === -1) return { bucket: null, path: null }

    const rest = url.pathname.slice(markerIndex + marker.length) // entry-photos/<file>
    const slashIndex = rest.indexOf('/')
    if (slashIndex === -1) return { bucket: null, path: null }

    const bucket = rest.slice(0, slashIndex)
    const path = rest.slice(slashIndex + 1)

    if (!(STORAGE_BUCKETS as readonly string[]).includes(bucket)) {
      return { bucket: null, path: null }
    }

    return { bucket, path }
  } catch {
    return { bucket: null, path: null }
  }
}