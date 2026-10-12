import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['overdue_days_walkin', 'overdue_days_regular', 'overdue_days_contractor', 'overdue_days_wholesale', 'overdue_days_corporate'])

    return json(req, { settings: settings || [] })
  } catch (error) {
    return errorResponse(req, error, 'get-settings')
  }
})
