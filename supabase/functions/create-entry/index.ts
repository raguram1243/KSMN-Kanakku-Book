import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'

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
    const token = await verifyToken(authHeader)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { customer_id, entry_mode, description, total_amount, items, photo_url, notes, attachments } = await req.json()

    if (!customer_id || !entry_mode || !total_amount) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate entry code using the database function
    const { data: entryCode, error: codeError } = await supabase
      .rpc('generate_entry_code', { p_customer_id: customer_id })

    if (codeError) throw codeError

    // Create credit entry
    const { data: entry, error: entryError } = await supabase
      .from('credit_entries')
      .insert({
        entry_code: entryCode,
        customer_id,
        entry_mode,
        description: description || null,
        total_amount,
        photo_url: photo_url || null,
        notes: notes || null,
        created_by: token.staff_id,
      })
      .select()
      .single()

    if (entryError) throw entryError

    // Create attachments (multi-file)
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const attachmentRows = attachments
        .filter((a: any) => a.file_url && a.file_type)
        .map((a: any) => ({
          credit_entry_id: entry.id,
          file_url: a.file_url,
          file_type: a.file_type,
        }))

      if (attachmentRows.length > 0) {
        const { error: attachError } = await supabase
          .from('credit_entry_attachments')
          .insert(attachmentRows)

        if (attachError) throw attachError
      }
    }

    // Create line items for detailed mode
    if (entry_mode === 'detailed' && items && Array.isArray(items)) {
      const itemsToInsert = items
        .filter((item: any) => item.item_name && item.qty > 0)
        .map((item: any) => ({
          credit_entry_id: entry.id,
          item_name: item.item_name,
          qty: item.qty,
          rate: item.rate,
        }))

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from('credit_entry_items')
          .insert(itemsToInsert)

        if (itemsError) throw itemsError
      }
    }

    return new Response(
      JSON.stringify({ entry }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})