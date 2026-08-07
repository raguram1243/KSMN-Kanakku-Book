import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'
import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

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
    const customerId = url.searchParams.get('customer_id')
    const fromDate = url.searchParams.get('from_date') || undefined
    const toDate = url.searchParams.get('to_date') || undefined

    if (!customerId) {
      return new Response(
        JSON.stringify({ error: 'Customer ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()

    if (customerError) throw customerError

    // Fetch entries
    let entriesQuery = supabase
      .from('credit_entries')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })

    if (fromDate) {
      entriesQuery = entriesQuery.gte('created_at', fromDate)
    }
    if (toDate) {
      entriesQuery = entriesQuery.lte('created_at', toDate + 'T23:59:59')
    }

    const { data: entries } = await entriesQuery

    // Fetch payments
    let paymentsQuery = supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: true })

    if (fromDate) {
      paymentsQuery = paymentsQuery.gte('payment_date', fromDate)
    }
    if (toDate) {
      paymentsQuery = paymentsQuery.lte('payment_date', toDate)
    }

    const { data: payments } = await paymentsQuery

    // Fetch allocations for all payments
    const paymentIds = (payments || []).map(p => p.id)
    let allocationsMap: Record<string, any[]> = {}
    if (paymentIds.length > 0) {
      const { data: allocations } = await supabase
        .from('payment_allocations')
        .select('*')
        .in('payment_id', paymentIds)

      if (allocations) {
        allocationsMap = allocations.reduce((acc: Record<string, any[]>, a: any) => {
          if (!acc[a.payment_id]) acc[a.payment_id] = []
          acc[a.payment_id].push(a)
          return acc
        }, {})
      }
    }

    // Build ledger transactions (combine entries + payments, sort by date, compute running balance)
    const transactions: any[] = []
    let runningBalance = 0

    const entryTransactions = (entries || []).map((e: any) => ({
      date: e.created_at,
      type: 'entry' as const,
      reference: e.entry_code,
      description: e.description || e.entry_code,
      debit: Number(e.total_amount),
      credit: 0,
      status: e.status,
    }))

    const paymentTransactions = (payments || []).map((p: any) => ({
      date: p.payment_date,
      type: 'payment' as const,
      reference: p.receipt_number || 'Payment',
      description: p.payment_method ? p.payment_method.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : 'Payment',
      debit: 0,
      credit: Number(p.amount),
      status: undefined,
    }))

    const allTransactions = [...entryTransactions, ...paymentTransactions]
    allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    for (const t of allTransactions) {
      runningBalance += t.debit - t.credit
      transactions.push({
        ...t,
        balance: runningBalance,
      })
    }

    // Generate PDF
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4
    const font = await pdfDoc.embedFont('Helvetica')
    const boldFont = await pdfDoc.embedFont('Helvetica-Bold')

    // pdf-lib's built-in fonts use WinAnsi encoding which doesn't support ₹
    const pdfCurrency = (amount: number) => `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

    // Header
    page.drawText('KSMN Kanakku-Book', { x: 50, y: 800, size: 20, font: boldFont })
    page.drawText('Customer Statement', { x: 50, y: 775, size: 14, font: boldFont })

    // Customer info
    page.drawText(`Customer: ${customer.name}`, { x: 50, y: 740, size: 10, font })
    page.drawText(`Code: ${customer.customer_code}`, { x: 50, y: 725, size: 10, font })
    page.drawText(`Phone: ${customer.phone}`, { x: 50, y: 710, size: 10, font })
    if (customer.address) {
      page.drawText(`Address: ${customer.address}`, { x: 50, y: 695, size: 10, font })
    }

    // Statement period
    const periodText = fromDate && toDate ? `Period: ${fromDate} to ${toDate}` : 'Period: All history'
    page.drawText(periodText, { x: 50, y: 670, size: 10, font })
    page.drawText(`Generated: ${new Date().toLocaleDateString('en-IN')}`, { x: 50, y: 655, size: 10, font })

    // Table header
    const tableTop = 620
    const rowHeight = 20
    const colWidths = [80, 60, 150, 70, 70, 80]
    const colX = [50, 130, 190, 340, 410, 480]

    page.drawText('Date', { x: colX[0], y: tableTop, size: 9, font: boldFont })
    page.drawText('Reference', { x: colX[1], y: tableTop, size: 9, font: boldFont })
    page.drawText('Description', { x: colX[2], y: tableTop, size: 9, font: boldFont })
    page.drawText('Debit', { x: colX[3], y: tableTop, size: 9, font: boldFont })
    page.drawText('Credit', { x: colX[4], y: tableTop, size: 9, font: boldFont })
    page.drawText('Balance', { x: colX[5], y: tableTop, size: 9, font: boldFont })

    // Table rows
    let y = tableTop - rowHeight
    for (const t of transactions) {
      if (y < 50) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([595.28, 841.89])
        y = 800
        page.drawText('KSMN Kanakku-Book - Customer Statement (continued)', { x: 50, y, size: 10, font: boldFont })
        y -= rowHeight
      }

      const dateStr = new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      page.drawText(dateStr, { x: colX[0], y, size: 9, font })
      page.drawText(t.reference.substring(0, 15), { x: colX[1], y, size: 9, font })
      page.drawText(t.description.substring(0, 25), { x: colX[2], y, size: 9, font })
      page.drawText(t.debit > 0 ? pdfCurrency(t.debit) : '-', { x: colX[3], y, size: 9, font })
      page.drawText(t.credit > 0 ? pdfCurrency(t.credit) : '-', { x: colX[4], y, size: 9, font })
      page.drawText(pdfCurrency(t.balance), { x: colX[5], y, size: 9, font: boldFont })
      y -= rowHeight
    }

    // Closing balance
    y -= 10
    page.drawText('Closing Balance', { x: colX[2], y, size: 10, font: boldFont })
    page.drawText(pdfCurrency(runningBalance), { x: colX[5], y, size: 10, font: boldFont })

    // Footer
    page.drawText('Thank you for your business!', { x: 50, y: 50, size: 10, font })

    const pdfBytes = await pdfDoc.save()

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${customer.customer_code}_statement.pdf"`,
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})