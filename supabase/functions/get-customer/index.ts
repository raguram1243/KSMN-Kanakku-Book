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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const customerId = url.searchParams.get('id')

    if (!customerId) {
      return new Response(
        JSON.stringify({ error: 'Customer ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const viewName = token.role === 'admin' ? 'customer_view_admin' : 'customer_view_staff'
    const { data: customer, error: customerError } = await supabase
      .from(viewName)
      .select('*')
      .eq('id', customerId)
      .single()

    if (customerError) throw customerError

    const [entriesResult, settingsResult, customerTypeResult, advanceResult, paymentsResult] = await Promise.all([
      supabase.from('credit_entries').select(
        '*, staff:staff!credit_entries_created_by_fkey(name, role)'
      ).eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('app_settings').select('key, value').in('key', ['overdue_days_walkin', 'overdue_days_regular', 'overdue_days_contractor', 'overdue_days_wholesale', 'overdue_days_corporate']),
      supabase.from('customers').select('customer_type, custom_overdue_days').eq('id', customerId).single(),
      supabase.from('customer_advance_balance').select('advance_balance').eq('customer_id', customerId).single(),
      supabase.from('payments').select(
        'id, customer_id, amount, payment_date, payment_method, receipt_number, notes, created_by, created_at, staff:staff!payments_created_by_fkey(name)'
      ).eq('customer_id', customerId).order('payment_date', { ascending: false }),
    ])

    if (entriesResult.error) throw entriesResult.error
    if (settingsResult.error) throw settingsResult.error
    if (customerTypeResult.error && customerTypeResult.error.code !== 'PGRST116') throw customerTypeResult.error
    if (advanceResult.error && advanceResult.error.code !== 'PGRST116') throw advanceResult.error
    if (paymentsResult.error) throw paymentsResult.error

    const settingsMap: Record<string, number> = {}
    settingsResult.data?.forEach((s: any) => {
      settingsMap[s.key] = parseInt(s.value)
    })

    const customerType = customerTypeResult.data?.customer_type || 'walk-in'
    const customOverdueDays = customerTypeResult.data?.custom_overdue_days || null
    const overdueThreshold = getOverdueThreshold(customerType, customOverdueDays, settingsMap)

    const entries = entriesResult.data || []
    const payments = paymentsResult.data || []

    const entriesWithStaff = entries.map((entry: any) => {
      const isOverdue = entry.status !== 'paid' && daysSince(entry.created_at) > overdueThreshold
      return {
        ...entry,
        staff_name: entry.staff?.name || null,
        staff_role: entry.staff?.role || null,
        is_overdue: isOverdue,
        days_overdue: isOverdue ? daysSince(entry.created_at) : 0,
      }
    })

    const entryIds = entries.map((e: any) => e.id)
    let itemsMap: Record<string, any[]> = {}
    let attachmentsMap: Record<string, any[]> = {}

    if (entryIds.length > 0) {
      const [itemsResult, attachmentsResult] = await Promise.all([
        supabase.from('credit_entry_items').select('*').in('credit_entry_id', entryIds),
        supabase.from('credit_entry_attachments').select('*').in('credit_entry_id', entryIds).order('uploaded_at', { ascending: true }),
      ])

      if (!itemsResult.error) {
        itemsMap = (itemsResult.data || []).reduce((acc: Record<string, any[]>, a: any) => {
          if (!acc[a.credit_entry_id]) acc[a.credit_entry_id] = []
          acc[a.credit_entry_id].push(a)
          return acc
        }, {})
      }

      if (!attachmentsResult.error) {
        attachmentsMap = (attachmentsResult.data || []).reduce((acc: Record<string, any[]>, a: any) => {
          if (!acc[a.credit_entry_id]) acc[a.credit_entry_id] = []
          acc[a.credit_entry_id].push(a)
          return acc
        }, {})
      }
    }

    const paymentIds = payments.map((p: any) => p.id)
    let allocationsMap: Record<string, any[]> = {}

    if (paymentIds.length > 0) {
      const { data: allocations, error: allocError } = await supabase
        .from('payment_allocations')
        .select('id, payment_id, credit_entry_id, allocated_amount')
        .in('payment_id', paymentIds)

      if (!allocError) {
        allocationsMap = (allocations || []).reduce((acc: Record<string, any[]>, a: any) => {
          if (!acc[a.payment_id]) acc[a.payment_id] = []
          acc[a.payment_id].push(a)
          return acc
        }, {})
      }
    }

    const paymentsWithStaff = payments.map((payment: any) => ({
      ...payment,
      staff_name: payment.staff?.name || null,
      allocations: allocationsMap[payment.id] || [],
    }))

    const totalBalance = (entries || []).reduce((sum: number, entry: any) => {
      const entryBalance = entry.balance !== undefined ? Number(entry.balance) : Number(entry.total_amount || 0) - Number(entry.paid_amount || 0)
      return sum + entryBalance
    }, 0)

    const advanceBalance = advanceResult.data ? Number(advanceResult.data.advance_balance) || 0 : 0

    const customerWithBalance = {
      ...customer,
      balance: totalBalance,
      advance_balance: advanceBalance,
    }

    return new Response(
      JSON.stringify({ 
        customer: customerWithBalance, 
        entries: entriesWithStaff.map((entry: any) => ({
          ...entry,
          items: itemsMap[entry.id] || [],
          attachments: attachmentsMap[entry.id] || [],
        })),
        payments: paymentsWithStaff 
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
