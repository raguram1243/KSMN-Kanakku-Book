import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { cleanAttachments } from '../_shared/storage.ts'

// Mirrors the CHECK on payments.payment_method (migration 006).
const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'others']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Today's date in India as YYYY-MM-DD; the shop works on IST. */
function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** A real calendar date in YYYY-MM-DD form, not more than a day ahead of today. */
function cleanPaymentDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, 'Payment date must be a date (YYYY-MM-DD)')
  }
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, 'Payment date is not a real date')
  }
  const tomorrow = new Date(`${todayIST()}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  if (d.getTime() > tomorrow.getTime()) {
    throw new HttpError(400, 'Payment date cannot be in the future')
  }
  return value
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters)`)
  return trimmed || null
}

/** [{ credit_entry_id, allocated_amount }] with uuids and positive amounts. */
function cleanAllocations(input: unknown): Array<{ credit_entry_id: string; allocated_amount: number }> {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) throw new HttpError(400, 'allocations must be a list')
  if (input.length > 500) throw new HttpError(400, 'Too many allocations')
  return input.map((a, i) => {
    const row = (a ?? {}) as Record<string, unknown>
    if (typeof row.credit_entry_id !== 'string' || !UUID_RE.test(row.credit_entry_id)) {
      throw new HttpError(400, `allocations[${i}].credit_entry_id must be a bill id`)
    }
    const amount = Number(row.allocated_amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, `allocations[${i}].allocated_amount must be greater than 0`)
    }
    return { credit_entry_id: row.credit_entry_id, allocated_amount: amount }
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase)
    const body = await readJson(req)

    const customerId = body.customer_id
    if (typeof customerId !== 'string' || !UUID_RE.test(customerId)) {
      throw new HttpError(400, 'Pick a customer')
    }

    // `!amount` once let a negative amount through, because !(-500) is false
    // Stored as NUMERIC(12,2), so 0.004 would be saved as 0.00: round first.
    const amount = Math.round(Number(body.amount) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'Payment amount must be a number greater than 0')
    }
    if (amount > 9_999_999_999.99) throw new HttpError(400, 'Payment amount is too large')

    const paymentDate = cleanPaymentDate(body.payment_date)

    let paymentMethod: string | null = null
    if (body.payment_method !== undefined && body.payment_method !== null && body.payment_method !== '') {
      if (typeof body.payment_method !== 'string' || !PAYMENT_METHODS.includes(body.payment_method)) {
        throw new HttpError(400, 'Unknown payment method')
      }
      paymentMethod = body.payment_method
    }

    let idempotencyKey: string | null = null
    if (body.idempotency_key !== undefined && body.idempotency_key !== null && body.idempotency_key !== '') {
      if (typeof body.idempotency_key !== 'string' || !UUID_RE.test(body.idempotency_key)) {
        throw new HttpError(400, 'idempotency_key must be a uuid')
      }
      idempotencyKey = body.idempotency_key
    }

    const receiptNumber = optionalText(body.receipt_number, 'Receipt number', 100)
    const notes = optionalText(body.notes, 'Notes', 2000)
    const attachments = cleanAttachments(body.attachments)
    const allocations = cleanAllocations(body.allocations)

    // Staff payments wait for an admin: they are saved as pending with no
    // allocations and touch no balance until approved.
    const isAdmin = caller.role === 'admin'
    if (!isAdmin && allocations.length > 0) {
      throw new HttpError(400, 'Staff cannot allocate a payment to bills; the admin does that on approval')
    }

    const { data: result, error } = await supabase.rpc('record_payment', {
      p_customer_id: customerId,
      p_amount: amount,
      p_payment_date: paymentDate,
      p_payment_method: paymentMethod,
      p_receipt_number: receiptNumber,
      p_notes: notes,
      p_created_by: caller.staff_id,
      p_idempotency_key: idempotencyKey,
      p_allocations: isAdmin ? allocations : [],
      p_attachments: attachments,
      p_status: isAdmin ? 'approved' : 'pending',
    })
    if (error) throw error

    if (isAdmin) return json(req, result)

    // Staff only get back an echo of what they typed, never balances.
    const p = (result?.payment ?? {}) as Record<string, unknown>
    return json(req, {
      payment: {
        id: p.id,
        amount: p.amount,
        payment_date: p.payment_date,
        payment_method: p.payment_method ?? null,
        receipt_number: p.receipt_number ?? null,
        status: 'pending',
      },
      duplicate: !!result?.duplicate,
    })
  } catch (error) {
    return errorResponse(req, error, 'record-payment')
  }
})
