// ============================================
// MIME type handling for AI Scan
// ============================================
// Kept in its own module (no Deno globals) so the resolution rules can be
// exercised directly by tests as well as by the edge function.

/**
 * Image MIME types the vision provider can actually decode.
 *
 * PDFs are deliberately absent: documents are sent to OpenRouter through
 * OpenAI's `image_url` field, which cannot read raw PDF bytes, so a PDF
 * produces a failed or garbage scan rather than an extraction.
 */
export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export const PDF_UNSUPPORTED_MESSAGE =
  "PDF documents aren't supported for AI Scan yet. Please upload a photo of the document instead.";

/** Strips any parameters (`; charset=…`) and normalises case. */
export function normalizeMimeType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.split(';')[0].trim().toLowerCase();
  return normalized || null;
}

/**
 * Resolves the file's real MIME type instead of assuming one.
 *
 * Prefers the type the browser reported for the original File object (threaded
 * through from upload-attachment), then the type Storage recorded for the
 * object. Returns null when neither is an image format the provider supports,
 * so the caller can fail loudly rather than mislabel the bytes — this replaces
 * a hardcoded `image/jpeg` that mislabelled every PNG and WebP.
 */
export function resolveImageMimeType(
  clientMimeType: unknown,
  storageMimeType: string | null | undefined
): string | null {
  for (const candidate of [clientMimeType, storageMimeType]) {
    const normalized = normalizeMimeType(candidate);
    if (normalized && SUPPORTED_IMAGE_MIME_TYPES.includes(normalized)) {
      return normalized;
    }
  }
  return null;
}

/** True when the given type is a PDF, used to pick the clearer error message. */
export function isPdfMimeType(value: unknown): boolean {
  return normalizeMimeType(value) === 'application/pdf';
}
