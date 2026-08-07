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

    // Today's Date in local time/UTC range
    const today = new Date().toISOString().split('T')[0] // 'YYYY-MM-DD'
    const startOfToday = `${today}T00:00:00.000Z`
    const endOfToday = `${today}T23:59:59.999Z`

    // Query today's credit entries (count and sum of total_amount)
    const { data: entriesToday, error: entriesError } = await supabase
      .from('credit_entries')
      .select('total_amount')
      .gte('created_at', startOfToday)
      .lte('created_at', endOfToday)

    if (entriesError) throw entriesError

    const entriesCount = entriesToday?.length || 0
    const entriesTotalSum = entriesToday?.reduce((sum, e) => sum + Number(e.total_amount), 0) || 0

    let paymentsTodaySum = 0
    let paymentsThisMonthSum = 0

    // Only calculate payment metrics if role is admin
    if (token.role === 'admin') {
      // Payments today
      const { data: payToday, error: payError } = await supabase
        .from('payments')
        .select('amount')
        .eq('payment_date', today)

      if (payError) throw payError
      paymentsTodaySum = payToday?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

      // Payments this calendar month
      const startOfMonth = `${today.substring(0, 7)}-01`
      const { data: payMonth, error: payMonthError } = await supabase
        .from('payments')
        .select('amount')
        .gte('payment_date', startOfMonth)
        .lte('payment_date', today)

      if (payMonthError) throw payMonthError
      paymentsThisMonthSum = payMonth?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    }

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
