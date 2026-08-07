import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt/mod.ts'
import { SignJWT } from 'https://deno.land/x/jose@v5.2.0/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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