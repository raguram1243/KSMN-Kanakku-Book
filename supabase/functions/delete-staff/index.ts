import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const url = new URL(req.url)
    const staffId = url.searchParams.get('id')
    const force = url.searchParams.get('force') === 'true'

    if (!staffId) {
      throw new HttpError(400, 'Staff ID required')
    }

    // Prevent self-deletion
    if (staffId === caller.staff_id) {
      throw new HttpError(409, 'You cannot delete your own account')
    }

    const { data: target, error: targetError } = await supabase
      .from('staff')
      .select('id, role, active')
      .eq('id', staffId)
      .maybeSingle()

    if (targetError) throw targetError
    if (!target) throw new HttpError(404, 'Staff member not found')

    // The last active admin must stay
    if (target.role === 'admin' && target.active) {
      const { count: otherAdmins, error: adminError } = await supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('active', true)
        .neq('id', staffId)
      if (adminError) throw adminError
      if (!otherAdmins) {
        throw new HttpError(409, 'At least one active admin must remain')
      }
    }

    // Check if staff member has any records (credit entries, customers, payments)
    const { count: entryCount } = await supabase
      .from('credit_entries')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', staffId)

    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', staffId)

    const { count: paymentCount } = await supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', staffId)

    const totalRecords = (entryCount || 0) + (customerCount || 0) + (paymentCount || 0)

    if (totalRecords > 0 && !force) {
      return json(req, {
        error: 'This staff member has associated records',
        warning: true,
        details: {
          creditEntries: entryCount || 0,
          customers: customerCount || 0,
          payments: paymentCount || 0,
          message: `This staff member created ${entryCount || 0} credit entries, ${customerCount || 0} customers and ${paymentCount || 0} payments. Deleting them will remove the audit trail of who logged what. Consider deactivating instead. To proceed with deletion anyway, use force=true.`,
        },
      }, 409)
    }

    // Delete the staff member
    const { error: deleteError } = await supabase
      .from('staff')
      .delete()
      .eq('id', staffId)

    if (deleteError) throw deleteError

    return json(req, { success: true })
  } catch (error) {
    return errorResponse(req, error, 'delete-staff')
  }
})
