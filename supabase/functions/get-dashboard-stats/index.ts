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

    if (token.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error: rpcError } = await supabase.rpc('get_dashboard_stats_v2')

    if (rpcError) throw rpcError

    const stats = (data as any) || {}

    return new Response(
      JSON.stringify({
        totalOutstanding: Number(stats.totalOutstanding) || 0,
        totalCustomers: Number(stats.totalCustomers) || 0,
        overdueCount: Number(stats.overdueCount) || 0,
        topDebtors: Array.isArray(stats.topDebtors) ? stats.topDebtors : [],
        recentEntries: Array.isArray(stats.recentEntries) ? stats.recentEntries : [],
        recentPayments: Array.isArray(stats.recentPayments) ? stats.recentPayments : [],
        last30Days: Array.isArray(stats.last30Days) ? stats.last30Days : [],
        totalCreditLast30: Number(stats.totalCreditLast30) || 0,
        totalCollectionLast30: Number(stats.totalCollectionLast30) || 0,
        alerts: stats.alerts || { largeOutstanding: [], overdueEntries: [] },
        aging: stats.aging || {
          days0to7: { total: 0, customers: [] },
          days8to14: { total: 0, customers: [] },
          days15to21: { total: 0, customers: [] },
          days22to30: { total: 0, customers: [] },
          days31to40: { total: 0, customers: [] },
          days41plus: { total: 0, customers: [] },
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
