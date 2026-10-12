import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const url = new URL(req.url)
    const customerId = url.searchParams.get('id')

    if (!customerId) {
      throw new HttpError(400, 'Customer ID required')
    }

    // Lightweight: single round-trip for balance + advance (no entries/payments/items)
    const [balanceResult, advanceResult] = await Promise.all([
      supabase
        .from('credit_entries')
        .select('balance')
        .eq('customer_id', customerId),
      supabase
        .from('customer_advance_balance')
        .select('advance_balance')
        .eq('customer_id', customerId)
        .single(),
    ])

    if (balanceResult.error) throw balanceResult.error
    if (advanceResult.error && advanceResult.error.code !== 'PGRST116') throw advanceResult.error

    const balance = (balanceResult.data || []).reduce((sum: number, e: any) => sum + Number(e.balance), 0)
    const advanceBalance = advanceResult.data ? Number(advanceResult.data.advance_balance) || 0 : 0

    return json(req, { balance, advance_balance: advanceBalance })
  } catch (error) {
    return errorResponse(req, error, 'get-customer-balance')
  }
})
