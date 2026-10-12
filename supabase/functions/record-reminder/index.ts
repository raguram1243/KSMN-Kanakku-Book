import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { customer_id } = await readJson(req)

    if (!customer_id || typeof customer_id !== 'string') {
      throw new HttpError(400, 'Customer ID required')
    }

    // One timestamp per customer, overwritten on every reminder. Admin only:
    // the reminder button lives on the balance screens staff cannot open.
    const { error } = await supabase
      .from('customers')
      .update({ last_reminder_at: new Date().toISOString() })
      .eq('id', customer_id)

    if (error) throw error

    return json(req, { success: true })
  } catch (error) {
    return errorResponse(req, error, 'record-reminder')
  }
})
