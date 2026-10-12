import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { signRows, signUrl } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const url = new URL(req.url)
    const entryId = url.searchParams.get('id')

    if (!entryId) {
      throw new HttpError(400, 'Entry ID required')
    }

    // Get the entry (with the staff member who created it, so the detail
    // dialog can show a name instead of a bare id)
    const { data: entry, error: entryError } = await supabase
      .from('credit_entries')
      .select('*, staff:staff!credit_entries_created_by_fkey(name, role)')
      .eq('id', entryId)
      .single()

    if (entryError) {
      if (entryError.code === 'PGRST116') throw new HttpError(404, 'Entry not found')
      throw entryError
    }

    // Get customer name
    const { data: customer } = await supabase
      .from('customers')
      .select('name, customer_code, phone')
      .eq('id', entry.customer_id)
      .single()

    // Get line items for detailed-mode entries, in the order they were entered
    let items: any[] = []
    if (entry.entry_mode === 'detailed') {
      const { data: entryItems, error: itemsError } = await supabase
        .from('credit_entry_items')
        .select('*')
        .eq('credit_entry_id', entryId)
        .order('sort_order', { ascending: true })

      if (!itemsError) {
        items = entryItems || []
      }
    }

    // Attachments, so an entry opened from the dashboard shows the same
    // photos and bills as one opened from the customer page
    const { data: entryAttachments } = await supabase
      .from('credit_entry_attachments')
      .select('*')
      .eq('credit_entry_id', entryId)
      .order('uploaded_at', { ascending: true })

    // Buckets are private: send signed links, not the stored identifiers
    const attachments = await signRows(supabase, entryAttachments || [], 'file_url')
    const photoUrl = await signUrl(supabase, entry.photo_url)

    return json(req, {
      entry: {
        ...entry,
        photo_url: photoUrl,
        items,
        attachments,
        staff_name: entry.staff?.name || null,
        staff_role: entry.staff?.role || null,
        customer_name: customer?.name || 'Unknown',
        customer_code: customer?.customer_code || '',
        customer_phone: customer?.phone || '',
      },
    })
  } catch (error) {
    return errorResponse(req, error, 'get-entry')
  }
})
