import { useState, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { ExportMenu } from '../components/ui/ExportMenu';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { useLedgerReport } from '../hooks/useApi';
import { exportPdf } from '../lib/exportPdf';
import { downloadCsv } from '../lib/exportCsv';
import { SUMMARY_HEADERS, buildSummaryCsv } from '../lib/summaryReport';

type CustomerType = 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate';

interface LedgerRow {
  customer_id: string
  customer_code: string
  name: string
  phone: string
  customer_type: CustomerType
  total_credit: number
  total_paid: number
  outstanding: number
}

const CUSTOMER_TYPES: CustomerType[] = [
  'walk-in',
  'regular',
  'contractor',
  'wholesale',
  'corporate',
]

type SortColumn = 'name' | 'customer_code' | 'total_credit' | 'total_paid' | 'outstanding'

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { data, isLoading, error } = useLedgerReport(dateFrom, dateTo)
  const customers = (data?.customers ?? []) as LedgerRow[]

  const [searchQuery, setSearchQuery] = useState('')
  const [customerType, setCustomerType] = useState<CustomerType | 'all'>('all')
  const [outstandingOnly, setOutstandingOnly] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const filtered = useMemo(() => {
    let rows = customers

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.customer_code.toLowerCase().includes(q)
      )
    }

    if (customerType !== 'all') {
      rows = rows.filter(c => c.customer_type === customerType)
    }

    if (outstandingOnly) {
      rows = rows.filter(c => (c.outstanding ?? 0) > 0.01)
    }

    const sorted = [...rows].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      const aNum = Number(aVal) || 0
      const bNum = Number(bVal) || 0
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
    })

    return sorted
  }, [customers, searchQuery, customerType, outstandingOnly, sortColumn, sortDirection])

  const totals = useMemo(() => {
    const credit = filtered.reduce((s, r) => s + (Number(r.total_credit) || 0), 0)
    const paid = filtered.reduce((s, r) => s + (Number(r.total_paid) || 0), 0)
    const outstanding = filtered.reduce((s, r) => s + (Number(r.outstanding) || 0), 0)
    return { credit, paid, outstanding }
  }, [filtered])

  const dateRangeLabel =
    dateFrom || dateTo
      ? `Date range: ${dateFrom || 'start'} to ${dateTo || 'today'}`
      : 'Date range: all time'

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return (
        <span className="ml-1 text-gray-400">
          <ArrowUpDown size={12} />
        </span>
      )
    }
    return (
      <span className="ml-1 text-xs text-primary-600 dark:text-primary-400">
        {sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </span>
    )
  }

  const exportCsv = () => {
    downloadCsv('ledger_report', buildSummaryCsv(filtered))
  }

  const exportPdfFile = () => {
    const rows = filtered.map(r => [
      r.customer_code,
      r.name,
      r.phone,
      r.customer_type,
      formatCurrency(r.total_credit),
      formatCurrency(r.total_paid),
      formatCurrency(r.outstanding),
    ])
    const footer = [
      '',
      `TOTALS (${filtered.length})`,
      '',
      '',
      formatCurrency(totals.credit),
      formatCurrency(totals.paid),
      formatCurrency(totals.outstanding),
    ]

    exportPdf({
      title: 'Ledger Report - Summary',
      subtitle: dateRangeLabel,
      filename: 'ledger_report',
      headers: SUMMARY_HEADERS,
      rows,
      footer,
      rightAlignColumns: [4, 5, 6],
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-full bg-gray-100 dark:bg-gray-700 rounded" />
            <div className="h-4 w-full bg-gray-100 dark:bg-gray-700 rounded" />
          </div>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400">
        {error instanceof Error ? error.message : 'Failed to load report'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <ExportMenu onExportCsv={exportCsv} onExportPdf={exportPdfFile} disabled={filtered.length === 0} />
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <Input
            label="Search"
            placeholder="Search by name, phone, or code"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />

          <div className="w-44">
            <Input
              type="date"
              label="From Date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div className="w-44">
            <Input
              type="date"
              label="To Date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <select
              value={customerType}
              onChange={e => setCustomerType(e.target.value as CustomerType | 'all')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Types</option>
              {CUSTOMER_TYPES.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={outstandingOnly}
                onChange={e => setOutstandingOnly(e.target.checked)}
              />
              Has outstanding only
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th
                  className="text-left py-2 px-2 cursor-pointer select-none"
                  onClick={() => handleSort('name')}
                >
                  Customer <SortIndicator column="name" />
                </th>
                <th
                  className="text-left py-2 px-2 cursor-pointer select-none"
                  onClick={() => handleSort('customer_code')}
                >
                  Code <SortIndicator column="customer_code" />
                </th>
                <th
                  className="text-right py-2 px-2 cursor-pointer select-none"
                  onClick={() => handleSort('total_credit')}
                >
                  Total Credit Given <SortIndicator column="total_credit" />
                </th>
                <th
                  className="text-right py-2 px-2 cursor-pointer select-none"
                  onClick={() => handleSort('total_paid')}
                >
                  Total Paid <SortIndicator column="total_paid" />
                </th>
                <th
                  className="text-right py-2 px-2 cursor-pointer select-none"
                  onClick={() => handleSort('outstanding')}
                >
                  Remaining Outstanding <SortIndicator column="outstanding" />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.customer_id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 px-2">
                    <div className="font-medium text-gray-900 dark:text-white">{r.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{r.phone}</div>
                  </td>
                  <td className="py-2 px-2 text-gray-700 dark:text-gray-300">{r.customer_code}</td>
                  <td className="py-2 px-2 text-right text-gray-900 dark:text-white">
                    {formatCurrency(r.total_credit)}
                  </td>
                  <td className="py-2 px-2 text-right text-gray-900 dark:text-white">
                    {formatCurrency(r.total_paid)}
                  </td>
                  <td className="py-2 px-2 text-right font-medium text-red-600 dark:text-red-400">
                    {formatCurrency(r.outstanding)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500 dark:text-gray-400">
                    No customers match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                <td className="py-2 px-2 text-gray-900 dark:text-white" colSpan={2}>
                  Totals ({filtered.length} {filtered.length === 1 ? 'customer' : 'customers'})
                </td>
                <td className="py-2 px-2 text-right text-gray-900 dark:text-white">
                  {formatCurrency(totals.credit)}
                </td>
                <td className="py-2 px-2 text-right text-gray-900 dark:text-white">
                  {formatCurrency(totals.paid)}
                </td>
                <td className="py-2 px-2 text-right text-gray-900 dark:text-white">
                  {formatCurrency(totals.outstanding)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}
