import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { formatCurrency } from '../../lib/utils';
import { PaginationControls } from '../ui/PaginationControls';
import { useClientPagination } from '../../hooks/useClientPagination';

interface CustomerBreakdown {
  customer_id: string;
  name: string;
  code: string;
  amount: number;
}

interface AgingBucket {
  total: number;
  customers: CustomerBreakdown[];
}

interface AgingReportWidgetProps {
  aging: {
    days0to7: AgingBucket;
    days8to14: AgingBucket;
    days15to21: AgingBucket;
    days22to30: AgingBucket;
    days31to40: AgingBucket;
    days41plus: AgingBucket;
  };
}

export function AgingReportWidget({ aging }: AgingReportWidgetProps) {
  const [selectedBucket, setSelectedBucket] = useState<{ label: string; total: number; customers: CustomerBreakdown[] } | null>(null)

  const buckets = [
    { key: 'days0to7', label: '0-7 Days', data: aging.days0to7, color: 'fresh' as const },
    { key: 'days8to14', label: '8-14 Days', data: aging.days8to14, color: 'normal' as const },
    { key: 'days15to21', label: '15-21 Days', data: aging.days15to21, color: 'dueSoon' as const },
    { key: 'days22to30', label: '22-30 Days', data: aging.days22to30, color: 'attention' as const },
    { key: 'days31to40', label: '31-40 Days', data: aging.days31to40, color: 'warning' as const },
    { key: 'days41plus', label: '41+ Days', data: aging.days41plus, color: 'critical' as const },
  ]

  const total = aging.days0to7.total + aging.days8to14.total + aging.days15to21.total + aging.days22to30.total + aging.days31to40.total + aging.days41plus.total

  // Clean 6-step chromatic severity ramp: deep-emerald -> amber -> orange -> deep-red
  const colorClasses = {
    fresh: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-200 dark:border-emerald-800/60',
      text: 'text-emerald-800 dark:text-emerald-200',
      subtext: 'text-emerald-600 dark:text-emerald-400',
      bar: 'bg-emerald-500',
    },
    normal: {
      bg: 'bg-teal-50 dark:bg-teal-950/40',
      border: 'border-teal-200 dark:border-teal-800/60',
      text: 'text-teal-800 dark:text-teal-200',
      subtext: 'text-teal-600 dark:text-teal-400',
      bar: 'bg-teal-500',
    },
    dueSoon: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-200 dark:border-amber-800/60',
      text: 'text-amber-800 dark:text-amber-200',
      subtext: 'text-amber-600 dark:text-amber-400',
      bar: 'bg-amber-500',
    },
    attention: {
      bg: 'bg-amber-100 dark:bg-amber-950/70',
      border: 'border-amber-300 dark:border-amber-700/70',
      text: 'text-amber-900 dark:text-amber-100',
      subtext: 'text-amber-700 dark:text-amber-300',
      bar: 'bg-amber-600',
    },
    warning: {
      bg: 'bg-orange-50 dark:bg-orange-950/40',
      border: 'border-orange-200 dark:border-orange-800/60',
      text: 'text-orange-800 dark:text-orange-200',
      subtext: 'text-orange-600 dark:text-orange-400',
      bar: 'bg-orange-500',
    },
    critical: {
      bg: 'bg-red-50 dark:bg-red-950/40',
      border: 'border-red-200 dark:border-red-800/60',
      text: 'text-red-800 dark:text-red-200',
      subtext: 'text-red-600 dark:text-red-400',
      bar: 'bg-red-500',
    },
  }

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Aging Report</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {buckets.map((bucket) => {
            const pct = total > 0 ? (bucket.data.total / total) * 100 : 0
            const colors = colorClasses[bucket.color]
            return (
              <div
                key={bucket.key}
                onClick={() => setSelectedBucket({ label: bucket.label, total: bucket.data.total, customers: bucket.data.customers })}
                className={`${colors.bg} border ${colors.border} rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow`}
              >
                <div className={`text-xs font-medium ${colors.text} mb-1`}>{bucket.label}</div>
                <div className={`text-xl font-bold ${colors.text}`}>
                  {formatCurrency(bucket.data.total)}
                </div>
                <div className={`text-xs ${colors.subtext} mt-1`}>
                  {pct.toFixed(1)}%
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {selectedBucket && (
        <BucketDialog bucket={selectedBucket} onClose={() => setSelectedBucket(null)} />
      )}
    </>
  )
}

const PAGE_SIZE = 25;

/** Customers in one aging bucket. A bucket can hold most of the ledger, so it pages at 25. */
function BucketDialog({
  bucket,
  onClose,
}: {
  bucket: { label: string; total: number; customers: CustomerBreakdown[] };
  onClose: () => void;
}) {
  const pager = useClientPagination(bucket.customers, PAGE_SIZE, bucket.label);

  return (
    <Modal isOpen onClose={onClose} title={`${bucket.label} — ${formatCurrency(bucket.total)} outstanding`} size="md">
      {bucket.customers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No customers in this range.</p>
      ) : (
        <>
          <div className="space-y-2">
            {pager.pageRows.map((customer) => (
              <Link
                key={customer.customer_id}
                to={`/customers/${customer.customer_id}`}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={onClose}
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-white text-sm">{customer.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{customer.code}</div>
                </div>
                <div className="font-semibold text-sm text-gray-900 dark:text-white">{formatCurrency(customer.amount)}</div>
              </Link>
            ))}
          </div>
          {pager.total > PAGE_SIZE && (
            <PaginationControls
              page={pager.page}
              totalPages={pager.totalPages}
              pageSize={pager.pageSize}
              total={pager.total}
              onPageChange={pager.setPage}
            />
          )}
        </>
      )}
    </Modal>
  );
}
