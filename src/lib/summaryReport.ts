/**
 * Shared shape/derivation for the Reports > Summary table.
 * Used by ReportsPage (manual CSV/PDF export) and by the daily backup
 * so both always produce exactly the same columns and totals.
 */
import { buildCsv, downloadCsv } from './exportCsv'

export interface SummaryRow {
  customer_code: string
  name: string
  phone: string
  customer_type: string
  total_credit: number
  total_paid: number
  outstanding: number
}

export interface SummaryTotals {
  credit: number
  paid: number
  outstanding: number
}

export const SUMMARY_HEADERS = [
  'Customer Code',
  'Name',
  'Phone',
  'Type',
  'Total Credit Given',
  'Total Paid',
  'Remaining Outstanding',
]

export function summaryTotals(rows: SummaryRow[]): SummaryTotals {
  return {
    credit: rows.reduce((s, r) => s + (Number(r.total_credit) || 0), 0),
    paid: rows.reduce((s, r) => s + (Number(r.total_paid) || 0), 0),
    outstanding: rows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0),
  }
}

/** Rows/footer as plain numbers — the CSV form. */
export function buildSummaryCsv(rows: SummaryRow[]): string {
  const totals = summaryTotals(rows)
  const body = rows.map(r => [
    r.customer_code,
    r.name,
    r.phone,
    r.customer_type,
    (Number(r.total_credit) || 0).toFixed(2),
    (Number(r.total_paid) || 0).toFixed(2),
    (Number(r.outstanding) || 0).toFixed(2),
  ])
  const footer = [
    '',
    'TOTALS',
    '',
    '',
    totals.credit.toFixed(2),
    totals.paid.toFixed(2),
    totals.outstanding.toFixed(2),
  ]
  return buildCsv(SUMMARY_HEADERS, body, footer)
}

export function downloadSummaryCsv(rows: SummaryRow[], filename: string) {
  downloadCsv(filename, buildSummaryCsv(rows))
}
