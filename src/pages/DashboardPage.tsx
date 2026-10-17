import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatCurrency } from '../lib/utils';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { EntryDetailModal } from '../components/modals/EntryDetailModal';
import { PaymentDetailModal } from '../components/modals/PaymentDetailModal';
import { CustomerLedgerModal } from '../components/modals/CustomerLedgerModal';
import { Skeleton, SkeletonCard, SkeletonChart, SkeletonListItem, SkeletonButton } from '../components/ui/Skeleton';
import { useWhatsAppCustomer } from '../hooks/useWhatsAppCustomer';
import { WeeklyTrendChart } from '../components/dashboard/WeeklyTrendChart';
import { AgingReportWidget } from '../components/dashboard/AgingReportWidget';
import { AIScanButton } from '../components/ai/AIScanButton';
import { useTopCustomersMonth, useDashboardStats, useDeleteEntry, useDeletePayment, usePendingPaymentsCount } from '../hooks/useApi';
import { useToastStore } from '../store/toastStore';
import { useActionProgress } from '../hooks/useActionProgress';
import { IndianRupee, Users, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { isApprovedPayment } from '../types';

interface DashboardStats {
  totalOutstanding: number;
  totalCustomers: number;
  customerSplit?: {
    total: number;
    withDues: number;
    withoutDues: number;
  };
  overdueCount: number;
  recentEntries: any[];
  topDebtors: any[];
  recentPayments: any[];
  last30Days: Array<{
    date: string;
    credit_given: number;
    collection: number;
  }>;
  totalCreditLast30: number;
  totalCollectionLast30: number;
  alerts: {
    largeOutstanding: Array<{
      customer_id: string;
      customer_name: string;
      customer_code: string;
      balance: number;
    }>;
    overdueEntries: Array<{
      id: string;
      entry_code: string;
      customer_id: string;
      customer_name: string;
      customer_phone: string | null;
      balance: number;
      days_overdue: number;
      status: string;
      created_at: string;
    }>;
  };
}

interface EntryDetail {
  entry: {
    id: string;
    entry_code: string;
    customer_id: string;
    customer_name: string;
    customer_code: string;
    customer_phone: string;
    entry_mode: string;
    description: string | null;
    total_amount: number;
    paid_amount: number;
    balance: number;
    status: string;
    photo_url: string | null;
    notes: string | null;
    created_by: string;
    created_at: string;
    staff_name: string | null;
    staff_role: string | null;
    items: any[];
    attachments: any[];
  };
}

export function DashboardPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const statsQuery = useDashboardStats();
  const pendingCount = usePendingPaymentsCount(isAdmin).data ?? 0;
  const deleteEntry = useDeleteEntry();
  const deletePayment = useDeletePayment();
  // The hold-to-delete confirmations in the two detail modals report their
  // outcome through these.
  const entryDeleteProgress = useActionProgress();
  const paymentDeleteProgress = useActionProgress();
  const { openWhatsAppOverdue } = useWhatsAppCustomer();
  const addToast = useToastStore((s) => s.addToast);
  const [selectedEntry, setSelectedEntry] = useState<EntryDetail | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const topCustomers = useTopCustomersMonth();
  const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);

  const stats = statsQuery.data as DashboardStats | undefined;
  const loading = statsQuery.isLoading;
  const error = (statsQuery.error as Error)?.message || null;

  const handleEntryClick = async (entryId: string) => {
    try {
      const response = await api.getEntry(entryId);
      if (response.ok) {
        const data = await response.json();
        setSelectedEntry(data);
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Entry details failed', description: err instanceof Error ? err.message : 'Failed to load entry details' });
    }
  };

  const handlePaymentClick = async (paymentId: string) => {
    try {
      // No get-payment endpoint: read it off the customer. Goes through
      // apiCall so an ended session logs out like every other request.
      const customerId = stats?.recentPayments.find(p => p.id === paymentId)?.customer_id;
      if (!customerId) return;
      const response = await api.getCustomer(customerId);

      if (response.ok) {
        const data = await response.json();
        const payment = data.payments?.find((p: any) => p.id === paymentId);
        if (payment) {
          setSelectedPayment(payment);
        }
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Payment details failed', description: err instanceof Error ? err.message : 'Failed to load payment details' });
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Access denied. Admin only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>

        {/* KPI Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        {/* Chart Skeleton */}
        <SkeletonChart />

        {/* Quick Actions Skeleton */}
        <Card>
          <Skeleton className="h-5 w-1/4 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SkeletonButton className="w-full" />
            <SkeletonButton className="w-full" />
            <SkeletonButton className="w-full" />
            <SkeletonButton className="w-full" />
          </div>
        </Card>

        {/* Recent Entries & Payments Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <Skeleton className="h-5 w-1/3 mb-4" />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
          <Card>
            <Skeleton className="h-5 w-1/3 mb-4" />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </Card>
        </div>

        {/* Top Debtors Skeleton */}
        <Card>
          <Skeleton className="h-5 w-1/4 mb-4" />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </Card>

        {/* Alerts Skeleton */}
        <Card>
          <Skeleton className="h-5 w-1/6 mb-4" />
          <SkeletonListItem />
          <SkeletonListItem />
        </Card>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">{error || 'Failed to load dashboard data.'}</p>
        {error && (
          <button
            onClick={() => statsQuery.refetch()}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors focus-ring"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Total Customers balance split (get_dashboard_stats_v2 -> customerSplit).
  // The RPC omits the key until migration 022 is applied, so fall back to a
  // shape with no split data and let the card render just the headline count.
  const split = stats?.customerSplit ?? { total: 0, withDues: 0, withoutDues: 0 };
  const splitCounted = split.withDues + split.withoutDues;
  // Percentages are relative to the customers the split actually covers, so a
  // partially-populated split can never render a bar that overshoots 100%.
  const splitBase = splitCounted > 0 ? splitCounted : split.total;
  const withDuesPct = splitBase > 0 ? Math.round((split.withDues / splitBase) * 100) : 0;
  const showSplit = splitCounted > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>

      {/* Staff payments waiting for review. They count nowhere until approved,
          so this sits above the numbers it will change. */}
      {pendingCount > 0 && (
        <Link
          to="/approvals"
          className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 hover:border-amber-300 dark:hover:border-amber-800 transition-colors focus-ring"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <ClipboardCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-amber-900 dark:text-amber-100">
              {pendingCount === 1 ? '1 payment is' : `${pendingCount} payments are`} waiting for your approval
            </div>
            <div className="text-sm text-amber-800 dark:text-amber-200">
              Recorded by staff. Not counted in balances or reports until approved.
            </div>
          </div>
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-200 whitespace-nowrap">Review →</span>
        </Link>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              <IndianRupee size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Outstanding (Receivable)</div>
              <div className="mt-0.5 text-2xl font-bold tnum text-gray-900 dark:text-white">
                {formatCurrency(stats.totalOutstanding)}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-300">
              <Users size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Customers</div>
              <div className="mt-0.5 text-2xl font-bold tnum text-gray-900 dark:text-white">
                {stats.totalCustomers}
              </div>
            </div>
          </div>
          {/* Balance split of the customer book: who owes money vs who is clear.
              Drill-down reuses the existing list_customers filters ('outstanding'
              / 'paid'), so these numbers always match the Customers page. */}
          {showSplit && (
            <div className="mt-3">
              <div
                className="flex h-1.5 overflow-hidden rounded-full bg-gray-900/10 dark:bg-white/10"
                aria-label={`${split.withDues} customers with dues, ${split.withoutDues} with no dues`}
              >
                <div className="h-full bg-emerald-500" style={{ width: `${withDuesPct}%` }} />
                <div className="h-full bg-gray-300 dark:bg-gray-600" style={{ width: `${100 - withDuesPct}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => navigate('/customers?filter=outstanding')}
                  title="View customers with an outstanding balance"
                  className="focus-ring -ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span className="font-medium">Has dues</span>
                  <span className="font-bold tnum">{split.withDues}</span>
                  <span className="tnum text-gray-500 dark:text-gray-400">{withDuesPct}%</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/customers?filter=paid')}
                  title="View customers with no dues"
                  className="focus-ring -mr-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/60"
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
                  <span className="font-medium">No dues</span>
                  <span className="font-bold tnum">{split.withoutDues}</span>
                  <span className="tnum text-gray-500 dark:text-gray-400">{100 - withDuesPct}%</span>
                </button>
              </div>
            </div>
          )}

        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Overdue Entries</div>
              <div className="mt-0.5 text-2xl font-bold tnum text-red-600 dark:text-red-400">
                {stats.overdueCount}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Aging Report Widget */}
      {(stats as any).aging && (
        <AgingReportWidget aging={(stats as any).aging} />
      )}

      {/* Last 30 Days Analytics */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Last 30 Days</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-lg p-4 min-w-0">
            <div className="text-sm text-indigo-700 dark:text-indigo-300">Total Credit Given</div>
            <div className="text-2xl max-md:text-lg font-bold tnum break-words text-indigo-900 dark:text-indigo-200">{formatCurrency(stats.totalCreditLast30 ?? 0)}</div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg p-4 min-w-0">
            <div className="text-sm text-emerald-700 dark:text-emerald-300">Total Collection</div>
            <div className="text-2xl max-md:text-lg font-bold tnum break-words text-emerald-900 dark:text-emerald-200">{formatCurrency(stats.totalCollectionLast30 ?? 0)}</div>
          </div>
        </div>

        <WeeklyTrendChart days={stats.last30Days ?? []} />
      </Card>

      {/* Quick Actions */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/customers">
            <Button className="w-full" variant="secondary">
              + Add Customer
            </Button>
          </Link>
          <Link to="/add-credit">
            <Button className="w-full" variant="secondary">
              + Add Credit Entry
            </Button>
          </Link>
          <Link to="/payment-received">
            <Button className="w-full">
              + Payment Received
            </Button>
          </Link>
          <AIScanButton variant="secondary" className="w-full" />
        </div>
      </Card>

      {/* Recent Credit Entries & Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Credit Entries */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Credit Entries</h2>
          {(stats.recentEntries ?? []).length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No recent entries.</p>
          ) : (
            <div className="space-y-2">
              {(stats.recentEntries ?? []).slice(0, 4).map((entry: any) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2 px-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded transition-colors"
                  onClick={() => handleEntryClick(entry.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{entry.entry_code}</div>
                    <div className="font-medium text-gray-900 dark:text-white text-sm">{entry.customer_name}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    <div className="font-semibold text-sm">{formatCurrency(entry.total_amount)}</div>
                    <Badge variant={entry.status === 'paid' ? 'success' : entry.status === 'partial' ? 'warning' : 'danger'} className="text-xs">
                      {entry.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Payments */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Payments</h2>
          {(stats.recentPayments ?? []).length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No recent payments.</p>
          ) : (
            <div className="space-y-2">
              {(stats.recentPayments ?? []).slice(0, 4).map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between py-2 px-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded transition-colors"
                  onClick={() => handlePaymentClick(payment.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {new Date(payment.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="font-medium text-gray-900 dark:text-white text-sm">{payment.customer_name}</div>
                    {payment.payment_method && (
                      <div className="text-xs text-gray-400 capitalize">
                        {payment.payment_method.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-2">
                    <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(payment.amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Debtors */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Debtors</h2>
          {(stats.topDebtors ?? []).length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No outstanding balances.</p>
          ) : (
            <div className="space-y-3">
              {(stats.topDebtors ?? []).map((debtor: any) => (
                <button
                  key={debtor.id}
                  onClick={() => setSelectedDebtorId(debtor.id)}
                  className="flex items-center justify-between py-2 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded px-2 -mx-2 transition-colors w-full text-left focus-ring"
                >
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{debtor.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{debtor.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(debtor.balance)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

      {/* Top Customers This Month */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Top Customers This Month</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">By credit given since the 1st</p>
        {topCustomers.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : topCustomers.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">Could not load this list.</p>
        ) : (topCustomers.data?.customers ?? []).length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No credit given yet this month.</p>
        ) : (
          <div className="space-y-3">
            {(topCustomers.data.customers as any[]).map((c, i) => {
              const top = Number(topCustomers.data.customers[0].credit_given) || 1;
              const share = topCustomers.data.monthTotal > 0
                ? Math.round((c.credit_given / topCustomers.data.monthTotal) * 100)
                : 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedDebtorId(c.id)}
                  className="w-full text-left rounded px-2 -mx-2 py-2 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors focus-ring"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate">{i + 1}. {c.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {c.code} · {c.bills} {c.bills === 1 ? 'bill' : 'bills'} · {share}% of month
                      </div>
                    </div>
                    <div className="font-semibold tnum text-indigo-700 dark:text-indigo-300 whitespace-nowrap">{formatCurrency(c.credit_given)}</div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400" style={{ width: `${(c.credit_given / top) * 100}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      </div>

      {/* Alerts */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Alerts</h2>
        {(stats.alerts?.largeOutstanding ?? []).length === 0 && (stats.alerts?.overdueEntries ?? []).length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">No alerts at the moment.</p>
        ) : (
          <div className="space-y-4">
            {/* Large Outstanding */}
            {(stats.alerts?.largeOutstanding ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Large Outstanding Customers</h3>
                <div className="space-y-2">
                  {(stats.alerts?.largeOutstanding ?? []).map((customer) => (
                    <Link
                      key={customer.customer_id}
                      to={`/customers/${customer.customer_id}`}
                      className="flex items-center justify-between py-2 px-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white text-sm">{customer.customer_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{customer.customer_code}</div>
                      </div>
                      <div className="font-semibold text-red-700 dark:text-red-300 text-sm">{formatCurrency(customer.balance)}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Overdue Entries */}
            {(stats.alerts?.overdueEntries ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Overdue Entries</h3>
                <div className="space-y-2">
                  {(stats.alerts?.overdueEntries ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                      onClick={() => handleEntryClick(entry.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{entry.entry_code}</div>
                        <div className="font-medium text-gray-900 dark:text-white text-sm">{entry.customer_name}</div>
                        <div className="text-xs text-red-600 dark:text-red-400 font-medium">{entry.days_overdue} days overdue</div>
                      </div>
                      <div className="text-right ml-2 flex items-center space-x-2">
                        <div>
                          <div className="font-semibold text-sm text-red-700 dark:text-red-300">{formatCurrency(entry.balance)}</div>
                        </div>
                        {(
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openWhatsAppOverdue(entry.customer_id, entry.customer_phone, entry.customer_name, entry.balance, entry.created_at, 'en');
                              }}
                              className="px-2 py-0.5 bg-[#25D366] hover:bg-[#20bd5a] text-slate-900 font-semibold rounded text-xs transition-colors shadow-xs focus-ring"
                              title="Send WhatsApp reminder (English)"
                            >
                              EN
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openWhatsAppOverdue(entry.customer_id, entry.customer_phone, entry.customer_name, entry.balance, entry.created_at, 'ta');
                              }}
                              className="px-2 py-0.5 bg-[#25D366] hover:bg-[#20bd5a] text-slate-900 font-semibold rounded text-xs transition-colors shadow-xs focus-ring"
                              title="Send WhatsApp reminder (Tamil)"
                            >
                              தமிழ்
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <EntryDetailModal
          entry={{
            ...selectedEntry.entry,
            entry_mode: selectedEntry.entry.entry_mode as 'detailed' | 'quick',
            description: selectedEntry.entry.description || undefined,
            status: selectedEntry.entry.status as 'unpaid' | 'partial' | 'paid',
            photo_url: selectedEntry.entry.photo_url || undefined,
            notes: selectedEntry.entry.notes || undefined,
            staff_name: selectedEntry.entry.staff_name || undefined,
            staff_role: selectedEntry.entry.staff_role || undefined,
            items: selectedEntry.entry.items || [],
            attachments: selectedEntry.entry.attachments || [],
          }}
          customerName={selectedEntry.entry.customer_name}
          onClose={() => setSelectedEntry(null)}
          onModify={() => navigate(`/add-credit?entry_id=${selectedEntry.entry.id}`)}
          deleteStatus={entryDeleteProgress.status}
          onDelete={async () => {
            entryDeleteProgress.start();
            try {
              await deleteEntry.mutateAsync(selectedEntry.entry.id as any);
              await entryDeleteProgress.succeed();
              setSelectedEntry(null);
            } catch (err) {
              entryDeleteProgress.fail();
              useToastStore.getState().addToast({
                type: 'error',
                title: 'Could not delete entry',
                description: err instanceof Error && err.message ? err.message : 'Please try again',
              });
            }
          }}
        />
      )}

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onModify={isApprovedPayment(selectedPayment)
            ? () => navigate(`/payment-received/${selectedPayment.customer_id}/edit/${selectedPayment.id}`)
            : undefined}
          deleteStatus={paymentDeleteProgress.status}
          onDelete={async () => {
            paymentDeleteProgress.start();
            try {
              await deletePayment.mutateAsync(selectedPayment.id as any);
              await paymentDeleteProgress.succeed();
              setSelectedPayment(null);
            } catch (err) {
              paymentDeleteProgress.fail();
              useToastStore.getState().addToast({
                type: 'error',
                title: 'Could not delete payment',
                description: err instanceof Error && err.message ? err.message : 'Please try again',
              });
            }
          }}
        />
      )}

      {/* Customer Ledger Modal */}
      <CustomerLedgerModal
        customerId={selectedDebtorId}
        onClose={() => setSelectedDebtorId(null)}
      />
    </div>
  );
}


