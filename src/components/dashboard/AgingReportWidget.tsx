import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { formatCurrency } from '../../lib/utils';

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
    { key: 'days0to7', label: '0-7 Days', data: aging.days0to7, color: 'green' as const },
    { key: 'days8to14', label: '8-14 Days', data: aging.days8to14, color: 'emerald' as const },
    { key: 'days15to21', label: '15-21 Days', data: aging.days15to21, color: 'lime' as const },
    { key: 'days22to30', label: '22-30 Days', data: aging.days22to30, color: 'yellow' as const },
    { key: 'days31to40', label: '31-40 Days', data: aging.days31to40, color: 'orange' as const },
    { key: 'days41plus', label: '41+ Days', data: aging.days41plus, color: 'red' as const },
  ]

  const total = aging.days0to7.total + aging.days8to14.total + aging.days15to21.total + aging.days22to30.total + aging.days31to40.total + aging.days41plus.total

  const colorClasses = {
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', subtext: 'text-green-600', bar: 'bg-green-500' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', subtext: 'text-emerald-600', bar: 'bg-emerald-500' },
    lime: { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', subtext: 'text-lime-600', bar: 'bg-lime-500' },
    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', subtext: 'text-yellow-600', bar: 'bg-yellow-500' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', subtext: 'text-orange-600', bar: 'bg-orange-500' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', subtext: 'text-red-600', bar: 'bg-red-500' },
  }

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Aging Report</h2>
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
        <Modal isOpen onClose={() => setSelectedBucket(null)} title={`${selectedBucket.label} — ${formatCurrency(selectedBucket.total)} outstanding`} size="md">
          <div className="space-y-2">
            {selectedBucket.customers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No customers in this range.</p>
            ) : (
              <div className="space-y-2">
                {selectedBucket.customers.map((customer) => (
                  <Link
                    key={customer.customer_id}
                    to={`/customers/${customer.customer_id}`}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                    onClick={() => setSelectedBucket(null)}
                  >
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{customer.name}</div>
                      <div className="text-xs text-gray-500">{customer.code}</div>
                    </div>
                    <div className="font-semibold text-sm text-gray-900">{formatCurrency(customer.amount)}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}