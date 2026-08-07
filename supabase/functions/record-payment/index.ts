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

    const { customer_id, amount, payment_date, notes, allocations, attachments, payment_method, receipt_number } = await req.json()

    if (!customer_id || !amount || !payment_date) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create payment
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        customer_id,
        amount,
        payment_date,
        payment_method: payment_method || null,
        receipt_number: receipt_number || null,
        notes: notes || null,
        created_by: token.staff_id,
      })
      .select()
      .single()

    if (paymentError) throw paymentError

    // Create payment proof attachments
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const attachmentRows = attachments
        .filter((a: any) => a.file_url && a.file_type)
        .map((a: any) => ({
          payment_id: payment.id,
          file_url: a.file_url,
          file_type: a.file_type,
        }))

      if (attachmentRows.length > 0) {
        const { error: attachError } = await supabase
          .from('payment_attachments')
          .insert(attachmentRows)

        if (attachError) throw attachError
      }
    }

    // Create allocations
    if (allocations && Array.isArray(allocations)) {
      const allocationsToInsert = allocations
        .filter((a: any) => a.credit_entry_id && a.allocated_amount > 0)
        .map((a: any) => ({
          payment_id: payment.id,
          credit_entry_id: a.credit_entry_id,
          allocated_amount: a.allocated_amount,
        }))

      if (allocationsToInsert.length > 0) {
        const { error: allocError } = await supabase
          .from('payment_allocations')
          .insert(allocationsToInsert)

        if (allocError) throw allocError
      }
    }

    return new Response(
      JSON.stringify({ payment }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})