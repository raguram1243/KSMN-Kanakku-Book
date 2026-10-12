import type { SupabaseClient } from './supabase.ts'
import { HttpError } from './http.ts'

// Buckets used by upload-attachment for customer-linked files. Both are
// PRIVATE (migration 031): a stored URL is only an identifier and does not open
// on its own. Anything sent to the browser must go through signUrl/signRows.
const STORAGE_BUCKETS = ['entry-photos', 'entry-docs'] as const

/** How long a signed link to a bill photo stays valid. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

function projectHost(): string | null {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

// Extract the storage bucket + object path from a file URL in the canonical
// stored shape (what supabase.storage.getPublicUrl() returns):
//   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<object-path>
// Signed URLs (/object/sign/<bucket>/<path>?token=...) are accepted too, so a
// URL the browser got from us can be sent back.
// Returns nulls for anything that is not one of OUR files in an allowed bucket.
export function parseStorageUrl(fileUrl: string): { bucket: string | null; path: string | null } {
  try {
    const url = new URL(fileUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { bucket: null, path: null }

    const host = projectHost()
    if (!host || url.host !== host) return { bucket: null, path: null }

    let rest: string | null = null
    for (const marker of ['/storage/v1/object/public/', '/storage/v1/object/sign/']) {
      const i = url.pathname.indexOf(marker)
      if (i !== -1) {
        rest = url.pathname.slice(i + marker.length)
        break
      }
    }
    if (rest === null) return { bucket: null, path: null }

    const slashIndex = rest.indexOf('/')
    if (slashIndex === -1) return { bucket: null, path: null }

    const bucket = rest.slice(0, slashIndex)
    const path = decodeURIComponent(rest.slice(slashIndex + 1))

    if (!(STORAGE_BUCKETS as readonly string[]).includes(bucket)) {
      return { bucket: null, path: null }
    }
    if (!path || path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
      return { bucket: null, path: null }
    }

    return { bucket, path }
  } catch {
    return { bucket: null, path: null }
  }
}

/** The canonical (stored) URL for a bucket + path. Never opens on its own. */
export function canonicalStorageUrl(bucket: string, path: string): string {
  const base = Deno.env.get('SUPABASE_URL')!.replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Validate a client-supplied file URL before storing it. Only files in our own
 * attachment buckets are accepted; it is returned in canonical form (a signed
 * URL sent back by the browser is converted). Throws 400 for anything else —
 * this is what stops a planted phishing or javascript: link (S4).
 */
export function assertOwnFileUrl(fileUrl: unknown, field = 'file_url'): string {
  if (typeof fileUrl !== 'string' || fileUrl.length > 2048) {
    throw new HttpError(400, `${field} must be a link to an uploaded file`)
  }
  const { bucket, path } = parseStorageUrl(fileUrl)
  if (!bucket || !path) {
    throw new HttpError(400, `${field} must be a link to a file uploaded through this app`)
  }
  return canonicalStorageUrl(bucket, path)
}

/**
 * Validate a client-supplied attachments array: [{ file_url, file_type }].
 * Returns clean rows with canonical URLs. Throws 400 on anything malformed.
 */
export function cleanAttachments(input: unknown): Array<{ file_url: string; file_type: 'image' | 'pdf' }> {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) throw new HttpError(400, 'attachments must be a list')
  if (input.length > 20) throw new HttpError(400, 'At most 20 attachments are allowed')
  return input.map((a, i) => {
    const row = (a ?? {}) as Record<string, unknown>
    const fileType = row.file_type
    if (fileType !== 'image' && fileType !== 'pdf') {
      throw new HttpError(400, `attachments[${i}].file_type must be "image" or "pdf"`)
    }
    return { file_url: assertOwnFileUrl(row.file_url, `attachments[${i}].file_url`), file_type: fileType }
  })
}

/** A short-lived link the browser can open, or null if the URL is not one of our files. */
export async function signUrl(supabase: SupabaseClient, fileUrl: string | null | undefined): Promise<string | null> {
  if (!fileUrl) return null
  const { bucket, path } = parseStorageUrl(fileUrl)
  if (!bucket || !path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) return null
  return data.signedUrl
}

/**
 * Replace `field` on every row with a signed link (batched per bucket). Rows
 * whose URL is not one of our files get null, so nothing unsafe is rendered.
 * Mutates and returns the same array.
 */
export async function signRows<T extends Record<string, any>>(
  supabase: SupabaseClient,
  rows: T[],
  field: keyof T & string = 'file_url',
): Promise<T[]> {
  const byBucket = new Map<string, { path: string; row: T }[]>()
  for (const row of rows) {
    const { bucket, path } = parseStorageUrl(String(row[field] ?? ''))
    if (!bucket || !path) {
      ;(row as any)[field] = null
      continue
    }
    if (!byBucket.has(bucket)) byBucket.set(bucket, [])
    byBucket.get(bucket)!.push({ path, row })
  }

  for (const [bucket, items] of byBucket) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(items.map((i) => i.path), SIGNED_URL_TTL_SECONDS)
    items.forEach((item, idx) => {
      const signed = !error && data ? data[idx]?.signedUrl : null
      ;(item.row as any)[field] = signed || null
    })
  }
  return rows
}
