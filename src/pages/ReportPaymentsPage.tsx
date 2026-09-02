import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { ExportMenu } from '../components/ui/ExportMenu';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { usePaymentsReport } from '../hooks/useApi';
import { DateRangeFilter } from '../components/reports/DateRangeFilter';
import { buildCsv, downloadCsv } from '../lib/exportCsv';
import { exportPdf } from '../lib/exportPdf';

type SortKey = 'payment_date' | 'customer_name' | 'amount';

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  receipt_number: string | null;
  notes: string | null;
  customer_name: string;
  customer_code: string;
  customer_id: string;
  staff_name: string;
}

export default function ReportPaymentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('payment_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error } = usePaymentsReport(dateFrom, dateTo);

  const rows: PaymentRow[] = useMemo(() => {
    const payments = data?.payments ?? [];
    return payments.map((p: any) => ({
      id: p.id,
      payment_date: p.payment_date,
      amount: Number(p.amount) || 0,
      payment_method: p.payment_method ?? null,
      receipt_number: p.receipt_number ?? null,
      notes: p.notes ?? null,
      customer_name: p.customer?.name ?? '',
      customer_code: p.customer?.customer_code ?? '',
      customer_id: p.customer_id,
      staff_name: p.staff?.name ?? '',
    }));
  }, [data]);

  const filtered = useMemo(() => {
    let list = rows;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r =>
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_code.toLowerCase().includes(q) ||
        (r.receipt_number && r.receipt_number.toLowerCase().includes(q)) ||
        (r.payment_method && r.payment_method.toLowerCase().includes(q))
      );
    }
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * dir;
      }
      return ((Number(aVal) || 0) - (Number(bVal) || 0)) * dir;
    });
  }, [rows, searchQuery, sortKey, sortDirection]);

  const totals = useMemo(() => {
    return { totalAmount: filtered.reduce((s, r) => s + r.amount, 0) };
  }, [filtered]);

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

  const dateRangeLabel =
    dateFrom || dateTo
      ? `Date range: ${dateFrom || 'start'} to ${dateTo || 'today'}`
      : 'Date range: all time';

  const exportRows = (money: (value: number) => string) =>
    filtered.map(p => [
      formatDateTime(p.payment_date),
      p.customer_name,
      p.customer_code,
      money(p.amount),
      p.payment_method ? p.payment_method.replace(/_/g, ' ') : '',
      p.receipt_number || '',
      p.notes || '',
      p.staff_name || '',
    ]);

  const exportFooter = (money: (value: number) => string) => [
    '',
    `TOTALS (${filtered.length})`,
    '',
    money(totals.totalAmount),
    '',
    '',
    '',
    '',
  ];

  const plain = (value: number) => value.toFixed(2);

  const exportCsv = () => {
    downloadCsv(
      'payments_received_report',
      buildCsv(EXPORT_HEADERS, exportRows(plain), exportFooter(plain))
    );
  };

  const exportPdfFile = () => {
    exportPdf({
      title: 'Payments Received Report',
      subtitle: dateRangeLabel,
      filename: 'payments_received_report',
      headers: EXPORT_HEADERS,
      rows: exportRows(formatCurrency),
      footer: exportFooter(formatCurrency),
      rightAlignColumns: [3],
    });
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const Sort = ({ column }: { column: SortKey }) => {
    const active = column === sortKey;
    return (
      <button
        onClick={() => toggleSort(column)}
        className="inline-flex items-center gap-1 ml-1 align-middle"
        title={`Sort by ${column}`}
      >
        {active ? (sortDirection === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ArrowUpDown size={13} className="text-gray-400" />}
      </button>
    );
  };

  if (isLoading) return <Card className="p-6 text-gray-500">Loading payments...</Card>;
  if (error) return <Card className="p-6 text-red-600">{(error as Error).message}</Card>;

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
        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
        <ExportMenu
          onExportCsv={exportCsv}
          onExportPdf={exportPdfFile}
          disabled={filtered.length === 0}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-2">Date & Time <Sort column="payment_date" /></th>
              <th className="px-3 py-2">Customer Name <Sort column="customer_name" /></th>
              <th className="px-3 py-2 text-right">Amount <Sort column="amount" /></th>
              <th className="px-3 py-2">Payment Method</th>
              <th className="px-3 py-2">Receipt Number</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Recorded By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(p.payment_date)}</td>
                <td className="px-3 py-2">
                  <Link to={`/customers/${p.customer_id}`} className="text-primary-600 hover:underline font-medium">
                    {p.customer_name}
                  </Link>
                  <div className="text-xs text-gray-500">{p.customer_code}</div>
                </td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(p.amount)}</td>
                <td className="px-3 py-2 capitalize">{p.payment_method ? p.payment_method.replace(/_/g, ' ') : '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{p.receipt_number || '—'}</td>
                <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{p.notes || '—'}</td>
                <td className="px-3 py-2">{p.staff_name || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">No payments match the current filters.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 font-semibold">
              <td colSpan={2} className="px-3 py-2 text-gray-900">Totals ({filtered.length} {filtered.length === 1 ? 'payment' : 'payments'})</td>
              <td className="px-3 py-2 text-right">{formatCurrency(totals.totalAmount)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}