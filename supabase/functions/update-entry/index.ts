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

    if (token.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { entry_id, description, total_amount, items, notes } = await req.json()

    if (!entry_id || total_amount === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch existing entry to get paid_amount
    const { data: existingEntry, error: fetchError } = await supabase
      .from('credit_entries')
      .select('paid_amount, entry_mode')
      .eq('id', entry_id)
      .single()

    if (fetchError) throw fetchError

    // Validation: new amount can't be less than already paid
    if (total_amount < existingEntry.paid_amount) {
      return new Response(
        JSON.stringify({ error: `New amount cannot be less than the amount already paid (₹${existingEntry.paid_amount})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update the credit entry
    const { error: updateError } = await supabase
      .from('credit_entries')
      .update({
        description: description || null,
        total_amount,
        notes: notes || null,
      })
      .eq('id', entry_id)

    if (updateError) throw updateError

    // If detailed mode and items provided, replace items
    if (existingEntry.entry_mode === 'detailed' && items && Array.isArray(items)) {
      // Delete existing items
      const { error: deleteItemsError } = await supabase
        .from('credit_entry_items')
        .delete()
        .eq('credit_entry_id', entry_id)

      if (deleteItemsError) throw deleteItemsError

      // Insert new items
      const itemsToInsert = items
        .filter((item: any) => item.item_name && item.qty > 0)
        .map((item: any) => ({
          credit_entry_id: entry_id,
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

    // Re-fetch the entry with updated generated columns
    const { data: entry, error: refetchError } = await supabase
      .from('credit_entries')
      .select('*')
      .eq('id', entry_id)
      .single()

    if (refetchError) throw refetchError

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