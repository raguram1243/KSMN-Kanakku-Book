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

    const { payment_id, amount, payment_date, payment_method, receipt_number, notes, allocations } = await req.json()

    if (!payment_id || !amount || !payment_date) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch existing allocations for this payment
    const { data: existingAllocations, error: existingAllocError } = await supabase
      .from('payment_allocations')
      .select('credit_entry_id, allocated_amount')
      .eq('payment_id', payment_id)

    if (existingAllocError) throw existingAllocError

    // Build a map of old allocations by credit_entry_id
    const oldAllocMap: Record<string, number> = {}
    for (const alloc of existingAllocations || []) {
      oldAllocMap[alloc.credit_entry_id] = Number(alloc.allocated_amount)
    }

    // Validation per allocation
    if (allocations && Array.isArray(allocations)) {
      for (const alloc of allocations) {
        if (!alloc.credit_entry_id || !alloc.allocated_amount || alloc.allocated_amount <= 0) continue

        // Fetch the entry's current balance
        const { data: entry, error: entryError } = await supabase
          .from('credit_entries')
          .select('balance, entry_code')
          .eq('id', alloc.credit_entry_id)
          .single()

        if (entryError) throw entryError

        // Available balance = current balance + old allocation from this payment (since it's being replaced)
        const oldAlloc = oldAllocMap[alloc.credit_entry_id] || 0
        const availableBalance = Number(entry.balance) + oldAlloc

        if (alloc.allocated_amount > availableBalance) {
          return new Response(
            JSON.stringify({ error: `Allocation for ${entry.entry_code} (₹${alloc.allocated_amount}) exceeds available balance (₹${availableBalance})` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Validation: sum of allocations must equal amount
      const totalAllocated = allocations
        .filter((a: any) => a.credit_entry_id && a.allocated_amount > 0)
        .reduce((sum: number, a: any) => sum + Number(a.allocated_amount), 0)

      if (Math.abs(totalAllocated - amount) > 0.01) {
        return new Response(
          JSON.stringify({ error: `Total allocated (₹${totalAllocated}) must equal payment amount (₹${amount})` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Update the payment
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        amount,
        payment_date,
        payment_method: payment_method || null,
        receipt_number: receipt_number || null,
        notes: notes || null,
      })
      .eq('id', payment_id)

    if (updateError) throw updateError

    // Delete existing allocations
    const { error: deleteAllocError } = await supabase
      .from('payment_allocations')
      .delete()
      .eq('payment_id', payment_id)

    if (deleteAllocError) throw deleteAllocError

    // Insert new allocations
    if (allocations && Array.isArray(allocations)) {
      const allocationsToInsert = allocations
        .filter((a: any) => a.credit_entry_id && a.allocated_amount > 0)
        .map((a: any) => ({
          payment_id,
          credit_entry_id: a.credit_entry_id,
          allocated_amount: a.allocated_amount,
        }))

      if (allocationsToInsert.length > 0) {
        const { error: insertAllocError } = await supabase
          .from('payment_allocations')
          .insert(allocationsToInsert)

        if (insertAllocError) throw insertAllocError
      }
    }

    // Re-fetch the payment
    const { data: payment, error: refetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single()

    if (refetchError) throw refetchError

    return new Response(
      JSON.stringify({ payment }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})