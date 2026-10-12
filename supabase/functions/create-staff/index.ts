import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const body = await readJson(req)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const { pin, role } = body

    if (!name || !pin || !role) {
      throw new HttpError(400, 'Name, PIN, and role are required')
    }

    if (role !== 'admin' && role !== 'staff') {
      throw new HttpError(400, 'Role must be admin or staff')
    }

    if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      throw new HttpError(400, 'PIN must be 4 to 6 digits (numbers only)')
    }

    // Login is by name, so two people with the same name (any capitalisation) would clash
    const { data: existingNames, error: namesError } = await supabase.from('staff').select('name')
    if (namesError) throw namesError
    if ((existingNames || []).some((row: any) => String(row.name).trim().toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'A staff member with this name already exists')
    }

    // Hash PIN using bcrypt (genSaltSync first, then hashSync)
    const salt = bcrypt.genSaltSync(10)
    const pinHash = bcrypt.hashSync(pin, salt)

    const { data: staff, error } = await supabase
      .from('staff')
      .insert({
        name,
        pin_hash: pinHash,
        role,
        active: true,
      })
      .select('id, name, role, active, created_at')
      .single()

    if (error) throw error

    return json(req, { staff })
  } catch (error) {
    return errorResponse(req, error, 'create-staff')
  }
})
