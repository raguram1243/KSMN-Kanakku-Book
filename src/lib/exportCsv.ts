/**
 * Shared CSV helpers used by the report export menus and the daily backup.
 */

export type CsvCell = string | number | null | undefined

function escapeCell(cell: CsvCell): string {
  return `"${String(cell ?? '').replace(/"/g, '""')}"`
}

export function buildCsv(headers: string[], rows: CsvCell[][], footer?: CsvCell[]): string {
  const lines = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCell).join(',')),
  ]
  if (footer) lines.push(footer.map(escapeCell).join(','))
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string) {
  // BOM keeps Excel happy with UTF-8 content (customer names, the rupee sign).
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
