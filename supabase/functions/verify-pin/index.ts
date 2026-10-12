import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'
import { SignJWT } from 'https://deno.land/x/jose@v5.2.0/index.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient } from '../_shared/auth.ts'

// Wait before answering, given the consecutive failures BEFORE this attempt:
// 0 and 1 -> no wait, then 250ms doubling, capped at 8s. Never a block.
function loginDelayMs(previousFailures: number): number {
  if (previousFailures <= 1) return 0
  return Math.min(8000, 250 * 2 ** (previousFailures - 2))
}

// Compared against when the name is unknown (or inactive) so the response time
// does not reveal which names exist. Same cost factor as real PIN hashes.
const DUMMY_PIN_HASH = bcrypt.hashSync('000000', bcrypt.genSaltSync(10))

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const body = await readJson(req)
    const { name, pin } = body

    if (!name || !pin) {
      throw new HttpError(400, 'Name and PIN are required')
    }
    if (typeof name !== 'string' || typeof pin !== 'string') {
      throw new HttpError(400, 'Name and PIN must be text')
    }

    // Initialize Supabase client with service role key
    const supabase = serviceClient()

    // Progressive delay: every attempt for a name (real or not) is counted up
    // front and the wait grows with the consecutive failures before it. Delay
    // only, never a block. Any throttle error is ignored so a throttle outage
    // cannot become a login outage.
    const throttleKey = name.trim().toLowerCase().slice(0, 100)
    try {
      const { data: previousFailures, error: throttleError } = await supabase
        .rpc('bump_login_throttle', { p_key: throttleKey })
      if (!throttleError && typeof previousFailures === 'number') {
        const delayMs = loginDelayMs(previousFailures)
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs))
        }
      }
    } catch (_throttleError) {
      // proceed with the login
    }

    // Look up staff by name
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, pin_hash, role, active')
      .eq('name', name)
      .eq('active', true)
      .maybeSingle()

    // A real database failure is not "wrong credentials"
    if (staffError && staffError.code !== 'PGRST116') throw staffError

    // Always run one bcrypt compare, against a dummy hash when there is no
    // such staff member, so timing does not reveal which names exist.
    // (Verify PIN using bcrypt, sync to avoid Worker usage in Edge Functions.)
    const pinMatch = bcrypt.compareSync(pin, staff?.pin_hash ?? DUMMY_PIN_HASH) && !!staff
    if (!staff) {
      throw new HttpError(401, 'Invalid credentials')
    }
    if (pinMatch) {
      // Correct PIN: clear the failure count (best effort)
      try {
        await supabase.from('login_throttle').delete().eq('name_key', throttleKey)
      } catch (_resetError) {
        // ignore
      }
    }
    if (!pinMatch) {
      throw new HttpError(401, 'Invalid credentials')
    }

    // Generate JWT token using custom app secret
    const jwtSecret = Deno.env.get('APP_JWT_SECRET')
    if (!jwtSecret) {
      throw new Error('APP_JWT_SECRET not configured')
    }

    const token = await new SignJWT({
      staff_id: staff.id,
      role: staff.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(new TextEncoder().encode(jwtSecret))

    return json(req, {
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        role: staff.role,
      },
    })
  } catch (error) {
    return errorResponse(req, error, 'verify-pin')
  }
})
