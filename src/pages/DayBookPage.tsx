import { useState } from 'react';
import { Skeleton } from '../components/ui/Skeleton';
import { useDayBook } from '../hooks/useApi';
import { formatCurrency } from '../lib/utils';
import { DayBookByMethod, DayBookByStaff, DayBookStat } from '../components/daybook/DayBookCards';

import type { DayBook } from '../components/daybook/DayBookCards';
import { formatDayBookRate } from '../components/daybook/DayBookCards';

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A5 — Daily close. Reads the get-day-book edge function through a cached
 * query; useDayBook falls back to computing the figures on the device from
 * three other endpoints if that function is ever unavailable.
 */
export function DayBookPage() {
  const [day, setDay] = useState(todayKey());
  const query = useDayBook(day);
  const data = (query.data?.book ?? null) as DayBook | null;
  const source: 'server' | 'local' = query.data?.source ?? 'server';
  // Only skeleton when there is nothing to show. A refetch, or moving to a
  // date already in the cache, keeps the previous figures on screen.
  const loading = !data && query.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Day-book</h1>
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

