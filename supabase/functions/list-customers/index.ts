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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const search = url.searchParams.get('search') || ''
    const view = url.searchParams.get('view') || 'grid'
    const recent = url.searchParams.get('recent') === 'true'
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : 5

    let customers = []

    if (recent) {
      // Support for ?recent=true&limit=N:
      // Walk through credit_entries to find customers with the most recent credit entries.
      // We will perform a group-by query or simpler sub-queries.
      // In Supabase JS, to do aggregate maximum/ordering by child, we can query credit_entries, order by created_at desc,
      // and select distinct customer_ids, then fetch those customers. This is safe, efficient, and robust.
      const { data: recentEntries, error: entriesError } = await supabase
        .from('credit_entries')
        .select('customer_id, created_at')
        .order('created_at', { ascending: false })

      if (entriesError) throw entriesError

      const seenCustomerIds = new Set<string>()
      const orderedCustomerIds: string[] = []
      for (const entry of (recentEntries || [])) {
        if (!seenCustomerIds.has(entry.customer_id)) {
          seenCustomerIds.add(entry.customer_id)
          orderedCustomerIds.push(entry.customer_id)
          if (orderedCustomerIds.length >= limit) {
            break
          }
        }
      }

      if (orderedCustomerIds.length > 0) {
        // Fetch the corresponding customers from customer_view_staff view
        const { data: fetchedCustomers, error: fetchError } = await supabase
          .from('customer_view_staff')
          .select('*')
          .in('id', orderedCustomerIds)

        if (fetchError) throw fetchError

        // Sort them to match the ordered list
        const customerMap = new Map(fetchedCustomers?.map(c => [c.id, c]) || [])
        customers = orderedCustomerIds
          .map(id => customerMap.get(id))
          .filter(Boolean)
      }
    } else {
      let query = supabase
        .from('customer_view_staff')
        .select('*')
        .order('created_at', { ascending: false })

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,customer_code.ilike.%${search}%`)
      }

      const { data: fetched, error } = await query
      if (error) throw error
      customers = fetched || []
    }

    // Fetch aggregate balances for all customers
    const { data: allBalances } = await supabase
      .from('credit_entries')
      .select('customer_id, balance')

    const balanceMap = new Map<string, number>()
    for (const entry of allBalances || []) {
      const current = balanceMap.get(entry.customer_id) || 0
      balanceMap.set(entry.customer_id, current + Number(entry.balance))
    }

    // Fetch oldest unpaid entry date for each customer
    const { data: unpaidEntries } = await supabase
      .from('credit_entries')
      .select('customer_id, created_at')
      .neq('status', 'paid')
      .order('created_at', { ascending: true })

    const oldestUnpaidMap = new Map<string, string>()
    for (const entry of unpaidEntries || []) {
      if (!oldestUnpaidMap.has(entry.customer_id)) {
        oldestUnpaidMap.set(entry.customer_id, entry.created_at)
      }
    }

    // Fetch advance balances for all returned customers
    const customerIds = customers.map(c => c.id)
    let advanceMap = new Map<string, number>()
    if (customerIds.length > 0) {
      const { data: advanceRows } = await supabase
        .from('customer_advance_balance')
        .select('customer_id, advance_balance')
        .in('customer_id', customerIds)

      for (const row of advanceRows || []) {
        advanceMap.set(row.customer_id, Number(row.advance_balance) || 0)
      }
    }

    // Attach balance, oldest_unpaid_date, and advance_balance to each customer
    const customersWithBalance = customers.map(c => ({
      ...c,
      balance: balanceMap.get(c.id) || 0,
      oldest_unpaid_date: oldestUnpaidMap.get(c.id) || null,
      advance_balance: advanceMap.get(c.id) || 0,
    }))

    return new Response(
      JSON.stringify({ customers: customersWithBalance, view }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})