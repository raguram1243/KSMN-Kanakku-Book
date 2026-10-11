import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt/mod.ts'
import { SignJWT } from 'https://deno.land/x/jose@v5.2.0/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

// Wait before answering, given the consecutive failures BEFORE this attempt:
// 0 and 1 -> no wait, then 250ms doubling, capped at 8s. Never a block.
function loginDelayMs(previousFailures: number): number {
  if (previousFailures <= 1) return 0
  return Math.min(8000, 250 * 2 ** (previousFailures - 2))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, pin } = await req.json()

    if (!name || !pin) {
      return new Response(
        JSON.stringify({ error: 'Name and PIN are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Progressive delay: every attempt for a name (real or not) is counted up
    // front and the wait grows with the consecutive failures before it. Delay
    // only, never a block. Any throttle error is ignored so a throttle outage
    // cannot become a login outage.
    const throttleKey = String(name).trim().toLowerCase().slice(0, 100)
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
      .single()

    if (staffError || !staff) {
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify PIN using bcrypt (sync to avoid Worker usage in Edge Functions)
    const pinMatch = bcrypt.compareSync(pin, staff.pin_hash)
    if (pinMatch) {
      // Correct PIN: clear the failure count (best effort)
      try {
        await supabase.from('login_throttle').delete().eq('name_key', throttleKey)
      } catch (_resetError) {
        // ignore
      }
    }
    if (!pinMatch) {
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

    return new Response(
      JSON.stringify({
        token,
        staff: {
          id: staff.id,
          name: staff.name,
          role: staff.role,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})