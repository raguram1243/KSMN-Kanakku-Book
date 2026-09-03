import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { ExportMenu } from '../components/ui/ExportMenu';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency, formatDateTime, getStatusColor } from '../lib/utils';
import { useEntriesReport } from '../hooks/useApi';
import { DateRangeFilter } from '../components/reports/DateRangeFilter';
import { buildCsv, downloadCsv } from '../lib/exportCsv';
import { exportPdf } from '../lib/exportPdf';

type SortKey = 'created_at' | 'entry_code' | 'customer_name' | 'total_amount' | 'balance';

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

export default function ReportEntriesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error } = useEntriesReport(dateFrom, dateTo);

  const rows: EntryRow[] = useMemo(() => {
    const entries = data?.entries ?? [];
    return entries.map((e: any) => ({
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

  const filtered = useMemo(() => {
    let list = rows;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r =>
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_code.toLowerCase().includes(q) ||
        r.entry_code.toLowerCase().includes(q)
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
    return {
      totalAmount: filtered.reduce((s, r) => s + r.total_amount, 0),
      totalPaid: filtered.reduce((s, r) => s + r.paid_amount, 0),
      totalBalance: filtered.reduce((s, r) => s + r.balance, 0),
    };
  }, [filtered]);

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

  const dateRangeLabel =
    dateFrom || dateTo
      ? `Date range: ${dateFrom || 'start'} to ${dateTo || 'today'}`
      : 'Date range: all time';

  const exportRows = (money: (value: number) => string) =>
    filtered.map(r => [
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
    `TOTALS (${filtered.length})`,
    '',
    '',
    money(totals.totalAmount),
    money(totals.totalPaid),
    money(totals.totalBalance),
    '',
  ];

  const plain = (value: number) => value.toFixed(2);

  const exportCsv = () => {
    downloadCsv(
      'credit_entries_report',
      buildCsv(EXPORT_HEADERS, exportRows(plain), exportFooter(plain))
    );
  };

  const exportPdfFile = () => {
    exportPdf({
      title: 'Credit Entries Report',
      subtitle: dateRangeLabel,
      filename: 'credit_entries_report',
      headers: EXPORT_HEADERS,
      rows: exportRows(formatCurrency),
      footer: exportFooter(formatCurrency),
      rightAlignColumns: [5, 6, 7],
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

    if (isLoading) return <Card className="p-6 text-gray-500 dark:text-gray-400">Loading entries...</Card>;
  if (error) return <Card className="p-6 text-red-600 dark:text-red-400">{(error as Error).message}</Card>;

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
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <th className="px-3 py-2">Date & Time <Sort column="created_at" /></th>
              <th className="px-3 py-2">Entry Code <Sort column="entry_code" /></th>
              <th className="px-3 py-2">Customer Name <Sort column="customer_name" /></th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Total Amount <Sort column="total_amount" /></th>
              <th className="px-3 py-2 text-right">Paid Amount</th>
              <th className="px-3 py-2 text-right">Balance <Sort column="balance" /></th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.entry_code}</td>
                <td className="px-3 py-2">
                  <Link to={`/customers/${r.customer_id}`} className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                    {r.customer_name}
                  </Link>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{r.customer_code}</div>
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{r.description || '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.total_amount)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.paid_amount)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.balance)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(r.status)}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">No entries match the current filters.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
              <td colSpan={4} className="px-3 py-2 text-gray-900 dark:text-white">Totals ({filtered.length} {filtered.length === 1 ? 'entry' : 'entries'})</td>
              <td className="px-3 py-2 text-right">{formatCurrency(totals.totalAmount)}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(totals.totalPaid)}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(totals.totalBalance)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
