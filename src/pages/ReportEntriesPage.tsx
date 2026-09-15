import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { ExportMenu } from '../components/ui/ExportMenu';
import { PaginationControls } from '../components/ui/PaginationControls';
import { DateRangeFilter } from '../components/reports/DateRangeFilter';
import { PlainHeader, SortableHeader } from '../components/reports/SortableHeader';
import { ReportError, ReportLoading } from '../components/reports/ReportStates';
import { formatCurrency, formatDateTime, getStatusColor } from '../lib/utils';
import { useEntriesReport } from '../hooks/useApi';
import { useClientSort } from '../hooks/useClientSort';
import { useClientPagination } from '../hooks/useClientPagination';
import { buildCsv, downloadCsv } from '../lib/exportCsv';
import { exportPdf, reportDateRangeLabel } from '../lib/exportPdf';

interface EntryRow {
  id: string;
  entry_code: string;
  created_at: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: string;
  description: string | null;
  customer_name: string;
  customer_code: string;
  customer_id: string;
}

/** Shape returned by the get-entries-report function. */
interface RawEntry {
  id: string;
  entry_code: string;
  created_at: string;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  balance: number | string | null;
  status: string;
  description?: string | null;
  customer_id: string;
  customer?: { name?: string; customer_code?: string } | null;
}

const PAGE_SIZE = 25;

const EXPORT_HEADERS = [
  'Date & Time',
  'Entry Code',
  'Customer Name',
  'Customer Code',
  'Description',
  'Total Amount',
  'Paid Amount',
  'Balance',
  'Status',
];

export default function ReportEntriesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, error, refetch } = useEntriesReport(dateFrom, dateTo);

  const rows: EntryRow[] = useMemo(() => {
    const entries: RawEntry[] = data?.entries ?? [];
    return entries.map(e => ({
      id: e.id,
      entry_code: e.entry_code,
      created_at: e.created_at,
      total_amount: Number(e.total_amount) || 0,
      paid_amount: Number(e.paid_amount) || 0,
      balance: Number(e.balance) || 0,
      status: e.status,
      description: e.description ?? null,
      customer_name: e.customer?.name ?? '',
      customer_code: e.customer?.customer_code ?? '',
      customer_id: e.customer_id,
    }));
  }, [data]);

  const matching = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_code.toLowerCase().includes(q) ||
        r.entry_code.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const { sorted, sortKey, direction, toggleSort } = useClientSort(matching, 'created_at', 'desc');
  const pager = useClientPagination(
    sorted,
    PAGE_SIZE,
    [dateFrom, dateTo, searchQuery, sortKey, direction].join('|')
  );

  // Totals and exports cover every matching row, not just the visible page.
  const totals = useMemo(
    () => ({
      totalAmount: sorted.reduce((s, r) => s + r.total_amount, 0),
      totalPaid: sorted.reduce((s, r) => s + r.paid_amount, 0),
      totalBalance: sorted.reduce((s, r) => s + r.balance, 0),
    }),
    [sorted]
  );

  const exportRows = (money: (value: number) => string) =>
    sorted.map(r => [
      formatDateTime(r.created_at),
      r.entry_code,
      r.customer_name,
      r.customer_code,
      r.description || '',
      money(r.total_amount),
      money(r.paid_amount),
      money(r.balance),
      r.status,
    ]);

  const exportFooter = (money: (value: number) => string) => [
    '',
    '',
    `TOTALS (${sorted.length})`,
    '',
    '',
    money(totals.totalAmount),
    money(totals.totalPaid),
    money(totals.totalBalance),
    '',
  ];

  const plain = (value: number) => value.toFixed(2);

  const exportCsv = () =>
    downloadCsv('credit_entries_report', buildCsv(EXPORT_HEADERS, exportRows(plain), exportFooter(plain)));

  const exportPdfFile = () =>
    exportPdf({
      title: 'Credit Entries Report',
      subtitle: reportDateRangeLabel(dateFrom, dateTo),
      filename: 'credit_entries_report',
      headers: EXPORT_HEADERS,
      rows: exportRows(formatCurrency),
      footer: exportFooter(formatCurrency),
      rightAlignColumns: [5, 6, 7],
    });

  const header = { activeColumn: sortKey, direction, onSort: toggleSort };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px] flex-1">
          <Input
            type="text"
            label="Search"
            placeholder="Customer name, code, or entry code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <ExportMenu onExportCsv={exportCsv} onExportPdf={exportPdfFile} disabled={sorted.length === 0} />
      </div>

      {isLoading ? (
        <ReportLoading columns={8} />
      ) : error ? (
        <ReportError error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <SortableHeader label="Date & Time" column="created_at" {...header} />
                  <SortableHeader label="Entry Code" column="entry_code" {...header} />
                  <SortableHeader label="Customer Name" column="customer_name" {...header} />
                  <PlainHeader label="Description" />
                  <SortableHeader label="Total Amount" column="total_amount" align="right" {...header} />
                  <SortableHeader label="Paid Amount" column="paid_amount" align="right" {...header} />
                  <SortableHeader label="Balance" column="balance" align="right" {...header} />
                  <SortableHeader label="Status" column="status" {...header} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pager.pageRows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.entry_code}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/customers/${r.customer_id}`}
                        className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                      >
                        {r.customer_name}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{r.customer_code}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {r.description || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.total_amount)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.paid_amount)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.balance)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                      No entries match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-gray-900 dark:text-white">
                    Totals ({sorted.length} {sorted.length === 1 ? 'entry' : 'entries'})
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totals.totalAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totals.totalPaid)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totals.totalBalance)}</td>
                  <td></td>
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
