import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Reject a pending payment. It stays on record as `rejected` (with the
// optional reason) and never touches any balance.
serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')
    const body = await readJson(req)

    const paymentId = body.payment_id
    if (typeof paymentId !== 'string' || !UUID_RE.test(paymentId)) {
      throw new HttpError(400, 'payment_id must be a payment id')
    }

    let note: string | null = null
    if (body.note !== undefined && body.note !== null && body.note !== '') {
      if (typeof body.note !== 'string') throw new HttpError(400, 'note must be text')
      note = body.note.trim().slice(0, 1000) || null
    }

    const { data, error } = await supabase.rpc('reject_payment', {
      p_payment_id: paymentId,
      p_reviewer: caller.staff_id,
      p_note: note,
    })
    if (error) throw error

    return json(req, data)
  } catch (error) {
    return errorResponse(req, error, 'reject-payment')
  }
})
