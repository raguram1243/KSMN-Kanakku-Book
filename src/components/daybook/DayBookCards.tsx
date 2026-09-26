import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { formatCurrency } from '../../lib/utils';

export interface DayBook {
  day: string;
  credit_total: number;
  credit_count: number;
  collection_total: number;
  collection_count: number;
  net: number;
  by_method: Array<{ method: string; count: number; total: number }>;
  by_staff: Array<{ staff_name: string | null; entries: number; credit_given: number }>;
}

export function DayBookStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'blue' | 'green' | 'plain' }) {
  const color = tone === 'blue' ? 'text-blue-700 dark:text-blue-300' : tone === 'green' ? 'text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-white';
  return (
    <Card>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </Card>
  );
}

export function DayBookByMethod({ rows, day }: { rows: DayBook['by_method']; day: string }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">By payment mode</h2>
      {rows.length === 0 ? <EmptyState title="No collections" description={`No payments recorded on ${day}.`} /> : (
        <div className="space-y-2">
          {rows.map((m) => (
            <div key={m.method} className="flex items-center justify-between py-2 border-b last:border-b-0">
              <span className="text-sm capitalize text-gray-700 dark:text-gray-300">{m.method.replace('_', ' ')} • {m.count}</span>
              <span className="font-semibold text-sm text-gray-900 dark:text-white">{formatCurrency(m.total)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function DayBookByStaff({ rows }: { rows: DayBook['by_staff'] }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">By staff (entries)</h2>
      {rows.length === 0 ? <EmptyState title="No breakdown" description="Staff split needs the server day-book (migration 021)." /> : (
        <div className="space-y-2">
          {rows.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-b-0">
              <span className="text-sm text-gray-700 dark:text-gray-300">{s.staff_name || 'Unknown'} • {s.entries}</span>
              <span className="font-semibold text-sm text-gray-900 dark:text-white">{formatCurrency(s.credit_given)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function formatDayBookRate(credit: number, coll: number): string {
  if (credit <= 0) return '—';
  return `${Math.min(100, (coll / credit) * 100).toFixed(0)}%`;
}
