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
    let token
    try {
      token = await verifyToken(authHeader)
    } catch (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const today = new Date().toISOString().split('T')[0]
    const startOfToday = `${today}T00:00:00.000Z`
    const endOfToday = `${today}T23:59:59.999Z`

    const [{ data: entriesToday, error: entriesError }, { data: payToday, error: payError }, { data: payMonth, error: payMonthError }] = await Promise.all([
      supabase.from('credit_entries').select('total_amount').gte('created_at', startOfToday).lte('created_at', endOfToday),
      supabase.from('payments').select('amount').eq('payment_date', today),
      supabase.from('payments').select('amount').gte('payment_date', `${today.substring(0, 7)}-01`).lte('payment_date', today),
    ])

    if (entriesError) throw entriesError
    if (payError) throw payError
    if (payMonthError) throw payMonthError

    const entriesCount = entriesToday?.length || 0
    const entriesTotalSum = entriesToday?.reduce((sum, e) => sum + Number(e.total_amount), 0) || 0
    const paymentsTodaySum = payToday?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    const paymentsThisMonthSum = payMonth?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

    return new Response(
      JSON.stringify({
        todayEntriesCount: entriesCount,
        todayEntriesTotalSum: entriesTotalSum,
        todayPaymentsTotalSum: paymentsTodaySum,
        monthPaymentsTotalSum: paymentsThisMonthSum,
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
