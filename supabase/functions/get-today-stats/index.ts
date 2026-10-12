import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    await requireStaff(req, supabase, 'admin')

    // One query, summed in the database, with "today" and "this month" in
    // Asia/Kolkata (migration 033). Same response shape as before.
    const { data, error } = await supabase.rpc('get_today_stats')
    if (error) throw error

    const stats = (data ?? {}) as Record<string, unknown>
    return json(req, {
      todayEntriesCount: Number(stats.todayEntriesCount) || 0,
      todayEntriesTotalSum: Number(stats.todayEntriesTotalSum) || 0,
      todayPaymentsTotalSum: Number(stats.todayPaymentsTotalSum) || 0,
      monthPaymentsTotalSum: Number(stats.monthPaymentsTotalSum) || 0,
    })
  } catch (error) {
    return errorResponse(req, error, 'get-today-stats')
  }
})
