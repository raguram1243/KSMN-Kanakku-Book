import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { ExportMenu } from '../components/ui/ExportMenu';
import { PaginationControls } from '../components/ui/PaginationControls';
import { DateRangeFilter } from '../components/reports/DateRangeFilter';
import { PlainHeader, SortableHeader } from '../components/reports/SortableHeader';
import { ReportError, ReportLoading } from '../components/reports/ReportStates';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { usePaymentsReport } from '../hooks/useApi';
import { useClientSort } from '../hooks/useClientSort';
import { useClientPagination } from '../hooks/useClientPagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { buildCsv, downloadCsv } from '../lib/exportCsv';
import { exportPdf, reportDateRangeLabel } from '../lib/exportPdf';

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  receipt_number: string;
  notes: string;
  customer_name: string;
  customer_code: string;
  customer_id: string;
  staff_name: string;
}

/** Shape returned by the get-payments-report function. */
interface RawPayment {
  id: string;
  payment_date: string;
  amount: number | string | null;
  payment_method?: string | null;
  receipt_number?: string | null;
  notes?: string | null;
  customer_id: string;
  customer?: { name?: string; customer_code?: string } | null;
  staff?: { name?: string } | null;
}

const PAGE_SIZE = 25;

const EXPORT_HEADERS = [
  'Date & Time',
  'Customer Name',
  'Customer Code',
  'Amount',
  'Payment Method',
  'Receipt Number',
  'Notes',
  'Recorded By',
];

const methodLabel = (method: string) => (method ? method.replace(/_/g, ' ') : '');

export default function ReportPaymentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  // Filter on the settled value so every keystroke doesn't re-filter, re-sort
  // and re-page the whole report.
  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, error, refetch } = usePaymentsReport(dateFrom, dateTo);

  // Empty strings rather than null so every column sorts the same way.
  const rows: PaymentRow[] = useMemo(() => {
    const payments: RawPayment[] = data?.payments ?? [];
    return payments.map(p => ({
      id: p.id,
      payment_date: p.payment_date,
      amount: Number(p.amount) || 0,
      payment_method: p.payment_method ?? '',
      receipt_number: p.receipt_number ?? '',
      notes: p.notes ?? '',
      customer_name: p.customer?.name ?? '',
      customer_code: p.customer?.customer_code ?? '',
      customer_id: p.customer_id,
      staff_name: p.staff?.name ?? '',
    }));
  }, [data]);

  const matching = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_code.toLowerCase().includes(q) ||
        r.receipt_number.toLowerCase().includes(q) ||
        r.payment_method.toLowerCase().includes(q)
    );
  }, [rows, debouncedSearch]);

  const { sorted, sortKey, direction, toggleSort } = useClientSort(matching, 'payment_date', 'desc');
  const pager = useClientPagination(
    sorted,
    PAGE_SIZE,
    [dateFrom, dateTo, debouncedSearch, sortKey, direction].join('|')
  );

  // Totals and exports cover every matching row, not just the visible page.
  const totalAmount = useMemo(() => sorted.reduce((s, r) => s + r.amount, 0), [sorted]);

  const exportRows = (money: (value: number) => string) =>
    sorted.map(p => [
      formatDateTime(p.payment_date),
      p.customer_name,
      p.customer_code,
      money(p.amount),
      methodLabel(p.payment_method),
      p.receipt_number,
      p.notes,
      p.staff_name,
    ]);

  const exportFooter = (money: (value: number) => string) => [
    '',
    `TOTALS (${sorted.length})`,
    '',
    money(totalAmount),
    '',
    '',
    '',
    '',
  ];

  const plain = (value: number) => value.toFixed(2);

  const exportCsv = () =>
    downloadCsv('payments_received_report', buildCsv(EXPORT_HEADERS, exportRows(plain), exportFooter(plain)));

  const exportPdfFile = () =>
    exportPdf({
      title: 'Payments Received Report',
      subtitle: reportDateRangeLabel(dateFrom, dateTo),
      filename: 'payments_received_report',
      headers: EXPORT_HEADERS,
      rows: exportRows(formatCurrency),
      footer: exportFooter(formatCurrency),
      rightAlignColumns: [3],
    });

  const header = { activeColumn: sortKey, direction, onSort: toggleSort };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px] flex-1">
          <Input
            type="text"
            label="Search"
            placeholder="Customer name, code, receipt, or method..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <ExportMenu onExportCsv={exportCsv} onExportPdf={exportPdfFile} disabled={sorted.length === 0} />
      </div>

      {isLoading ? (
        <ReportLoading columns={7} />
      ) : error ? (
        <ReportError error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <SortableHeader label="Date & Time" column="payment_date" {...header} />
                  <SortableHeader label="Customer Name" column="customer_name" {...header} />
                  <SortableHeader label="Amount" column="amount" align="right" {...header} />
                  <SortableHeader label="Payment Method" column="payment_method" {...header} />
                  <SortableHeader label="Receipt Number" column="receipt_number" {...header} />
                  <PlainHeader label="Notes" />
                  <SortableHeader label="Recorded By" column="staff_name" {...header} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pager.pageRows.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(p.payment_date)}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/customers/${p.customer_id}`}
                        className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                      >
                        {p.customer_name}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{p.customer_code}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(p.amount)}</td>
                    <td className="px-3 py-2 capitalize">{methodLabel(p.payment_method) || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.receipt_number || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[180px] truncate">
                      {p.notes || '—'}
                    </td>
                    <td className="px-3 py-2">{p.staff_name || '—'}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                      No payments match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                  <td colSpan={2} className="px-3 py-2 text-gray-900 dark:text-white">
                    Totals ({sorted.length} {sorted.length === 1 ? 'payment' : 'payments'})
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totalAmount)}</td>
                  <td colSpan={4}></td>
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
