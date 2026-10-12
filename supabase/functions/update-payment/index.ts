import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { cleanAttachments } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { payment_id, amount, payment_date, payment_method, receipt_number, notes, allocations, attachments } = await readJson(req)

    if (!payment_id || typeof payment_id !== 'string' || !payment_date || typeof payment_date !== 'string') {
      throw new HttpError(400, 'Missing required fields')
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.round(amount * 100) / 100 <= 0) {
      throw new HttpError(400, 'Amount must be a number greater than zero')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payment_date)) {
      throw new HttpError(400, 'Invalid payment date')
    }

    // Client-supplied file links must be our own uploads (validated before anything is written)
    const newAttachments = cleanAttachments(attachments)

    // Only approved payments can be edited here; pending ones go through the Approvals page
    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from('payments')
      .select('id, customer_id, status')
      .eq('id', payment_id)
      .maybeSingle()

    if (existingPaymentError) throw existingPaymentError
    if (!existingPayment) throw new HttpError(404, 'Payment not found')
    if (existingPayment.status !== 'approved') {
      throw new HttpError(409, 'Approve or reject this payment from the Approvals page first')
    }

    // Fetch existing allocations for this payment
    const { data: existingAllocations, error: existingAllocError } = await supabase
      .from('payment_allocations')
      .select('credit_entry_id, allocated_amount')
      .eq('payment_id', payment_id)

    if (existingAllocError) throw existingAllocError

    // Build a map of old allocations by credit_entry_id
    const oldAllocMap: Record<string, number> = {}
    for (const alloc of existingAllocations || []) {
      oldAllocMap[alloc.credit_entry_id] = Number(alloc.allocated_amount)
    }

    // Validation per allocation
    if (allocations && Array.isArray(allocations)) {
      for (const alloc of allocations) {
        if (!alloc || !alloc.credit_entry_id || !(Number(alloc.allocated_amount) > 0)) continue

        // Fetch the entry's current balance
        const { data: entry, error: entryError } = await supabase
          .from('credit_entries')
          .select('balance, entry_code, customer_id')
          .eq('id', alloc.credit_entry_id)
          .maybeSingle()

        if (entryError) throw entryError
        if (!entry || entry.customer_id !== existingPayment.customer_id) {
          throw new HttpError(400, 'Allocation refers to a bill that does not belong to this customer')
        }

        // Available balance = current balance + old allocation from this payment (since it's being replaced)
        const oldAlloc = oldAllocMap[alloc.credit_entry_id] || 0
        const availableBalance = Number(entry.balance) + oldAlloc

        if (Number(alloc.allocated_amount) > availableBalance) {
          throw new HttpError(400, `Allocation for ${entry.entry_code} (₹${alloc.allocated_amount}) exceeds available balance (₹${availableBalance})`)
        }
      }

      // Validation: allocations may not exceed the payment. Less is fine; the
      // rest stays as advance, as record_payment and approve_payment allow.
      const totalAllocated = allocations
        .filter((a: any) => a && a.credit_entry_id && Number(a.allocated_amount) > 0)
        .reduce((sum: number, a: any) => sum + Number(a.allocated_amount), 0)

      if (totalAllocated > amount + 0.01) {
        throw new HttpError(400, `Total allocated (₹${totalAllocated}) is more than the payment amount (₹${amount})`)
      }
    }

    // Update the payment
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        amount,
        payment_date,
        payment_method: typeof payment_method === 'string' && payment_method ? payment_method : null,
        receipt_number: typeof receipt_number === 'string' && receipt_number ? receipt_number : null,
        notes: typeof notes === 'string' && notes ? notes : null,
      })
      .eq('id', payment_id)

    if (updateError) throw updateError

    // Delete existing allocations
    const { error: deleteAllocError } = await supabase
      .from('payment_allocations')
      .delete()
      .eq('payment_id', payment_id)

    if (deleteAllocError) throw deleteAllocError

    // Insert new allocations
    if (allocations && Array.isArray(allocations)) {
      const allocationsToInsert = allocations
        .filter((a: any) => a && a.credit_entry_id && Number(a.allocated_amount) > 0)
        .map((a: any) => ({
          payment_id,
          credit_entry_id: a.credit_entry_id,
          allocated_amount: Number(a.allocated_amount),
        }))

      if (allocationsToInsert.length > 0) {
        const { error: insertAllocError } = await supabase
          .from('payment_allocations')
          .insert(allocationsToInsert)

        if (insertAllocError) throw insertAllocError
      }
    }

    // Attachments added during the edit are appended to the payment. They have
    // already been uploaded to storage by this point, so dropping them here
    // would leave orphan files and lose the receipt the user just attached.
    if (newAttachments.length > 0) {
      const { error: attachError } = await supabase
        .from('payment_attachments')
        .insert(newAttachments.map((a) => ({ payment_id, ...a })))

      if (attachError) throw attachError
    }

    // Re-fetch the payment
    const { data: payment, error: refetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single()

    if (refetchError) throw refetchError

    return json(req, { payment })
  } catch (error) {
    return errorResponse(req, error, 'update-payment')
  }
})
