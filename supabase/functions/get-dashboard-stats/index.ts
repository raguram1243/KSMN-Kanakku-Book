import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'
import { getOverdueThreshold, daysSince } from '../_shared/overdue.ts'

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

    // Get overdue settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['overdue_days_walkin', 'overdue_days_regular', 'overdue_days_contractor', 'overdue_days_wholesale', 'overdue_days_corporate'])

    const settingsMap: Record<string, number> = {}
    settings?.forEach(s => {
      settingsMap[s.key] = parseInt(s.value)
    })


    // Total outstanding
    const { data: entries, error: entriesError } = await supabase
      .from('credit_entries')
      .select('balance, status, created_at, customer_id')

    if (entriesError) throw entriesError

    const totalOutstanding = entries?.reduce((sum, e) => sum + Number(e.balance), 0) || 0

    // Total customers
    const { count: totalCustomers, error: customersError } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })

    if (customersError) throw customersError

    // Overdue count
    const { data: overdueEntries, error: overdueError } = await supabase
      .from('credit_entries')
      .select('id, customer_id, created_at, status')
      .neq('status', 'paid')

    if (overdueError) throw overdueError

    const { data: customers } = await supabase
      .from('customers')
      .select('id, customer_type, custom_overdue_days')

    const customerMap = new Map(customers?.map(c => [c.id, c]) || [])

    const overdueCount = overdueEntries?.filter(e => {
      const customer = customerMap.get(e.customer_id)
      if (!customer) return false
      const threshold = getOverdueThreshold(customer.customer_type, customer.custom_overdue_days, settingsMap)
      return daysSince(e.created_at) > threshold
    }).length || 0

    // Top debtors
    const { data: allEntries } = await supabase
      .from('credit_entries')
      .select('customer_id, balance, status')
      .neq('status', 'paid')

    const debtorMap = new Map<string, { id: string; balance: number; name: string; code: string }>()
    for (const entry of allEntries || []) {
      const { data: customer } = await supabase
        .from('customers')
        .select('name, customer_code')
        .eq('id', entry.customer_id)
        .single()

      if (!customer) continue

      const existing = debtorMap.get(entry.customer_id) || { id: entry.customer_id, balance: 0, name: customer.name, code: customer.customer_code }
      existing.balance += Number(entry.balance)
      debtorMap.set(entry.customer_id, existing)
    }

    const topDebtors = Array.from(debtorMap.values())
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10)

    // Recent entries with customer names (using JOIN to avoid N+1)
    const { data: recentEntries } = await supabase
      .from('credit_entries')
      .select(`
        id,
        entry_code,
        customer_id,
        total_amount,
        status,
        created_at,
        customer:customers!credit_entries_customer_id_fkey(name)
      `)
      .order('created_at', { ascending: false })
      .limit(4)

    const recentEntriesWithNames = (recentEntries || []).map((entry: any) => ({
      id: entry.id,
      entry_code: entry.entry_code,
      customer_id: entry.customer_id,
      customer_name: entry.customer?.name || 'Unknown',
      total_amount: entry.total_amount,
      status: entry.status,
      created_at: entry.created_at,
    }))

    // Recent payments with customer names
    const { data: recentPayments } = await supabase
      .from('payments')
      .select(`
        id,
        customer_id,
        amount,
        payment_method,
        payment_date,
        customer:customers!payments_customer_id_fkey(name)
      `)
      .order('payment_date', { ascending: false })
      .limit(4)

    const recentPaymentsWithNames = (recentPayments || []).map((payment: any) => ({
      id: payment.id,
      customer_id: payment.customer_id,
      customer_name: payment.customer?.name || 'Unknown',
      amount: payment.amount,
      payment_method: payment.payment_method,
      payment_date: payment.payment_date,
    }))

    // Last 30 days analytics
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

    // Get entries from last 30 days
    const { data: last30Entries } = await supabase
      .from('credit_entries')
      .select('total_amount, created_at')
      .gte('created_at', thirtyDaysAgoStr)

    // Get payments from last 30 days
    const { data: last30Payments } = await supabase
      .from('payments')
      .select('amount, payment_date')
      .gte('payment_date', thirtyDaysAgoStr)

    // Calculate daily aggregates
    const dailyMap = new Map<string, { credit_given: number; collection: number }>()

    // Initialize all days in last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      dailyMap.set(dateStr, { credit_given: 0, collection: 0 })
    }

    // Aggregate entries by date
    (last30Entries || []).forEach(entry => {
      const dateStr = entry.created_at.split('T')[0]
      if (dailyMap.has(dateStr)) {
        dailyMap.get(dateStr)!.credit_given += Number(entry.total_amount)
      }
    });

    // Aggregate payments by date
    (last30Payments || []).forEach(payment => {
      const dateStr = payment.payment_date.split('T')[0]
      if (dailyMap.has(dateStr)) {
        dailyMap.get(dateStr)!.collection += Number(payment.amount)
      }
    })

    const last30Days = Array.from(dailyMap.entries()).map(([date, values]) => ({
      date,
      ...values,
    }))

    // Calculate totals for last 30 days
    const totalCreditLast30 = last30Days.reduce((sum, day) => sum + day.credit_given, 0)
    const totalCollectionLast30 = last30Days.reduce((sum, day) => sum + day.collection, 0)

    // Alerts: Large outstanding customers (> ₹50,000)
    const OUTSTANDING_THRESHOLD = 50000
    const { data: allCustomers } = await supabase
      .from('customers')
      .select('id, name, customer_code, customer_type, custom_overdue_days')

    interface CustomerInfo {
      id: string
      name: string
      customer_code: string
      customer_type: string
      custom_overdue_days: number | null
    }
    const customerInfoMap = new Map<string, CustomerInfo>((allCustomers || []).map((c: any) => [c.id, c]))

    const outstandingMap = new Map<string, { name: string; code: string; balance: number }>()
    for (const entry of entries || []) {
      const customer = customerInfoMap.get(entry.customer_id)
      if (!customer) continue

      const existing = outstandingMap.get(entry.customer_id) || { 
        name: customer.name, 
        code: customer.customer_code, 
        balance: 0 
      }
      existing.balance += Number(entry.balance)
      outstandingMap.set(entry.customer_id, existing)
    }

    // Aging report: bucket outstanding by age with per-customer breakdown
    const bucket0to30Customers = new Map<string, { customer_id: string; name: string; code: string; amount: number }>()
    const bucket31to60Customers = new Map<string, { customer_id: string; name: string; code: string; amount: number }>()
    const bucket60plusCustomers = new Map<string, { customer_id: string; name: string; code: string; amount: number }>()
    const aging: {
      days0to30: { total: number; customers: Array<{ customer_id: string; name: string; code: string; amount: number }> };
      days31to60: { total: number; customers: Array<{ customer_id: string; name: string; code: string; amount: number }> };
      days60plus: { total: number; customers: Array<{ customer_id: string; name: string; code: string; amount: number }> };
    } = {
      days0to30: { total: 0, customers: [] },
      days31to60: { total: 0, customers: [] },
      days60plus: { total: 0, customers: [] },
    }

    for (const entry of entries || []) {
      if (entry.status === 'paid') continue
      const days = daysSince(entry.created_at)
      if (isNaN(days)) {
        console.warn('Skipping entry with invalid created_at:', entry.id)
        continue
      }
      const balance = Number(entry.balance)
      const customer = customerInfoMap.get(entry.customer_id)
      const customerName = customer?.name || 'Unknown'
      const customerCode = customer?.customer_code || ''

      if (days <= 30) {
        aging.days0to30.total += balance
        const existing = bucket0to30Customers.get(entry.customer_id) || { customer_id: entry.customer_id, name: customerName, code: customerCode, amount: 0 }
        existing.amount += balance
        bucket0to30Customers.set(entry.customer_id, existing)
      } else if (days <= 60) {
        aging.days31to60.total += balance
        const existing = bucket31to60Customers.get(entry.customer_id) || { customer_id: entry.customer_id, name: customerName, code: customerCode, amount: 0 }
        existing.amount += balance
        bucket31to60Customers.set(entry.customer_id, existing)
      } else {
        aging.days60plus.total += balance
        const existing = bucket60plusCustomers.get(entry.customer_id) || { customer_id: entry.customer_id, name: customerName, code: customerCode, amount: 0 }
        existing.amount += balance
        bucket60plusCustomers.set(entry.customer_id, existing)
      }
    }

    aging.days0to30.customers = Array.from(bucket0to30Customers.values()).sort((a, b) => b.amount - a.amount)
    aging.days31to60.customers = Array.from(bucket31to60Customers.values()).sort((a, b) => b.amount - a.amount)
    aging.days60plus.customers = Array.from(bucket60plusCustomers.values()).sort((a, b) => b.amount - a.amount)

    const largeOutstanding = Array.from(outstandingMap.values())
      .filter(c => c.balance > OUTSTANDING_THRESHOLD)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10)

    // Alerts: Overdue entries with details
    const { data: overdueEntriesDetailed } = await supabase
      .from('credit_entries')
      .select(`
        id,
        entry_code,
        customer_id,
        balance,
        status,
        created_at,
        customer:customers!credit_entries_customer_id_fkey(name, phone)
      `)
      .neq('status', 'paid')

    const overdueEntriesList = (overdueEntriesDetailed || [])
      .filter((e: any) => {
        const customer = customerInfoMap.get(e.customer_id)
        if (!customer) return false
        const threshold = getOverdueThreshold(customer.customer_type, customer.custom_overdue_days ?? null, settingsMap)
        return daysSince(e.created_at) > threshold
      })
      .map((e: any) => ({
        id: e.id,
        entry_code: e.entry_code,
        customer_id: e.customer_id,
        customer_name: e.customer?.name || 'Unknown',
        customer_phone: e.customer?.phone || null,
        balance: e.balance,
        days_overdue: daysSince(e.created_at),
        status: e.status,
        created_at: e.created_at,
      }))
      .sort((a: any, b: any) => b.days_overdue - a.days_overdue)
      .slice(0, 10)

    return new Response(
      JSON.stringify({
        totalOutstanding,
        totalCustomers: totalCustomers || 0,
        overdueCount,
        topDebtors,
        recentEntries: recentEntriesWithNames,
        recentPayments: recentPaymentsWithNames,
        last30Days,
        totalCreditLast30,
        totalCollectionLast30,
        alerts: {
          largeOutstanding,
          overdueEntries: overdueEntriesList,
        },
        aging,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})