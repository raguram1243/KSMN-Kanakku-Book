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
      .from('credit_entries')
      .select(
        'id, entry_code, customer_id, created_at, total_amount, paid_amount, balance, status, description, customer:customers!credit_entries_customer_id_fkey(name, customer_code, phone), staff:staff!credit_entries_created_by_fkey(name)'
      )
    if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00`)
    if (toDate) query = query.lte('created_at', `${toDate}T23:59:59.999`)

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error

    return new Response(
      JSON.stringify({ entries: data || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
