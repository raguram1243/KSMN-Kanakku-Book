import { useEffect, useState } from 'react';
import { Skeleton } from '../components/ui/Skeleton';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { DayBookByMethod, DayBookByStaff, DayBookStat } from '../components/daybook/DayBookCards';

import type { DayBook } from '../components/daybook/DayBookCards';
import { formatDayBookRate } from '../components/daybook/DayBookCards';

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A5 — Daily close. Tries the get-day-book edge function (migration 021);
 * falls back to get-today-stats + entries/payments reports client-side so
 * the page works before the backend is deployed.
 */
export function DayBookPage() {
  const [day, setDay] = useState(todayKey());
  const [data, setData] = useState<DayBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'server' | 'local'>('server');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.getDayBook(day);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) { setData(json); setSource('server'); }
          return;
        }
      } catch { /* fall through to local */ }
      try {
        const [statsRes, entriesRes, payRes] = await Promise.all([
          api.getTodayStats(), api.getEntriesReport(day, day), api.getPaymentsReport(day, day),
        ]);
        const stats = statsRes.ok ? await statsRes.json() : {};
        const entries = entriesRes.ok ? await entriesRes.json() : {};
        const pays = payRes.ok ? await payRes.json() : {};
        const entryList: any[] = entries.entries ?? [];
        const payList: any[] = pays.payments ?? [];
        const credit = entryList.reduce((s, e) => s + Number(e.total_amount || 0), 0);
        const coll = payList.reduce((s, p) => s + Number(p.amount || 0), 0);
        const byMethod = new Map<string, { count: number; total: number }>();
        for (const p of payList) {
          const m = p.payment_method || 'unknown';
          const cur = byMethod.get(m) || { count: 0, total: 0 };
          cur.count += 1; cur.total += Number(p.amount || 0);
          byMethod.set(m, cur);
        }
        if (!cancelled) {
          setData({
            day,
            credit_total: credit || Number(stats.todayEntriesTotalSum || 0),
            credit_count: entryList.length || Number(stats.todayEntriesCount || 0),
            collection_total: coll,
            collection_count: payList.length,
            net: credit - coll,
            by_method: [...byMethod.entries()].map(([method, v]) => ({ method, ...v })),
            by_staff: [],
          });
          setSource('local');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [day]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Day-book</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Daily close: credit given vs collection{source === 'local' ? ' (computed on device)' : ''}.</p>
        </div>
        <input type="date" value={day} max={todayKey()} onChange={(e) => e.target.value && setDay(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>

      {loading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DayBookStat label="Credit given" value={formatCurrency(data.credit_total)} sub={`${data.credit_count} entries`} tone="blue" />
            <DayBookStat label="Collection" value={formatCurrency(data.collection_total)} sub={`${data.collection_count} payments`} tone="green" />
            <DayBookStat label="Net (credit − collection)" value={formatCurrency(data.net)} sub={data.day} />
            <DayBookStat label="Collection rate" value={formatDayBookRate(data.credit_total, data.collection_total)} sub="of credit given" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DayBookByMethod rows={data.by_method} day={data.day} />
            <DayBookByStaff rows={data.by_staff} />
          </div>
        </>
      )}
    </div>
  );
}

