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
    const authHeader = req.headers.get('Authorization')
    const token = await verifyToken(authHeader)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const customerId = url.searchParams.get('id')

    if (!customerId) {
      return new Response(
        JSON.stringify({ error: 'Customer ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Lightweight: single round-trip for balance + advance (no entries/payments/items)
    const [balanceResult, advanceResult] = await Promise.all([
      supabase
        .from('credit_entries')
        .select('balance')
        .eq('customer_id', customerId),
      supabase
        .from('customer_advance_balance')
        .select('advance_balance')
        .eq('customer_id', customerId)
        .single(),
    ])

    if (balanceResult.error) throw balanceResult.error
    if (advanceResult.error && advanceResult.error.code !== 'PGRST116') throw advanceResult.error

    const balance = (balanceResult.data || []).reduce((sum: number, e: any) => sum + Number(e.balance), 0)
    const advanceBalance = advanceResult.data ? Number(advanceResult.data.advance_balance) || 0 : 0

    return new Response(
      JSON.stringify({ balance, advance_balance: advanceBalance }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
