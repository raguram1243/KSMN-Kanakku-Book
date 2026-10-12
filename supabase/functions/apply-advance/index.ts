import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Spends a customer's unallocated (approved) payments on their open bills,
// oldest first. The whole walk runs in SQL under a lock on the customer row,
// so two clicks or a payment saved at the same moment cannot double-allocate.
serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

    const supabase = serviceClient()
    await requireStaff(req, supabase, 'admin')
    const body = await readJson(req)

    const customerId = body.customer_id
    if (typeof customerId !== 'string' || !UUID_RE.test(customerId)) {
      throw new HttpError(400, 'Missing required field: customer_id')
    }

    const { data, error } = await supabase.rpc('apply_customer_advance', { p_customer_id: customerId })
    if (error) throw error

    return json(req, data)
  } catch (error) {
    return errorResponse(req, error, 'apply-advance')
  }
})
