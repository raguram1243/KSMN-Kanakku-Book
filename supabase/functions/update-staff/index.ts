import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const url = new URL(req.url)
    const staffId = url.searchParams.get('id')

    if (!staffId) {
      throw new HttpError(400, 'Staff ID required')
    }

    const body = await readJson(req)
    const { active, pin, role } = body

    const { data: target, error: targetError } = await supabase
      .from('staff')
      .select('id, name, role, active')
      .eq('id', staffId)
      .maybeSingle()

    if (targetError) throw targetError
    if (!target) throw new HttpError(404, 'Staff member not found')

    const updateData: any = {}
    // Changing the PIN, role or active flag also ends every session issued before now
    let endSessions = false

    if (active !== undefined) {
      if (typeof active !== 'boolean') throw new HttpError(400, 'Active must be true or false')
      if (active !== target.active) endSessions = true
      updateData.active = active
    }

    if (role !== undefined) {
      if (role !== 'admin' && role !== 'staff') throw new HttpError(400, 'Role must be admin or staff')
      if (role !== target.role) endSessions = true
      updateData.role = role
    }

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) throw new HttpError(400, 'Name cannot be empty')
      // Login is by name, so a duplicate (any capitalisation) would break it
      const { data: allStaff, error: namesError } = await supabase.from('staff').select('id, name')
      if (namesError) throw namesError
      if ((allStaff || []).some((row: any) => row.id !== staffId && String(row.name).trim().toLowerCase() === name.toLowerCase())) {
        throw new HttpError(409, 'A staff member with this name already exists')
      }
      updateData.name = name
    }

    if (pin !== undefined && pin !== null) {
      if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
        throw new HttpError(400, 'PIN must be 4 to 6 digits (numbers only)')
      }
      // Hash PIN using bcrypt (genSaltSync first, then hashSync)
      const salt = bcrypt.genSaltSync(10)
      updateData.pin_hash = bcrypt.hashSync(pin, salt)
      endSessions = true
    }

    if (Object.keys(updateData).length === 0) {
      throw new HttpError(400, 'No update fields provided')
    }

    // An admin cannot lock themselves out, and the last active admin must stay
    const losesAdmin = target.role === 'admin' && target.active &&
      (updateData.active === false || updateData.role === 'staff')
    if (losesAdmin) {
      if (staffId === caller.staff_id) {
        throw new HttpError(409, 'You cannot deactivate or demote your own account')
      }
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

    if (endSessions) updateData.sessions_valid_after = new Date().toISOString()

    const { data: staff, error } = await supabase
      .from('staff')
      .update(updateData)
      .eq('id', staffId)
      .select('id, name, role, active, created_at')
      .maybeSingle()

    if (error) throw error
    if (!staff) throw new HttpError(404, 'Staff member not found')

    return json(req, { staff })
  } catch (error) {
    return errorResponse(req, error, 'update-staff')
  }
})
