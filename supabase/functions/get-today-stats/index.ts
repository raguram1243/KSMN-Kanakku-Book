import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    // "Today" and "this month" are in Asia/Kolkata (en-CA formats as YYYY-MM-DD)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const startOfToday = new Date(`${today}T00:00:00+05:30`).toISOString()
    const endOfToday = new Date(`${today}T23:59:59.999+05:30`).toISOString()

    const [{ data: entriesToday, error: entriesError }, { data: payToday, error: payError }, { data: payMonth, error: payMonthError }] = await Promise.all([
      supabase.from('credit_entries').select('total_amount').gte('created_at', startOfToday).lte('created_at', endOfToday),
      supabase.from('payments').select('amount').eq('status', 'approved').eq('payment_date', today),
      supabase.from('payments').select('amount').eq('status', 'approved').gte('payment_date', `${today.substring(0, 7)}-01`).lte('payment_date', today),
    ])

    if (entriesError) throw entriesError
    if (payError) throw payError
    if (payMonthError) throw payMonthError

    const entriesCount = entriesToday?.length || 0
    const entriesTotalSum = entriesToday?.reduce((sum, e) => sum + Number(e.total_amount), 0) || 0
    const paymentsTodaySum = payToday?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    const paymentsThisMonthSum = payMonth?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

    return json(req, {
      todayEntriesCount: entriesCount,
      todayEntriesTotalSum: entriesTotalSum,
      todayPaymentsTotalSum: paymentsTodaySum,
      monthPaymentsTotalSum: paymentsThisMonthSum,
    })
  } catch (error) {
    return errorResponse(req, error, 'get-today-stats')
  }
})
