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

    // Parse params
    const url = new URL(req.url)
    const search = url.searchParams.get('search') || ''
    const view = url.searchParams.get('view') || 'grid'
    const recent = url.searchParams.get('recent') === 'true'
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : 5
    const pageParam = url.searchParams.get('page')
    const pageSizeParam = url.searchParams.get('pageSize')
    const filterParam = url.searchParams.get('filter') || 'all'
    const sortParam = url.searchParams.get('sort') || 'name_asc'
    const page = pageParam ? parseInt(pageParam) : 1
    const pageSize = pageSizeParam ? parseInt(pageSizeParam) : 50

    let customers: any[] = []
    let total = 0

    if (recent) {
      // Recent-customers path: unchanged, uses recency ordering
      const { data: recentEntries, error: entriesError } = await supabase
        .from('credit_entries')
        .select('customer_id, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

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
        const { data: fetchedCustomers, error: fetchError } = await supabase
          .from('customer_view_staff')
          .select('*')
          .in('id', orderedCustomerIds)

        if (fetchError) throw fetchError

        const customerMap = new Map(fetchedCustomers?.map(c => [c.id, c]) || [])
        customers = orderedCustomerIds
          .map(id => customerMap.get(id))
          .filter(Boolean)
      }

      // Attach balances for the recency list (single aggregate query)
      if (customers.length > 0) {
        const customerIds = customers.map((c: any) => c.id)
        const { data: balanceRows } = await supabase
          .from('credit_entries')
          .select('customer_id, balance')
          .in('customer_id', customerIds)
        const balanceMap = new Map<string, number>()
        for (const row of balanceRows || []) {
          const current = balanceMap.get(row.customer_id) || 0
          balanceMap.set(row.customer_id, current + Number(row.balance))
        }
        const { data: advanceRows } = await supabase
          .from('customer_advance_balance')
          .select('customer_id, advance_balance')
          .in('customer_id', customerIds)
        const advanceMap = new Map<string, number>()
        for (const row of advanceRows || []) {
          advanceMap.set(row.customer_id, Number(row.advance_balance) || 0)
        }
        const { data: unpaidRows } = await supabase
          .from('credit_entries')
          .select('customer_id, created_at')
          .neq('status', 'paid')
          .in('customer_id', customerIds)
          .order('created_at', { ascending: true })
        const oldestUnpaidMap = new Map<string, string>()
        for (const row of unpaidRows || []) {
          if (!oldestUnpaidMap.has(row.customer_id)) {
            oldestUnpaidMap.set(row.customer_id, row.created_at)
          }
        }
        customers = customers.map((c: any) => ({
          ...c,
          balance: balanceMap.get(c.id) || 0,
          advance_balance: advanceMap.get(c.id) || 0,
          oldest_unpaid_date: oldestUnpaidMap.get(c.id) || null,
        }))
      }
    } else {
      // Main paginated path — delegate sorting + pagination to the
      // list_customers RPC so balances are computed across the full
      // dataset and sorted BEFORE the page slice is taken.
      const { data, error } = await supabase.rpc('list_customers', {
        p_search: search,
        p_filter: filterParam,
        p_sort: sortParam,
        p_page: page,
        p_page_size: pageSize,
      })
      if (error) throw error

      // total_count is returned on every row by the RPC — capture it
      // from the raw response BEFORE mapping, since mapped objects drop it.
      const totalCount = data && data.length > 0 ? Number(data[0].total_count) || 0 : 0

      customers = (data || []).map((row: any) => ({
        id: row.id,
        customer_code: row.customer_code,
        name: row.name,
        phone: row.phone,
        address: row.address,
        customer_type: row.customer_type,
        notes: row.notes,
        created_at: row.created_at,
        custom_overdue_days: row.custom_overdue_days,
        balance: Number(row.balance) || 0,
        advance_balance: Number(row.advance_balance) || 0,
        oldest_unpaid_date: row.oldest_unpaid_date || null,
      }))
      total = totalCount
    }

    if (customers.length === 0) {
      return new Response(
        JSON.stringify({ customers: [], total: 0, page, pageSize, view, filter: filterParam }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ customers, total, page, pageSize, view, filter: filterParam }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})