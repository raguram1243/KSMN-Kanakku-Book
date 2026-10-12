import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    // Optional From/To date range (inclusive). When omitted the RPC
    // falls back to all-time totals, preserving the default behaviour.
    const url = new URL(req.url)
    const fromDate = url.searchParams.get('from_date')
    const toDate = url.searchParams.get('to_date')

    const isValidDate = (v: string | null) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v)
    if (!isValidDate(fromDate) || !isValidDate(toDate)) {
      throw new HttpError(400, 'from_date and to_date must be in YYYY-MM-DD format')
    }

    const rpcParams: Record<string, string> = {}
    if (fromDate) rpcParams.p_from_date = fromDate
    if (toDate) rpcParams.p_to_date = toDate

    const { data, error: rpcError } = await supabase.rpc('get_ledger_report', rpcParams)

    if (rpcError) throw rpcError

    const customers = Array.isArray(data) ? data : []

    return json(req, { customers })
  } catch (error) {
    return errorResponse(req, error, 'get-ledger-report')
  }
})
