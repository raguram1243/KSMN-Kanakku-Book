import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { data: payments, error: payError } = await supabase
      .from('payments')
      .select('id, customer_id, amount, payment_date, customer:customers!payments_customer_id_fkey(name)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(4)

    if (payError) throw payError

    const paymentsWithCustomerNames = (payments || []).map((p: any) => ({
      ...p,
      customer_name: p.customer?.name || 'Unknown',
    }))

    return json(req, { payments: paymentsWithCustomerNames })
  } catch (error) {
    return errorResponse(req, error, 'get-recent-payments')
  }
})
