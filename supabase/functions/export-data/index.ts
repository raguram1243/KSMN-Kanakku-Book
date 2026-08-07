import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

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

    const url = new URL(req.url)
    const format = url.searchParams.get('format') || 'xlsx'
    const dataset = url.searchParams.get('dataset') || 'customers'

    let data: any[] = []
    let filename = ''

    if (dataset === 'customers') {
      const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })

      data = customers || []
      filename = 'customers'
    } else if (dataset === 'entries') {
      const { data: entries } = await supabase
        .from('credit_entries')
        .select('*')
        .order('created_at', { ascending: false })

      data = entries || []
      filename = 'entries'
    } else if (dataset === 'payments') {
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .order('payment_date', { ascending: false })

      data = payments || []
      filename = 'payments'
    }

    if (data.length === 0) {
      return new Response(
        'No data available',
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    if (format === 'xlsx') {
      try {
        const worksheet = XLSX.utils.json_to_sheet(data)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, dataset.charAt(0).toUpperCase() + dataset.slice(1))
        const xlsxBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })

        return new Response(xlsxBytes, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
          },
        })
      } catch (e) {
        // Fallback to CSV if XLSX generation fails
        const headers = Object.keys(data[0]).join(',')
        const rows = data.map(row => 
          Object.values(row).map(val => 
            typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
          ).join(',')
        )
        const csv = [headers, ...rows].join('\n')

        return new Response(csv, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}.csv"`,
          },
        })
      }
    } else {
      // CSV
      const headers = Object.keys(data[0]).join(',')
      const rows = data.map(row => 
        Object.values(row).map(val => 
          typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
        ).join(',')
      )
      const csv = [headers, ...rows].join('\n')

      return new Response(csv, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      })
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})