import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, name, role, active, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    return json(req, { staff: staff || [] })
  } catch (error) {
    return errorResponse(req, error, 'list-staff')
  }
})
