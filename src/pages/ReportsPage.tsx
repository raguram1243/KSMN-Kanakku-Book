import { useState, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { ExportMenu } from '../components/ui/ExportMenu';
import { PaginationControls } from '../components/ui/PaginationControls';
import { DateRangeFilter } from '../components/reports/DateRangeFilter';
import { SortableHeader } from '../components/reports/SortableHeader';
import { ReportError, ReportLoading } from '../components/reports/ReportStates';
import { formatCurrency } from '../lib/utils';
import { useLedgerReport } from '../hooks/useApi';
import { useClientSort } from '../hooks/useClientSort';
import { useClientPagination } from '../hooks/useClientPagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { exportPdf, reportDateRangeLabel } from '../lib/exportPdf';
import { downloadCsv } from '../lib/exportCsv';
import { SUMMARY_HEADERS, buildSummaryCsv } from '../lib/summaryReport';

type CustomerType = 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate';

interface LedgerRow {
  customer_id: string;
  customer_code: string;
  name: string;
  phone: string;
  customer_type: CustomerType;
  total_credit: number;
  total_paid: number;
  outstanding: number;
}

const CUSTOMER_TYPES: CustomerType[] = ['walk-in', 'regular', 'contractor', 'wholesale', 'corporate'];
const PAGE_SIZE = 25;
const EMPTY: LedgerRow[] = [];

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Filter on the settled value so every keystroke doesn't re-filter, re-sort
  // and re-page the whole report.
  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const [customerType, setCustomerType] = useState<CustomerType | 'all'>('all');
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  const { data, isLoading, error, refetch } = useLedgerReport(dateFrom, dateTo);
  const customers = (data?.customers as LedgerRow[] | undefined) ?? EMPTY;

  const matching = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return customers.filter(c => {
      if (q && !(c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.customer_code.toLowerCase().includes(q))) {
        return false;
      }
      if (customerType !== 'all' && c.customer_type !== customerType) return false;
      if (outstandingOnly && !((c.outstanding ?? 0) > 0.01)) return false;
      return true;
    });
  }, [customers, debouncedSearch, customerType, outstandingOnly]);

  const { sorted, sortKey, direction, toggleSort } = useClientSort(matching, 'name', 'asc');
  const pager = useClientPagination(
    sorted,
    PAGE_SIZE,
    [dateFrom, dateTo, debouncedSearch, customerType, outstandingOnly, sortKey, direction].join('|')
  );

  // Totals and exports cover every matching row, not just the visible page.
  const totals = useMemo(
    () => ({
      credit: sorted.reduce((s, r) => s + (Number(r.total_credit) || 0), 0),
      paid: sorted.reduce((s, r) => s + (Number(r.total_paid) || 0), 0),
      outstanding: sorted.reduce((s, r) => s + (Number(r.outstanding) || 0), 0),
    }),
    [sorted]
  );

  const exportCsv = () => downloadCsv('ledger_report', buildSummaryCsv(sorted));

  const exportPdfFile = () =>
    exportPdf({
      title: 'Ledger Report - Summary',
      subtitle: reportDateRangeLabel(dateFrom, dateTo),
      filename: 'ledger_report',
      headers: SUMMARY_HEADERS,
      rows: sorted.map(r => [
        r.customer_code,
        r.name,
        r.phone,
        r.customer_type,
        formatCurrency(r.total_credit),
        formatCurrency(r.total_paid),
        formatCurrency(r.outstanding),
      ]),
      footer: [
        '',
        `TOTALS (${sorted.length})`,
        '',
        '',
        formatCurrency(totals.credit),
        formatCurrency(totals.paid),
        formatCurrency(totals.outstanding),
      ],
      rightAlignColumns: [4, 5, 6],
    });

  const header = { activeColumn: sortKey, direction, onSort: toggleSort };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px] flex-1">
          <Input
            type="text"
            label="Search"
            placeholder="Customer name, phone, or code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <div>
          <label htmlFor="summary-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Type
          </label>
          <select
            id="summary-type"
            value={customerType}
            onChange={e => setCustomerType(e.target.value as CustomerType | 'all')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Types</option>
            {CUSTOMER_TYPES.map(type => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={outstandingOnly} onChange={e => setOutstandingOnly(e.target.checked)} />
          Has outstanding only
        </label>
        <ExportMenu onExportCsv={exportCsv} onExportPdf={exportPdfFile} disabled={sorted.length === 0} />
      </div>

      {isLoading ? (
        <ReportLoading columns={5} />
      ) : error ? (
        <ReportError error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <SortableHeader label="Customer" column="name" {...header} />
                  <SortableHeader label="Code" column="customer_code" {...header} />
                  <SortableHeader label="Total Credit Given" column="total_credit" align="right" {...header} />
                  <SortableHeader label="Total Paid" column="total_paid" align="right" {...header} />
                  <SortableHeader label="Remaining Outstanding" column="outstanding" align="right" {...header} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pager.pageRows.map(r => (
                  <tr key={r.customer_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900 dark:text-white">{r.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{r.phone}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{r.customer_code}</td>
                    <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatCurrency(r.total_credit)}</td>
                    <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatCurrency(r.total_paid)}</td>
                    <td className="px-3 py-2 text-right font-medium text-red-600 dark:text-red-400">
                      {formatCurrency(r.outstanding)}
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                      No customers match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                  <td colSpan={2} className="px-3 py-2 text-gray-900 dark:text-white">
                    Totals ({sorted.length} {sorted.length === 1 ? 'customer' : 'customers'})
                  </td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatCurrency(totals.credit)}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatCurrency(totals.paid)}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatCurrency(totals.outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <PaginationControls
            page={pager.page}
            totalPages={pager.totalPages}
            pageSize={pager.pageSize}
            total={pager.total}
            onPageChange={pager.setPage}
          />
        </>
      )}
    </Card>
  );
}
