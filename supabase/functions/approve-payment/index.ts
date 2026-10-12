import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Approve a pending (staff-recorded) payment. With no allocations the database
// splits it over the customer's open bills oldest first; otherwise the admin's
// split is validated there (each line no more than the bill balance, total no
// more than the payment). Whatever is left over becomes advance.
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

    let allocations: Array<{ credit_entry_id: string; allocated_amount: number }> | null = null
    if (body.allocations !== undefined && body.allocations !== null) {
      if (!Array.isArray(body.allocations)) throw new HttpError(400, 'allocations must be a list')
      if (body.allocations.length > 500) throw new HttpError(400, 'Too many allocations')
      const seen = new Set<string>()
      allocations = body.allocations.map((a: unknown, i: number) => {
        const row = (a ?? {}) as Record<string, unknown>
        if (typeof row.credit_entry_id !== 'string' || !UUID_RE.test(row.credit_entry_id)) {
          throw new HttpError(400, `allocations[${i}].credit_entry_id must be a bill id`)
        }
        if (seen.has(row.credit_entry_id)) throw new HttpError(400, 'The same bill appears twice')
        seen.add(row.credit_entry_id)
        const amount = Number(row.allocated_amount)
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new HttpError(400, `allocations[${i}].allocated_amount must be greater than 0`)
        }
        return { credit_entry_id: row.credit_entry_id, allocated_amount: Math.round(amount * 100) / 100 }
      })
    }

    let note: string | null = null
    if (body.note !== undefined && body.note !== null && body.note !== '') {
      if (typeof body.note !== 'string') throw new HttpError(400, 'note must be text')
      note = body.note.trim().slice(0, 1000) || null
    }

    const { data, error } = await supabase.rpc('approve_payment', {
      p_payment_id: paymentId,
      p_reviewer: caller.staff_id,
      p_allocations: allocations,
      p_note: note,
    })
    if (error) throw error

    return json(req, data)
  } catch (error) {
    return errorResponse(req, error, 'approve-payment')
  }
})
