/**
 * Minimal dependency-free PDF generator.
 * Builds a valid PDF v1.4 binary from plain-text table rows.
 */
export function exportPdf({
  title,
  filename,
  headers,
  rows,
  footer,
}: {
  title: string
  filename: string
  headers: string[]
  rows: string[][]
  footer?: string[]
}) {
  const margin = 40
  const pageHeight = 841.89
  const lineHeight = 14
  const linesPerPage = Math.floor((pageHeight - margin * 2 - 60) / lineHeight)

  const pages: string[][][] = []
  for (let i = 0; i < rows.length; i += linesPerPage) {
    pages.push(rows.slice(i, i + linesPerPage))
  }

  let objects: string[] = []
  let objectId = 1

  function addObject(content: string): number {
    objects.push(`${objectId} 0 obj\n${content}\nendobj`)
    return objectId++
  }

  const fontObjId = addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`)

  const pageObjectIds: number[] = []
  for (let i = 0; i < pages.length; i++) {
    const content = buildPageContent({
      title,
      headers,
      rows: pages[i],
      footer,
    })
    const contentObjId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    const pageObjId = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 ${pageHeight}] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`
    )
    pageObjectIds.push(pageObjId)
  }

  const kids = pageObjectIds.map(id => `${id} 0 R`).join(' ')
  const pagesObjId = addObject(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  const catalogObjId = addObject(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`)

  const pdfObjects = objects.join('\n\n')
  const xrefOffset = pdfObjects.length + `\n`.length * (objects.length + 2)
  const pdf = `${pdfObjects}
trailer
<< /Size ${objectId} /Root ${catalogObjId} 0 R >>
startxref
${xrefOffset}
%%EOF`

  const blob = new Blob([pdf], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

function buildPageContent({
  title,
  headers,
  rows,
  footer,
}: {
  title: string
  headers: string[]
  rows: string[][]
  footer?: string[]
}) {
  const margin = 40
  const titleY = 800

  const lines: string[] = []
  const font = '/F1'
  const fontSize = 10

  lines.push(`BT`)
  lines.push(`${font} ${fontSize} Tf`)
  lines.push(`14 TL`)
  lines.push(`${margin} ${titleY} Td`)
  lines.push(`(${escapePdfText(title)}) Tj`)

  const headerY = titleY - 30
  lines.push(`${margin} ${headerY} Td`)
  lines.push(`(${escapePdfText(headers.join('  '))}) Tj`)

  let y = headerY - 28
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    lines.push(`${margin} ${y} Td`)
    lines.push(`(${escapePdfText(row.join('  '))}) Tj`)
    y -= 14
  }

  if (footer) {
    lines.push(`${margin} ${y} Td`)
    lines.push(`(${escapePdfText(footer.join('  '))}) Tj`)
  }

  lines.push(`ET`)
  return lines.join('\n')
}

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}
