import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'
import { parseStorageUrl } from '../_shared/storage.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    let token
    try {
      token = await verifyToken(authHeader)
    } catch (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (token.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { payment_id } = await req.json()

    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: 'Payment ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})