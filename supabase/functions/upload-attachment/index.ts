import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'
import { signUrl } from '../_shared/storage.ts'

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The file extension comes from the MIME type, never from the uploaded filename
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase)

    // Parse multipart/form-data
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      throw new HttpError(400, 'Request must be multipart form data')
    }
    const file = formData.get('file')
    const attachmentType = formData.get('attachment_type')
    const relatedIdRaw = formData.get('related_id')

    if (!file || typeof file === 'string') {
      throw new HttpError(400, 'No file provided')
    }

    // Server-side size check (original file size before any encoding)
    if (file.size > MAX_FILE_SIZE) {
      throw new HttpError(400, `File too large - max 4MB per file (got ${(file.size / 1024 / 1024).toFixed(2)}MB)`)
    }

    if (attachmentType !== 'entry' && attachmentType !== 'payment') {
      throw new HttpError(400, 'Invalid attachment_type (must be "entry" or "payment")')
    }

    // Only photos and PDFs are accepted
    const mimeType = (file.type || '').toLowerCase()
    const isImage = mimeType.startsWith('image/')
    if (!isImage && mimeType !== 'application/pdf') {
      throw new HttpError(400, 'Only images and PDF files can be uploaded')
    }
    const ext = EXTENSION_BY_MIME[mimeType] || (isImage ? 'img' : 'pdf')

    // If related_id is given, the entry/payment must exist, and staff may only
    // attach to something they created themselves.
    const relatedId = typeof relatedIdRaw === 'string' && relatedIdRaw ? relatedIdRaw : null
    const parentTable = attachmentType === 'entry' ? 'credit_entries' : 'payments'
    if (relatedId) {
      if (!UUID_RE.test(relatedId)) {
        throw new HttpError(400, 'related_id must be a valid id')
      }
      const { data: parent, error: parentError } = await supabase
        .from(parentTable)
        .select('id, created_by')
        .eq('id', relatedId)
        .maybeSingle()
      if (parentError) throw parentError
      if (!parent) throw new HttpError(404, attachmentType === 'entry' ? 'Entry not found' : 'Payment not found')
      if (caller.role !== 'admin' && parent.created_by !== caller.staff_id) {
        throw new HttpError(403, 'You can only attach files to your own records')
      }
    }

    // Determine bucket based on file type
    const bucket = isImage ? 'entry-photos' : 'entry-docs'

    // Generate safe filename
    const safeName = `${Date.now()}-${crypto.randomUUID()}.${ext}`

    // Upload using service role key (bypasses RLS)
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(safeName, file, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      throw new HttpError(500, 'Upload failed. Please try again.')
    }

    // Canonical URL: an identifier only (the bucket is private)
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(safeName)

    const publicUrl = publicUrlData.publicUrl
    const fileType = isImage ? 'image' : 'pdf'

    // If related_id is provided, create the attachment record
    if (relatedId) {
      const tableName = attachmentType === 'entry' ? 'credit_entry_attachments' : 'payment_attachments'
      const foreignKey = attachmentType === 'entry' ? 'credit_entry_id' : 'payment_id'

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
        throw new HttpError(500, 'Failed to save the attachment. Please try again.')
      }
    }

    // `url` is the canonical identifier to store; `signed_url` is what to show.
    // `file_type` stays the coarse image|pdf bucket the attachment tables use.
    // `mime_type` is the type of the original File, passed through so callers
    // (ai-scan) can label the bytes accurately instead of assuming a format.
    return json(req, {
      url: publicUrl,
      signed_url: await signUrl(supabase, publicUrl),
      file_type: fileType,
      mime_type: mimeType,
    })
  } catch (error) {
    return errorResponse(req, error, 'upload-attachment')
  }
})
