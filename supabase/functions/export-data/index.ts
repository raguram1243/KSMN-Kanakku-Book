import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, corsHeaders, errorResponse, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

// Spreadsheet apps run text starting with = + - @ as a formula; prefix it so
// a customer or note typed as "=HYPERLINK(...)" stays plain text in the export.
function safeCell(value: unknown): unknown {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) return `'${value}`
  return value
}

function toCsv(data: any[]): string {
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map(row =>
    Object.values(row).map(val => {
      const cell = safeCell(val)
      return typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell
    }).join(',')
  )
  return [headers, ...rows].join('\n')
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
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    await requireStaff(req, supabase, 'admin')

    const url = new URL(req.url)
    const format = url.searchParams.get('format') || 'xlsx'
    const dataset = url.searchParams.get('dataset') || 'customers'

    let data: any[] = []
    let filename = ''

      if (dataset === 'customers') {
        const { data: customers, error: customersError } = await supabase
          .from('customers')
          .select('customer_code, name, phone, address, customer_type, notes, created_at, staff:staff!customers_created_by_fkey(name)')
          .order('created_at', { ascending: false })
        if (customersError) throw customersError

        data = ((customers || []) as any[]).map(c => ({
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
        const { data: entries, error: entriesError } = await supabase
          .from('credit_entries')
          .select('entry_code, total_amount, paid_amount, balance, status, description, created_at, customer:customers!credit_entries_customer_id_fkey(name, customer_code), staff:staff!credit_entries_created_by_fkey(name)')
          .order('created_at', { ascending: false })
        if (entriesError) throw entriesError

        data = ((entries || []) as any[]).map(e => ({
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
        const { data: payments, error: paymentsError } = await supabase
          .from('payments')
          .select('amount, payment_date, payment_method, receipt_number, notes, created_at, customer:customers!payments_customer_id_fkey(name, customer_code), staff:staff!payments_created_by_fkey(name)')
          .eq('status', 'approved')
          .order('payment_date', { ascending: false })
        if (paymentsError) throw paymentsError

        data = ((payments || []) as any[]).map(p => ({
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
      } else {
        throw new HttpError(400, 'Unknown dataset')
      }

    if (data.length === 0) {
      return new Response(
        'No data available',
        { status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'text/plain' } }
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
            ...corsHeaders(req),
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
          },
        })
      } catch (e) {
        // Fallback to CSV if XLSX generation fails
        const csv = toCsv(data)

        return new Response(csv, {
          headers: {
            ...corsHeaders(req),
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}.csv"`,
          },
        })
      }
    } else {
      // CSV
      const csv = toCsv(data)

      return new Response(csv, {
        headers: {
          ...corsHeaders(req),
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      })
    }
  } catch (error) {
    return errorResponse(req, error, 'export-data')
  }
})
