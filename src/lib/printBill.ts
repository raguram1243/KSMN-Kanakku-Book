/**
 * Prints a bill's page images on A4 from the current document.
 *
 * The site's Content-Security-Policy rules out the usual tricks (an iframe of
 * a blob: URL, an <object>/<embed> PDF), so the images are put in a
 * print-only container and window.print() is called, with print CSS that
 * hides the app for the duration.
 *
 * - `half`: one picture on the top half of the sheet, to cut or fold off;
 * - `full`: one picture filling the sheet;
 * - `pdf`:  one page image per sheet.
 */
import type { BillLayout } from './billImage'

const ROOT_ID = 'bill-print-root'
const STYLE_ID = 'bill-print-style'
const ACTIVE_CLASS = 'bill-printing'

// Printable area of A4 (210 x 297 mm) inside 10 mm margins.
const PRINT_CSS = `
#${ROOT_ID} { display: none; }
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  html.${ACTIVE_CLASS}, html.${ACTIVE_CLASS} body {
    background: #ffffff !important;
    height: auto !important;
    overflow: visible !important;
  }
  html.${ACTIVE_CLASS} body > *:not(#${ROOT_ID}) { display: none !important; }
  html.${ACTIVE_CLASS} #${ROOT_ID} { display: block !important; }
  #${ROOT_ID} .bill-print-page {
    width: 190mm;
    height: 277mm;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
    break-inside: avoid;
  }
  #${ROOT_ID} .bill-print-page:last-child { break-after: auto; page-break-after: auto; }
  #${ROOT_ID} .bill-print-page.half { height: 133mm; }
  #${ROOT_ID} img {
    display: block;
    margin: 0 auto;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`

let cleanupCurrent: (() => void) | null = null

/** Removes the print container and style. Safe to call at any time. */
export function cleanupBillPrint() {
  cleanupCurrent?.()
  cleanupCurrent = null
}

export async function printBillImages(pageImages: string[], layout: BillLayout): Promise<void> {
  cleanupBillPrint()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = PRINT_CSS
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.id = ROOT_ID
  const images: HTMLImageElement[] = []
  const pages = layout === 'pdf' ? pageImages : pageImages.slice(0, 1)
  pages.forEach((src, index) => {
    const page = document.createElement('div')
    page.className = `bill-print-page${layout === 'half' ? ' half' : ''}`
    const img = document.createElement('img')
    img.alt = `Bill page ${index + 1}`
    img.src = src
    page.appendChild(img)
    root.appendChild(page)
    images.push(img)
  })
  document.body.appendChild(root)

  const cleanup = () => {
    window.removeEventListener('afterprint', onAfterPrint)
    document.documentElement.classList.remove(ACTIVE_CLASS)
    root.remove()
    style.remove()
  }
  const onAfterPrint = () => {
    if (cleanupCurrent === cleanup) cleanupCurrent = null
    cleanup()
  }
  cleanupCurrent = cleanup

  // The pictures must be decoded before the print snapshot is taken.
  await Promise.all(images.map(img => img.decode().catch(() => undefined)))

  document.documentElement.classList.add(ACTIVE_CLASS)
  window.addEventListener('afterprint', onAfterPrint)
  window.print()
}
