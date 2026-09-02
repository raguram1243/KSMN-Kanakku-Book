import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'

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
    const token = await verifyToken(req.headers.get('Authorization'))
    if (token.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const fromDate = url.searchParams.get('from_date')
    const toDate = url.searchParams.get('to_date')

    let query = supabase
      .from('payments')
      .select(
        'id, customer_id, payment_date, amount, payment_method, receipt_number, notes, created_at, customer:customers!payments_customer_id_fkey(name, customer_code), staff:staff!payments_created_by_fkey(name)'
      )
    if (fromDate) query = query.gte('payment_date', fromDate)
    if (toDate) query = query.lte('payment_date', toDate)

    const { data, error } = await query.order('payment_date', { ascending: false })

    if (error) throw error

    return new Response(
      JSON.stringify({ payments: data || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
