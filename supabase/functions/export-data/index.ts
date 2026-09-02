import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

// Human-readable timestamp for exports, e.g. "10-08-2026 14:32"
function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function prettifyEnum(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
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
          .select('customer_code, name, phone, address, customer_type, notes, created_at, staff:staff!customers_created_by_fkey(name)')
          .order('created_at', { ascending: false })

        data = (customers || []).map(c => ({
          'Customer Code': c.customer_code,
          'Name': c.name,
          'Phone': c.phone,
          'Address': c.address ?? '',
          'Type': prettifyEnum(c.customer_type),
          'Notes': c.notes ?? '',
          'Created At': formatExportDate(c.created_at),
          'Created By': c.staff?.name ?? '',
        }))
        filename = 'customers'
      } else if (dataset === 'entries') {
        const { data: entries } = await supabase
          .from('credit_entries')
          .select('entry_code, total_amount, paid_amount, balance, status, description, created_at, customer:customers!credit_entries_customer_id_fkey(name, customer_code), staff:staff!credit_entries_created_by_fkey(name)')
          .order('created_at', { ascending: false })

        data = (entries || []).map(e => ({
          'Entry Code': e.entry_code,
          'Customer Name': e.customer?.name ?? '',
          'Customer Code': e.customer?.customer_code ?? '',
          'Total Amount': Number(e.total_amount) || 0,
          'Paid Amount': Number(e.paid_amount) || 0,
          'Balance': Number(e.balance) || 0,
          'Status': prettifyEnum(e.status),
          'Description': e.description ?? '',
          'Created At': formatExportDate(e.created_at),
          'Created By': e.staff?.name ?? '',
        }))
        filename = 'entries'
      } else if (dataset === 'payments') {
        const { data: payments } = await supabase
          .from('payments')
          .select('amount, payment_date, payment_method, receipt_number, notes, created_at, customer:customers!payments_customer_id_fkey(name, customer_code), staff:staff!payments_created_by_fkey(name)')
          .order('payment_date', { ascending: false })

        data = (payments || []).map(p => ({
          'Customer Name': p.customer?.name ?? '',
          'Customer Code': p.customer?.customer_code ?? '',
          'Amount': Number(p.amount) || 0,
          'Payment Date': p.payment_date ?? '',
          'Payment Method': prettifyEnum(p.payment_method),
          'Receipt Number': p.receipt_number ?? '',
          'Notes': p.notes ?? '',
          'Created At': formatExportDate(p.created_at),
          'Created By': p.staff?.name ?? '',
        }))
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