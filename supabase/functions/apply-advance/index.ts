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

    const { customer_id } = await req.json()

    if (!customer_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: customer_id' }),
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

    const totalAvailable = (unallocatedPayments || []).reduce(
      (sum, p) => sum + Number(p.unallocated_amount), 0
    )

    if (totalAvailable <= 0.01) {
      return new Response(
        JSON.stringify({ success: true, applied: 0, remaining_advance: 0, entries: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch unpaid / partial entries for this customer (oldest first)
    const { data: entries, error: entriesError } = await supabase
      .from('credit_entries')
      .select('id, entry_code, balance, created_at')
      .eq('customer_id', customer_id)
      .gt('balance', 0.01)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    if (entriesError) throw entriesError

    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ success: true, applied: 0, remaining_advance: totalAvailable, entries: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Pre-fetch existing allocations so we don't violate the UNIQUE(payment_id, credit_entry_id) constraint.
    // payment_allocations has no customer_id column; scope via this customer's payments + entries.
    const paymentIds = (unallocatedPayments || []).map(p => p.payment_id)
    const entryIds = (entries || []).map(e => e.id)
    const { data: existingAllocs, error: existingError } = await supabase
      .from('payment_allocations')
      .select('payment_id, credit_entry_id')
      .in('payment_id', paymentIds)
      .in('credit_entry_id', entryIds)

    if (existingError) throw existingError

    const usedSet = new Set(
      (existingAllocs || []).map(a => `${a.payment_id}::${a.credit_entry_id}`)
    )

    // Walk payments FIFO, then entries FIFO, allocating until advance is exhausted
    let remaining = totalAvailable
    const allocationsToInsert: Array<{ payment_id: string; credit_entry_id: string; allocated_amount: number }> = []
    const entryAppliedMap = new Map<string, number>()
    const entryBalanceBefore = new Map<string, number>()

    for (const e of entries || []) {
      entryBalanceBefore.set(e.id, Number(e.balance))
    }

    for (const payment of unallocatedPayments || []) {
      if (remaining <= 0.01) break

      for (const entry of entries || []) {
        if (remaining <= 0.01) break

        const key = `${payment.payment_id}::${entry.id}`
        if (usedSet.has(key)) continue

        const entryBalance = Number(entry.balance)
        const available = Number(payment.unallocated_amount)
        const allocation = Math.min(available, entryBalance, remaining)

        if (allocation <= 0.01) continue

        remaining -= allocation
        usedSet.add(key)

        allocationsToInsert.push({
          payment_id: payment.payment_id,
          credit_entry_id: entry.id,
          allocated_amount: allocation,
        })

        entryAppliedMap.set(entry.id, (entryAppliedMap.get(entry.id) || 0) + allocation)
      }
    }

    let applied = 0
    if (allocationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('payment_allocations')
        .insert(allocationsToInsert)

      if (insertError) throw insertError
      applied = allocationsToInsert.reduce((s, a) => s + Number(a.allocated_amount), 0)
    }

    // Re-fetch updated balances after trigger recalculations
    const { data: updatedEntries, error: updatedError } = await supabase
      .from('credit_entries')
      .select('id, entry_code, balance')
      .in('id', entryIds)

    if (updatedError) throw updatedError

    const updatedMap = new Map((updatedEntries || []).map(e => [e.id, e]))

    const resultEntries = (entries || [])
      .filter(e => (entryAppliedMap.get(e.id) || 0) > 0.01)
      .map(e => ({
        entry_id: e.id,
        entry_code: e.entry_code,
        applied: entryAppliedMap.get(e.id) || 0,
        balance_before: entryBalanceBefore.get(e.id) || 0,
        balance_after: updatedMap.get(e.id) ? Number(updatedMap.get(e.id)!.balance) : Number(e.balance),
      }))

    return new Response(
      JSON.stringify({
        success: true,
        applied,
        remaining_advance: remaining,
        entries: resultEntries,
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