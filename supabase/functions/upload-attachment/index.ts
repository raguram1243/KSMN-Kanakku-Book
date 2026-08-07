import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyToken } from '../_shared/jwt-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    await verifyToken(authHeader)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse multipart/form-data
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const attachmentType = formData.get('attachment_type') as string | null
    const relatedId = formData.get('related_id') as string | null

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Server-side size check (original file size before any encoding)
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `File too large — max 4MB per file (got ${(file.size / 1024 / 1024).toFixed(2)}MB)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!attachmentType || !['entry', 'payment'].includes(attachmentType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid attachment_type (must be "entry" or "payment")' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine bucket based on file type and attachment type
    const bucket = file.type.startsWith('image/') ? 'entry-photos' : 'entry-docs'

    // Generate safe filename
    const ext = file.name.split('.').pop() || 'bin'
    const safeName = `${Date.now()}-${crypto.randomUUID()}.${ext}`

    // Upload using service role key (bypasses RLS)
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(safeName, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return new Response(
        JSON.stringify({ error: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(safeName)

    const publicUrl = publicUrlData.publicUrl

    // If related_id is provided, create the attachment record
    if (relatedId) {
      const tableName = attachmentType === 'entry' ? 'credit_entry_attachments' : 'payment_attachments'
      const foreignKey = attachmentType === 'entry' ? 'credit_entry_id' : 'payment_id'
      const fileType = file.type.startsWith('image/') ? 'image' : 'pdf'

      const { error: attachError } = await supabase
        .from(tableName)
        .insert({
          [foreignKey]: relatedId,
          file_url: publicUrl,
          file_type: fileType,
        })

      if (attachError) {
        console.error('Attachment record error:', attachError)
        // Try to clean up uploaded file
        await supabase.storage.from(bucket).remove([safeName])
        return new Response(
          JSON.stringify({ error: `Failed to save attachment record: ${attachError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ url: publicUrl, file_type: file.type.startsWith('image/') ? 'image' : 'pdf' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})