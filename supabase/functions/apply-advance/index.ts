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

    // Live capacity left on each side of the allocation. The fetched rows are a
    // snapshot: entry.balance and payment.unallocated_amount never change while we
    // loop, so reading them directly let one bill be filled by several payments and
    // one payment be spent on several bills. Two 1000 advances against a single 1000
    // bill applied 2000 and drove the balance to -1000; two 500 advances against two
    // 500 bills spent 1000 out of a single 500 payment. usedSet only blocks the same
    // (payment, entry) pair twice, so it cannot catch either case. These two maps
    // carry the running totals so Math.min below sees what is actually left.
    const entryRemaining = new Map<string, number>()
    const paymentRemaining = new Map<string, number>()

    for (const e of entries || []) {
      entryBalanceBefore.set(e.id, Number(e.balance))
      entryRemaining.set(e.id, Number(e.balance))
    }

    for (const p of unallocatedPayments || []) {
      paymentRemaining.set(p.payment_id, Number(p.unallocated_amount))
    }

    for (const payment of unallocatedPayments || []) {
      if (remaining <= 0.01) break
      if ((paymentRemaining.get(payment.payment_id) || 0) <= 0.01) continue

      for (const entry of entries || []) {
        if (remaining <= 0.01) break
        if ((paymentRemaining.get(payment.payment_id) || 0) <= 0.01) break

        const key = `${payment.payment_id}::${entry.id}`
        if (usedSet.has(key)) continue

        const entryBalance = entryRemaining.get(entry.id) || 0
        if (entryBalance <= 0.01) continue

        const available = paymentRemaining.get(payment.payment_id) || 0
        const allocation = Math.min(available, entryBalance, remaining)

        if (allocation <= 0.01) continue

        remaining -= allocation
        entryRemaining.set(entry.id, entryBalance - allocation)
        paymentRemaining.set(payment.payment_id, available - allocation)
        usedSet.add(key)

        allocationsToInsert.push({
          payment_id: payment.payment_id,
          credit_entry_id: entry.id,
          allocated_amount: allocation,
        })

        entryAppliedMap.set(entry.id, (entryAppliedMap.get(entry.id) || 0) + allocation)
      }
    }

    // Guard rail, not a working check: after the running totals above this cannot
    // trip. It is here so a future regression fails loudly instead of writing
    // over-allocations into the ledger.
    const paymentTotals = new Map<string, number>()
    for (const a of allocationsToInsert) {
      const paymentOriginal = Number(
        (unallocatedPayments || []).find(p => p.payment_id === a.payment_id)?.unallocated_amount ?? 0
      )
      const entryOriginal = entryBalanceBefore.get(a.credit_entry_id) || 0

      if (a.allocated_amount > paymentOriginal + 0.01) {
        throw new Error(
          `Allocation ${a.allocated_amount} exceeds unallocated amount ${paymentOriginal} on payment ${a.payment_id}`
        )
      }
      if (a.allocated_amount > entryOriginal + 0.01) {
        throw new Error(
          `Allocation ${a.allocated_amount} exceeds balance ${entryOriginal} on entry ${a.credit_entry_id}`
        )
      }

      paymentTotals.set(a.payment_id, (paymentTotals.get(a.payment_id) || 0) + a.allocated_amount)
    }

    for (const [paymentId, total] of paymentTotals) {
      const paymentOriginal = Number(
        (unallocatedPayments || []).find(p => p.payment_id === paymentId)?.unallocated_amount ?? 0
      )
      if (total > paymentOriginal + 0.01) {
        throw new Error(
          `Allocations total ${total} exceed unallocated amount ${paymentOriginal} on payment ${paymentId}`
        )
      }
    }

    for (const [entryId, total] of entryAppliedMap) {
      const entryOriginal = entryBalanceBefore.get(entryId) || 0
      if (total > entryOriginal + 0.01) {
        throw new Error(
          `Allocations total ${total} exceed balance ${entryOriginal} on entry ${entryId}`
        )
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