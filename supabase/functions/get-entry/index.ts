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
    const entryId = url.searchParams.get('id')

    if (!entryId) {
      return new Response(
        JSON.stringify({ error: 'Entry ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the entry
    const { data: entry, error: entryError } = await supabase
      .from('credit_entries')
      .select('*')
      .eq('id', entryId)
      .single()

    if (entryError) throw entryError

    // Get customer name
    const { data: customer } = await supabase
      .from('customers')
      .select('name, customer_code, phone')
      .eq('id', entry.customer_id)
      .single()

    // Get line items for detailed-mode entries
    let items: any[] = []
    if (entry.entry_mode === 'detailed') {
      const { data: entryItems, error: itemsError } = await supabase
        .from('credit_entry_items')
        .select('*')
        .eq('credit_entry_id', entryId)

      if (!itemsError) {
        items = entryItems || []
      }
    }

    return new Response(
      JSON.stringify({
        entry: {
          ...entry,
          items,
          customer_name: customer?.name || 'Unknown',
          customer_code: customer?.customer_code || '',
          customer_phone: customer?.phone || '',
        },
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