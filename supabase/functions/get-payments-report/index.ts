import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const url = new URL(req.url)
    const fromDate = url.searchParams.get('from_date')
    const toDate = url.searchParams.get('to_date')

    let query = supabase
      .from('payments')
      .select(
        'id, customer_id, payment_date, amount, payment_method, receipt_number, notes, created_at, customer:customers!payments_customer_id_fkey(name, customer_code), staff:staff!payments_created_by_fkey(name)'
      )
      .eq('status', 'approved')
    if (fromDate) query = query.gte('payment_date', fromDate)
    if (toDate) query = query.lte('payment_date', toDate)

    const { data, error } = await query.order('payment_date', { ascending: false })

    if (error) throw error

    return json(req, { payments: data || [] })
  } catch (error) {
    return errorResponse(req, error, 'get-payments-report')
  }
})
