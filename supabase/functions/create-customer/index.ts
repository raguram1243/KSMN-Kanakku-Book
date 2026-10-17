import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase)

    const body = await readJson(req)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const address = typeof body.address === 'string' ? body.address.trim() : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    const customer_type = typeof body.customer_type === 'string' ? body.customer_type : ''

    if (!name || !phone) {
      throw new HttpError(400, 'Name and phone are required')
    }

    // Two accounts for one person split what they owe, so look for the same
    // phone or a very alike name first and let the user confirm (migration 036).
    if (body.confirm_duplicate !== true) {
      const { data: similar, error: similarError } = await supabase
        .rpc('find_similar_customers', { p_name: name, p_phone: phone })
      if (similarError) throw similarError
      if (Array.isArray(similar) && similar.length > 0) {
        return json(req, {
          error: 'A similar customer already exists',
          code: 'possible_duplicate',
          matches: similar,
        }, 409)
      }
    }

    // Generate customer code using the database function
    const { data: customerCode, error: codeError } = await supabase
      .rpc('generate_customer_code')

    if (codeError) throw codeError

    const { data: customer, error: insertError } = await supabase
      .from('customers')
      .insert({
        customer_code: customerCode,
        name,
        phone,
        address: address || null,
        customer_type: customer_type || 'walk-in',
        notes: notes || null,
        created_by: caller.staff_id,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Staff get back only what they typed plus the generated code, never
    // financial fields such as the credit limit.
    if (caller.role !== 'admin') {
      return json(req, {
        customer: {
          id: customer.id,
          customer_code: customer.customer_code,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          customer_type: customer.customer_type,
          notes: customer.notes,
          created_at: customer.created_at,
        },
      })
    }

    return json(req, { customer })
  } catch (error) {
    return errorResponse(req, error, 'create-customer')
  }
})
