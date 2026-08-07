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

    const { customer_id, credit_entry_id, amount } = await req.json()

    if (!customer_id || !credit_entry_id || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch the credit entry to validate amount <= balance
    const { data: entry, error: entryError } = await supabase
      .from('credit_entries')
      .select('id, balance, entry_code')
      .eq('id', credit_entry_id)
      .single()

    if (entryError) throw entryError

    if (amount > Number(entry.balance)) {
      return new Response(
        JSON.stringify({ error: `Amount (₹${amount}) exceeds bill balance (₹${entry.balance})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch unallocated payments for this customer (FIFO - oldest first)
    const { data: unallocatedPayments, error: unallocError } = await supabase
      .from('payment_unallocated')
      .select('payment_id, unallocated_amount, payment_date')
      .eq('customer_id', customer_id)
      .gt('unallocated_amount', 0.01)
      .order('payment_date', { ascending: true })

    if (unallocError) throw unallocError

    // Calculate total available advance
    const totalAvailable = (unallocatedPayments || []).reduce(
      (sum, p) => sum + Number(p.unallocated_amount), 0
    )

    if (totalAvailable < amount) {
      return new Response(
        JSON.stringify({ error: `Insufficient advance balance. Available: ₹${totalAvailable}, requested: ₹${amount}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Walk through payments, allocating from each until amount is covered
    let remaining = amount
    const allocationsToInsert: Array<{ payment_id: string; credit_entry_id: string; allocated_amount: number }> = []

    for (const payment of unallocatedPayments || []) {
      if (remaining <= 0) break

      const available = Number(payment.unallocated_amount)
      const allocation = Math.min(available, remaining)
      remaining -= allocation

      allocationsToInsert.push({
        payment_id: payment.payment_id,
        credit_entry_id,
        allocated_amount: allocation,
      })
    }

    // Insert all allocations at once (trigger recalculates entry's paid_amount/balance/status)
    const { data: insertedAllocations, error: insertError } = await supabase
      .from('payment_allocations')
      .insert(allocationsToInsert)
      .select()

    if (insertError) throw insertError

    return new Response(
      JSON.stringify({ success: true, allocations: insertedAllocations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})