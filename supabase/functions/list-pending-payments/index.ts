import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { signRows } from '../_shared/storage.ts'

// Payments staff have recorded that are waiting for an admin to approve or
// reject. `?count_only=true` returns just the number, for the nav badge.
serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Method not allowed')

    const supabase = serviceClient()
    await requireStaff(req, supabase, 'admin')

    const url = new URL(req.url)
    if (url.searchParams.get('count_only') === 'true') {
      const { count, error } = await supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (error) throw error
      return json(req, { count: count ?? 0 })
    }

    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, customer_id, amount, payment_date, payment_method, receipt_number, notes, created_at, ' +
        'customer:customers(name, customer_code, phone), ' +
        'submitter:staff!payments_created_by_fkey(name), ' +
        'attachments:payment_attachments(id, file_url, file_type)'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(500)
    if (error) throw error

    // deno-lint-ignore no-explicit-any
    const rows = (data ?? []) as any[]
    // deno-lint-ignore no-explicit-any
    const attachments: any[] = rows.flatMap((r) => (Array.isArray(r.attachments) ? r.attachments : []))
    await signRows(supabase, attachments, 'file_url')

    const payments = rows.map((r) => ({
      id: r.id,
      customer_id: r.customer_id,
      customer_name: r.customer?.name ?? null,
      customer_code: r.customer?.customer_code ?? null,
      customer_phone: r.customer?.phone ?? null,
      amount: Number(r.amount),
      payment_date: r.payment_date,
      payment_method: r.payment_method,
      receipt_number: r.receipt_number,
      notes: r.notes,
      created_at: r.created_at,
      submitted_by_name: r.submitter?.name ?? null,
      // A link that could not be signed is dropped rather than sent as null.
      attachments: (Array.isArray(r.attachments) ? r.attachments : [])
        .filter((a: { file_url: string | null }) => !!a.file_url)
        .map((a: { id: string; file_url: string; file_type: string }) => ({
          id: a.id,
          file_url: a.file_url,
          file_type: a.file_type,
        })),
    }))

    return json(req, { payments, count: payments.length })
  } catch (error) {
    return errorResponse(req, error, 'list-pending-payments')
  }
})
