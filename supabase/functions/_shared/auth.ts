// ============================================
// Request authentication for edge functions
// ============================================
// Every function except verify-pin starts with:
//
//   const supabase = serviceClient()
//   const caller = await requireStaff(req, supabase)            // any signed-in staff
//   const caller = await requireStaff(req, supabase, 'admin')   // admin only
//
// requireStaff checks the token signature AND the staff row on every call, so:
// - a deactivated or deleted staff member is locked out immediately,
// - a PIN or role change (which bumps staff.sessions_valid_after) logs out
//   every token issued before it,
// - the role used for decisions is the one in the database, not the token.

import { createClient, SupabaseClient } from './supabase.ts'
import { verifyToken } from './jwt-utils.ts'
import { HttpError } from './http.ts'

export interface Caller {
  staff_id: string
  role: 'admin' | 'staff'
  name: string
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function requireStaff(
  req: Request,
  supabase: SupabaseClient,
  needRole?: 'admin',
): Promise<Caller> {
  let token
  try {
    token = await verifyToken(req.headers.get('Authorization'))
  } catch (e) {
    throw new HttpError(401, (e as Error).message || 'Invalid or expired token')
  }

  const { data: staff, error } = await supabase
    .from('staff')
    .select('id, name, role, active, sessions_valid_after')
    .eq('id', token.staff_id)
    .maybeSingle()

  if (error) throw error
  if (!staff || !staff.active) {
    throw new HttpError(401, 'Your account is no longer active. Please contact the admin.')
  }

  // Tokens issued before the last PIN / role / status change are void.
  // iat is in seconds; allow 1s of clock rounding.
  if (staff.sessions_valid_after) {
    const validAfter = Math.floor(new Date(staff.sessions_valid_after).getTime() / 1000)
    if (token.iat + 1 < validAfter) {
      throw new HttpError(401, 'Your session has ended. Please log in again.')
    }
  }

  const role = staff.role === 'admin' ? 'admin' : 'staff'
  if (needRole === 'admin' && role !== 'admin') {
    throw new HttpError(403, 'Admin access required')
  }

  return { staff_id: staff.id, role, name: staff.name }
}
