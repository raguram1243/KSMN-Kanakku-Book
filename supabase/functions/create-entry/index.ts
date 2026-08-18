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

    // Automatically apply any existing advance credit toward this new entry
    // (only this entry — do NOT sweep across other customer entries here)
    let advanceApplied = 0

    const { data: advanceRow, error: advanceError } = await supabase
      .from('customer_advance_balance')
      .select('advance_balance')
      .eq('customer_id', customer_id)
      .single()

    if (!advanceError && advanceRow && Number(advanceRow.advance_balance) > 0.01) {
      const availableAdvance = Number(advanceRow.advance_balance) || 0
      const entryBalance = Number(entry.total_amount)
      advanceApplied = Math.min(availableAdvance, entryBalance)

      if (advanceApplied > 0.01) {
        // Fetch unallocated payments FIFO
        const { data: unallocatedPayments, error: unallocError } = await supabase
          .from('payment_unallocated')
          .select('payment_id, unallocated_amount, payment_date')
          .eq('customer_id', customer_id)
          .gt('unallocated_amount', 0.01)
          .order('payment_date', { ascending: true })

        if (unallocError) throw unallocError

        let remaining = advanceApplied
        const allocationsToInsert: Array<{ payment_id: string; credit_entry_id: string; allocated_amount: number }> = []

        for (const payment of (unallocatedPayments || [])) {
          if (remaining <= 0.01) break

          const available = Number(payment.unallocated_amount)
          const allocation = Math.min(available, remaining)
          remaining -= allocation

          allocationsToInsert.push({
            payment_id: payment.payment_id,
            credit_entry_id: entry.id,
            allocated_amount: allocation,
          })
        }

        if (allocationsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('payment_allocations')
            .insert(allocationsToInsert)

          if (insertError) throw insertError
        }
      }
    }

    // Re-select the entry so the response reflects updated paid_amount / balance / status
    const { data: updatedEntry, error: refetchError } = await supabase
      .from('credit_entries')
      .select('*')
      .eq('id', entry.id)
      .single()

    if (refetchError) throw refetchError

    return new Response(
      JSON.stringify({ entry: updatedEntry, advance_applied: advanceApplied }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})