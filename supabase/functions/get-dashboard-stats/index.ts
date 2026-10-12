import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    await requireStaff(req, supabase, 'admin')

    const { data, error: rpcError } = await supabase.rpc('get_dashboard_stats_v2')

    if (rpcError) throw rpcError

    const stats = (data as any) || {}

    return json(req, {
        totalOutstanding: Number(stats.totalOutstanding) || 0,
        // Still sent: the dashboard's headline count reads totalCustomers, and
        // dropping it here rendered that card blank.
        totalCustomers: Number(stats.totalCustomers) || 0,
        // customerSplit comes from migration 022_customer_balance_split.sql.
        // When that migration has not been applied yet the RPC omits the key,
        // so fall back to the plain customer count with a 0/0 split rather
        // than emitting NaN into the UI.
        customerSplit: {
          total: Number((stats.customerSplit || {}).total) || Number(stats.totalCustomers) || 0,
          withDues: Number((stats.customerSplit || {}).withDues) || 0,
          withoutDues: Number((stats.customerSplit || {}).withoutDues) || 0,
        },
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
    })
  } catch (error) {
    return errorResponse(req, error, 'get-dashboard-stats')
  }
})
