/**
 * Helpers for handing a file (picture or PDF) to WhatsApp, shared by the
 * pending-bill reminder and the Print Bill preview.
 *
 * Phones: the native share sheet with the file attached (Web Share Level 2).
 * Desktop: WhatsApp does not register as a share target, so a picture goes on
 * the clipboard (paste it into the chat) and a PDF is downloaded instead.
 */

/** True when the browser says it can share this file through the native share sheet. */
export function canShareFile(file: File | null): boolean {
  if (!file || typeof navigator === 'undefined') return false
  try {
    return !!navigator.canShare?.({ files: [file] })
  } catch {
    return false
  }
}

/**
 * Can an image go on the clipboard? That is the quickest desktop route:
 * WhatsApp Web and the Windows app both accept a pasted image, so there is
 * no file to find. A PDF cannot go on a clipboard, so it still downloads.
 */
export function canCopyImage(kind: 'png' | 'pdf'): boolean {
  if (kind !== 'png') return false
  if (typeof ClipboardItem === 'undefined') return false
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.write
}

/** Phones and tablets: touch input plus a mobile-ish user agent (iPadOS reports as a Mac). */
export function looksLikePhoneOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!(navigator.maxTouchPoints > 0)) return false
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua) || /Macintosh/i.test(ua)
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke after the browser has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
