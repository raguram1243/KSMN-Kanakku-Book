import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { id, custom_overdue_days, name, phone, address, notes, customer_type, credit_limit } = await readJson(req)

    if (!id || typeof id !== 'string') {
      throw new HttpError(400, 'Customer ID is required')
    }

    // The client sends null to clear the credit limit (no limit)
    if (credit_limit !== undefined && credit_limit !== null &&
        (typeof credit_limit !== 'number' || !Number.isFinite(credit_limit) || credit_limit < 0)) {
      throw new HttpError(400, 'Credit limit must be a positive number or empty')
    }

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      throw new HttpError(400, 'Name cannot be empty')
    }
    if (phone !== undefined && (typeof phone !== 'string' || !phone.trim())) {
      throw new HttpError(400, 'Phone cannot be empty')
    }
    if (customer_type !== undefined && typeof customer_type !== 'string') {
      throw new HttpError(400, 'Invalid customer type')
    }
    if (custom_overdue_days !== undefined && custom_overdue_days !== null &&
        (typeof custom_overdue_days !== 'number' || !Number.isInteger(custom_overdue_days) || custom_overdue_days < 1 || custom_overdue_days > 3650)) {
      throw new HttpError(400, 'Overdue days must be a whole number or empty')
    }
    if ((address !== undefined && address !== null && typeof address !== 'string') ||
        (notes !== undefined && notes !== null && typeof notes !== 'string')) {
      throw new HttpError(400, 'Address and notes must be text')
    }

    // Whitelist of updatable fields (customer_code is intentionally excluded — read-only)
    const updateData: any = {}
    if (custom_overdue_days !== undefined) updateData.custom_overdue_days = custom_overdue_days
    if (name !== undefined) updateData.name = name.trim()
    if (phone !== undefined) updateData.phone = phone.trim()
    if (address !== undefined) updateData.address = address
    if (notes !== undefined) updateData.notes = notes
    if (customer_type !== undefined) updateData.customer_type = customer_type
    if (credit_limit !== undefined) updateData.credit_limit = credit_limit

    if (Object.keys(updateData).length === 0) {
      throw new HttpError(400, 'No fields to update')
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!customer) throw new HttpError(404, 'Customer not found')

    return json(req, { customer })
  } catch (error) {
    return errorResponse(req, error, 'update-customer')
  }
})
