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
      .from('credit_entries')
      .select(
        'id, entry_code, customer_id, created_at, total_amount, paid_amount, balance, status, description, customer:customers!credit_entries_customer_id_fkey(name, customer_code, phone), staff:staff!credit_entries_created_by_fkey(name)'
      )
    if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00`)
    if (toDate) query = query.lte('created_at', `${toDate}T23:59:59.999`)

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error

    return json(req, { entries: data || [] })
  } catch (error) {
    return errorResponse(req, error, 'get-entries-report')
  }
})
