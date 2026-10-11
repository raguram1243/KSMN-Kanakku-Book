import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'
import { normalizeLineItems, summarizeLineItems, toItemRows } from '../_shared/entry-items.ts'

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

    const { entry_id, description, total_amount, items, notes, attachments } = await req.json()

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

    const isDetailed = existingEntry.entry_mode === 'detailed'
    // `items` absent means "leave the items alone"; an empty or unusable list
    // means the edit would wipe the breakdown, which is never intended.
    const itemsProvided = isDetailed && Array.isArray(items)
    const lineItems = itemsProvided ? normalizeLineItems(items) : []

    if (itemsProvided && lineItems.length === 0) {
      return new Response(
        JSON.stringify({ error: 'A detailed entry needs at least one item with a name and a quantity above zero' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // The description of a detailed entry is derived from its items, so it is
    // regenerated here; sending the old one back would let it go stale.
    const entryUpdate: Record<string, unknown> = {
      total_amount,
      notes: notes || null,
    }
    if (itemsProvided) {
      entryUpdate.description = summarizeLineItems(lineItems) || null
    } else if (!isDetailed) {
      entryUpdate.description = description || null
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
    if (Array.isArray(attachments) && attachments.length > 0) {
      const attachmentRows = attachments
        .filter((a: any) => a && a.file_url && a.file_type)
        .map((a: any) => ({
          credit_entry_id: entry_id,
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