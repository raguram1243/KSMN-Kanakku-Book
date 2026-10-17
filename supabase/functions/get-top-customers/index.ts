import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    await requireStaff(req, supabase, 'admin')

    // Top 5 customers by credit given this month, in Asia/Kolkata (migration 035).
    const { data, error } = await supabase.rpc('get_top_customers_month', { p_limit: 5 })
    if (error) throw error

    const result = (data ?? {}) as Record<string, unknown>
    const customers = Array.isArray(result.customers) ? result.customers : []
    return json(req, {
      monthTotal: Number(result.monthTotal) || 0,
      customers: customers.map((c: Record<string, unknown>) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        credit_given: Number(c.credit_given) || 0,
        bills: Number(c.bills) || 0,
      })),
    })
  } catch (error) {
    return errorResponse(req, error, 'get-top-customers')
  }
})
