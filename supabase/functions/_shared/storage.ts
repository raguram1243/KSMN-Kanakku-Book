// Buckets used by upload-attachment for customer-linked files
const STORAGE_BUCKETS = ['entry-photos', 'entry-docs'] as const

// Extract the storage bucket + object path from a public file URL produced by
// supabase.storage.getPublicUrl(). Expected shape:
//   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<object-path>
export function parseStorageUrl(fileUrl: string): { bucket: string | null; path: string | null } {
  try {
    const url = new URL(fileUrl)
    // pathname looks like /storage/v1/object/public/entry-photos/<file>
    const marker = '/storage/v1/object/public/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex === -1) return { bucket: null, path: null }

    const rest = url.pathname.slice(markerIndex + marker.length) // entry-photos/<file>
    const slashIndex = rest.indexOf('/')
    if (slashIndex === -1) return { bucket: null, path: null }

    const bucket = rest.slice(0, slashIndex)
    const path = rest.slice(slashIndex + 1)

    if (!(STORAGE_BUCKETS as readonly string[]).includes(bucket)) {
      return { bucket: null, path: null }
    }

    return { bucket, path }
  } catch {
    return { bucket: null, path: null }
  }
}
