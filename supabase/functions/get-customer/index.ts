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

    // Use appropriate view based on role
    const viewName = token.role === 'admin' ? 'customer_view_admin' : 'customer_view_staff'
    const { data: customer, error: customerError } = await supabase
      .from(viewName)
      .select('*')
      .eq('id', customerId)
      .single()

    if (customerError) throw customerError

    // Get entries with staff names via JOIN
    const { data: entries, error: entriesError } = await supabase
      .from('credit_entries')
      .select(`
        *,
        staff:staff!credit_entries_created_by_fkey(name, role)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (entriesError) throw entriesError

    // Fetch overdue settings for is_overdue calculation
    const { data: overdueSettings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['overdue_days_walkin', 'overdue_days_regular', 'overdue_days_contractor', 'overdue_days_wholesale', 'overdue_days_corporate'])

    const settingsMap: Record<string, number> = {}
    overdueSettings?.forEach((s: any) => {
      settingsMap[s.key] = parseInt(s.value)
    })

    // Fetch customer type for overdue calculation
    const { data: customerForOverdue } = await supabase
      .from('customers')
      .select('customer_type, custom_overdue_days')
      .eq('id', customerId)
      .single()

    const customerType = customerForOverdue?.customer_type || 'walk-in'
    const customOverdueDays = customerForOverdue?.custom_overdue_days || null
    const overdueThreshold = getOverdueThreshold(customerType, customOverdueDays, settingsMap)

    // Transform entries to include staff_name, staff_role, and overdue info
    const entriesWithStaff = (entries || []).map((entry: any) => {
      const isOverdue = entry.status !== 'paid' && daysSince(entry.created_at) > overdueThreshold
      return {
        ...entry,
        staff_name: entry.staff?.name || null,
        staff_role: entry.staff?.role || null,
        is_overdue: isOverdue,
        days_overdue: isOverdue ? daysSince(entry.created_at) : 0,
      }
    })

    // Fetch line items for detailed-mode entries
    const detailedEntryIds = (entries || [])
      .filter((e: any) => e.entry_mode === 'detailed')
      .map((e: any) => e.id)

    let itemsMap: Record<string, any[]> = {}
    if (detailedEntryIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('credit_entry_items')
        .select('*')
        .in('credit_entry_id', detailedEntryIds)

      if (itemsError) throw itemsError

      itemsMap = (items || []).reduce((acc: Record<string, any[]>, item: any) => {
        if (!acc[item.credit_entry_id]) acc[item.credit_entry_id] = []
        acc[item.credit_entry_id].push(item)
        return acc
      }, {})
    }

    // Fetch attachments for all entries
    const entryIds = (entries || []).map((e: any) => e.id)
    let attachmentsMap: Record<string, any[]> = {}
    if (entryIds.length > 0) {
      const { data: attachments, error: attachError } = await supabase
        .from('credit_entry_attachments')
        .select('*')
        .in('credit_entry_id', entryIds)
        .order('uploaded_at', { ascending: true })

      if (!attachError) {
        attachmentsMap = (attachments || []).reduce((acc: Record<string, any[]>, a: any) => {
          if (!acc[a.credit_entry_id]) acc[a.credit_entry_id] = []
          acc[a.credit_entry_id].push(a)
          return acc
        }, {})
      }
    }

    // Compute total balance across all entries
    const totalBalance = (entries || []).reduce((sum: number, entry: any) => {
      // Use balance field if available, otherwise compute from total_amount - paid_amount
      const entryBalance = entry.balance !== undefined ? Number(entry.balance) : Number(entry.total_amount || 0) - Number(entry.paid_amount || 0)
      return sum + entryBalance
    }, 0)

    // Fetch advance balance from the view
    let advanceBalance = 0
    const { data: advanceRow } = await supabase
      .from('customer_advance_balance')
      .select('advance_balance')
      .eq('customer_id', customerId)
      .single()

    if (advanceRow) {
      advanceBalance = Number(advanceRow.advance_balance) || 0
    }

    // Attach computed balance and advance balance to customer object
    const customerWithBalance = {
      ...customer,
      balance: totalBalance,
      advance_balance: advanceBalance,
    }

    // Attach items and attachments to entries
    const entriesWithItems = (entries || []).map((entry: any) => ({
      ...entry,
      items: itemsMap[entry.id] || [],
      attachments: attachmentsMap[entry.id] || [],
    }))

    // Fetch payment history for this customer
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select(`
        id,
        customer_id,
        amount,
        payment_date,
        payment_method,
        receipt_number,
        notes,
        created_by,
        created_at,
        staff:staff!payments_created_by_fkey(name)
      `)
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: false })

    if (paymentsError) {
      console.error('Error fetching payments:', paymentsError)
    }

    // Fetch payment allocations for all payments of this customer
    const paymentIds = (payments || []).map((p: any) => p.id)
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

    // Transform payments to include staff_name and allocations
    const paymentsWithStaff = (payments || []).map((payment: any) => ({
      ...payment,
      staff_name: payment.staff?.name || null,
      allocations: allocationsMap[payment.id] || [],
    }))

    return new Response(
      JSON.stringify({ 
        customer: customerWithBalance, 
        entries: entriesWithItems,
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