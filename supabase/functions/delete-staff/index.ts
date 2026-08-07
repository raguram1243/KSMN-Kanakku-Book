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

    const url = new URL(req.url)
    const staffId = url.searchParams.get('id')
    const force = url.searchParams.get('force') === 'true'

    if (!staffId) {
      return new Response(
        JSON.stringify({ error: 'Staff ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prevent self-deletion
    if (staffId === token.staff_id) {
      return new Response(
        JSON.stringify({ error: 'You cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if staff member has any records (credit_entries or customers)
    const { count: entryCount } = await supabase
      .from('credit_entries')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', staffId)

    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', staffId)

    const totalRecords = (entryCount || 0) + (customerCount || 0)

    if (totalRecords > 0 && !force) {
      return new Response(
        JSON.stringify({
          error: 'This staff member has associated records',
          warning: true,
          details: {
            creditEntries: entryCount || 0,
            customers: customerCount || 0,
            message: `This staff member created ${entryCount || 0} credit entries and ${customerCount || 0} customers. Deleting them will remove the audit trail of who logged what. Consider deactivating instead. To proceed with deletion anyway, use force=true.`,
          },
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Delete the staff member
    const { error: deleteError } = await supabase
      .from('staff')
      .delete()
      .eq('id', staffId)

    if (deleteError) throw deleteError

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})