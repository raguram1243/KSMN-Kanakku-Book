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

    // New pagination/filter params
    const pageParam = url.searchParams.get('page')
    const pageSizeParam = url.searchParams.get('pageSize')
    const filterParam = url.searchParams.get('filter') || 'all'
    const page = pageParam ? parseInt(pageParam) : 1
    const pageSize = pageSizeParam ? parseInt(pageSizeParam) : 50
    const usePagination = page > 1 || pageSize !== 200 || filterParam !== 'all' || recent

    let customers: any[] = []
    let total = 0

    if (recent) {
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
    } else {
      // Resolve balance-based filter to a set of customer ids
      let filterIds: string[] | null = null
      if (filterParam === 'outstanding' || filterParam === 'paid') {
        const { data: outRows } = await supabase
          .from('credit_entries')
          .select('customer_id')
          .neq('status', 'paid')
          .gt('balance', 0)

        const outstandingIds = new Set((outRows || []).map((r: any) => r.customer_id))
        if (filterParam === 'outstanding') {
          filterIds = Array.from(outstandingIds)
        } else {
          // paid = all customers minus those with outstanding balance
          const { data: allRows } = await supabase
            .from('customer_view_staff')
            .select('id')
          filterIds = (allRows || []).map((r: any) => r.id).filter((id: string) => !outstandingIds.has(id))
        }
      } else if (filterParam === 'advance') {
        const { data: advRows } = await supabase
          .from('customer_advance_balance')
          .select('customer_id')
          .gt('advance_balance', 0)

        filterIds = Array.from(new Set((advRows || []).map((r: any) => r.customer_id)))
      }

      const paginate = pageParam !== null || pageSizeParam !== null

      let query = supabase
        .from('customer_view_staff')
        .select(
          'id, customer_code, name, phone, address, customer_type, notes, created_at, custom_overdue_days',
          paginate ? { count: 'exact' } : undefined
        )

      if (filterIds !== null) {
        query = query.in(
          'id',
          filterIds.length > 0 ? filterIds : ['00000000-0000-0000-0000-000000000000']
        )
      }

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,phone.ilike.%${search}%,customer_code.ilike.%${search}%`
        )
      }

      query = query.order('created_at', { ascending: false })

      if (paginate) {
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1
        const { data: fetched, count, error } = await query.range(from, to)
        if (error) throw error
        customers = fetched || []
        total = count || 0
      } else {
        const { data: fetched, error } = await query.limit(200)
        if (error) throw error
        customers = fetched || []
        total = customers.length
      }
    }

    if (customers.length === 0) {
      return new Response(
        JSON.stringify({ customers: [], total: 0, page, pageSize, view, filter: filterParam }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const customerIds = customers.map(c => c.id)

    // Aggregate balances via SQL scoped to returned customers (not full-table scan)
    const { data: balanceRows } = await supabase
      .from('credit_entries')
      .select('customer_id, balance')
      .in('customer_id', customerIds)

    const balanceMap = new Map<string, number>()
    for (const row of balanceRows || []) {
      const current = balanceMap.get(row.customer_id) || 0
      balanceMap.set(row.customer_id, current + Number(row.balance))
    }

    // Oldest unpaid date per customer via SQL
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

    // Advance balances for returned customers
    const { data: advanceRows } = await supabase
      .from('customer_advance_balance')
      .select('customer_id, advance_balance')
      .in('customer_id', customerIds)

    const advanceMap = new Map<string, number>()
    for (const row of advanceRows || []) {
      advanceMap.set(row.customer_id, Number(row.advance_balance) || 0)
    }

    // Build response with per-customer balance, advance balance, oldest unpaid date
    const customersWithBalance = customers.map(c => ({
      ...c,
      balance: balanceMap.get(c.id) || 0,
      advance_balance: advanceMap.get(c.id) || 0,
      oldest_unpaid_date: oldestUnpaidMap.get(c.id) || null,
    }))

    return new Response(
      JSON.stringify({ customers: customersWithBalance, total, page, pageSize, view, filter: filterParam }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
