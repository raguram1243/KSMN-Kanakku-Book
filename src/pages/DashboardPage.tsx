import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { api } from '../lib/api';
import { formatCurrency, debugError } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { EntryDetailModal } from '../components/modals/EntryDetailModal';
import { PaymentDetailModal } from '../components/modals/PaymentDetailModal';
import { CustomerLedgerModal } from '../components/modals/CustomerLedgerModal';
import { Skeleton, SkeletonCard, SkeletonChart, SkeletonListItem, SkeletonButton } from '../components/ui/Skeleton';
import { openWhatsAppReminder, buildOverdueReminderMessage } from '../lib/whatsapp';
import { AgingReportWidget } from '../components/dashboard/AgingReportWidget';
import { AIScanButton } from '../components/ai/AIScanButton';

interface DashboardStats {
  totalOutstanding: number;
  totalCustomers: number;
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
    created_at: string;
    items: any[];
  };
}

export function DashboardPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<EntryDetail | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadDashboardData();
    }
  }, [isAdmin]);

  const loadDashboardData = async () => {
    try {
      const response = await api.getDashboardStats();
      if (response.ok) {
        const data = await response.json();
        // Initialize with defaults to ensure all fields exist
        setStats({
          totalOutstanding: 0,
          totalCustomers: 0,
          overdueCount: 0,
          topDebtors: [],
          recentEntries: [],
          recentPayments: [],
          last30Days: [],
          totalCreditLast30: 0,
          totalCollectionLast30: 0,
          alerts: { largeOutstanding: [], overdueEntries: [] },
          ...data,
        });
      }
    } catch (error) {
      debugError('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEntryClick = async (entryId: string) => {
    try {
      const response = await api.getEntry(entryId);
      if (response.ok) {
        const data = await response.json();
        setSelectedEntry(data);
      }
    } catch (error) {
      debugError('Failed to load entry details:', error);
    }
  };

  const handlePaymentClick = async (paymentId: string) => {
    try {
      // Fetch payment details - for now we'll create a minimal payment object
      // In the future, you may want to add a dedicated get-payment endpoint
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-customer?id=${stats?.recentPayments.find(p => p.id === paymentId)?.customer_id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('ksmn_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const payment = data.payments?.find((p: any) => p.id === paymentId);
        if (payment) {
          setSelectedPayment(payment);
        }
      }
    } catch (error) {
      debugError('Failed to load payment details:', error);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Access denied. Admin only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

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
        <p className="text-gray-500">Failed to load dashboard data.</p>
      </div>
    );
  }

  // Calculate max value for chart scaling
  const maxChartValue = Math.max(
    ...(stats.last30Days ?? []).map(d => Math.max(d.credit_given, d.collection)),
    1 // Avoid division by zero
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-sm font-medium text-gray-600">Total Outstanding</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {formatCurrency(stats.totalOutstanding)}
          </div>
        </Card>

        <Card>
          <div className="text-sm font-medium text-gray-600">Total Customers</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {stats.totalCustomers}
          </div>
        </Card>

        <Card>
          <div className="text-sm font-medium text-gray-600">Overdue Entries</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {stats.overdueCount}
          </div>
        </Card>
      </div>

      {/* Aging Report Widget */}
      {(stats as any).aging && (
        <AgingReportWidget aging={(stats as any).aging} />
      )}

      {/* Last 30 Days Analytics */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Last 30 Days</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-700">Total Credit Given</div>
            <div className="text-2xl font-bold text-blue-900">{formatCurrency(stats.totalCreditLast30 ?? 0)}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-sm text-green-700">Total Collection</div>
            <div className="text-2xl font-bold text-green-900">{formatCurrency(stats.totalCollectionLast30 ?? 0)}</div>
          </div>
        </div>

        {/* Daily Bar Chart */}
        <div className="overflow-x-auto">
          <div className="flex space-x-1 min-w-[600px] h-40">
            {(stats.last30Days ?? []).map(day => (
              <div key={day.date} className="flex-1 flex flex-col items-center justify-end">
                <div className="relative w-full flex items-end space-x-0.5 h-32">
                  {/* Credit Given (blue) */}
                  <div
                    className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                    style={{ height: `${(day.credit_given / maxChartValue) * 100}%` }}
                    title={`Credit: ${formatCurrency(day.credit_given)}`}
                  />
                  {/* Collection (green) */}
                  <div
                    className="flex-1 bg-green-500 rounded-t hover:bg-green-600 transition-colors cursor-pointer"
                    style={{ height: `${(day.collection / maxChartValue) * 100}%` }}
                    title={`Collection: ${formatCurrency(day.collection)}`}
                  />
                </div>
                <span className="text-[10px] text-gray-500 mt-1 whitespace-nowrap">
                  {new Date(day.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center space-x-6 mt-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-gray-700">Credit Given</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-gray-700">Collection</span>
          </div>
        </div>
      </Card>

      {/* Quick Actions */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/customers">
            <Button className="w-full" variant="secondary">
              + Add Customer
            </Button>
          </Link>
          <Link to="/add-credit">
            <Button className="w-full" variant="secondary">
              + Add Credit
            </Button>
          </Link>
          <Link to="/record-payment">
            <Button className="w-full">
              + Record Payment
            </Button>
          </Link>
          <AIScanButton variant="secondary" className="w-full" />
        </div>
      </Card>

      {/* Recent Credit Entries & Recent Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Credit Entries */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Credit Entries</h2>
          {(stats.recentEntries ?? []).length === 0 ? (
            <p className="text-gray-500 text-sm">No recent entries.</p>
          ) : (
            <div className="space-y-2">
              {(stats.recentEntries ?? []).slice(0, 4).map((entry: any) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2 px-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 rounded transition-colors"
                  onClick={() => handleEntryClick(entry.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{entry.entry_code}</div>
                    <div className="text-xs text-gray-500 truncate">{entry.customer_name}</div>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Payments</h2>
          {(stats.recentPayments ?? []).length === 0 ? (
            <p className="text-gray-500 text-sm">No recent payments.</p>
          ) : (
            <div className="space-y-2">
              {(stats.recentPayments ?? []).slice(0, 4).map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between py-2 px-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 rounded transition-colors"
                  onClick={() => handlePaymentClick(payment.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">
                      {new Date(payment.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{payment.customer_name}</div>
                    {payment.payment_method && (
                      <div className="text-xs text-gray-400 capitalize">
                        {payment.payment_method.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-2">
                    <div className="font-semibold text-sm text-green-600">{formatCurrency(payment.amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Top Debtors */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Debtors</h2>
        {(stats.topDebtors ?? []).length === 0 ? (
          <p className="text-gray-500 text-sm">No outstanding balances.</p>
        ) : (
          <div className="space-y-3">
            {(stats.topDebtors ?? []).map((debtor: any) => (
              <button
                key={debtor.id}
                onClick={() => setSelectedDebtorId(debtor.id)}
                className="flex items-center justify-between py-2 border-b last:border-b-0 hover:bg-gray-50 rounded px-2 -mx-2 transition-colors w-full text-left"
              >
                <div>
                  <div className="font-medium text-gray-900">{debtor.name}</div>
                  <div className="text-sm text-gray-500">{debtor.code}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-red-600">{formatCurrency(debtor.balance)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Alerts */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Alerts</h2>
        {(stats.alerts?.largeOutstanding ?? []).length === 0 && (stats.alerts?.overdueEntries ?? []).length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No alerts at the moment.</p>
        ) : (
          <div className="space-y-4">
            {/* Large Outstanding */}
            {(stats.alerts?.largeOutstanding ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Large Outstanding Customers</h3>
                <div className="space-y-2">
                  {(stats.alerts?.largeOutstanding ?? []).map((customer) => (
                    <Link
                      key={customer.customer_id}
                      to={`/customers/${customer.customer_id}`}
                      className="flex items-center justify-between py-2 px-3 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{customer.customer_name}</div>
                        <div className="text-xs text-gray-500">{customer.customer_code}</div>
                      </div>
                      <div className="font-semibold text-red-700 text-sm">{formatCurrency(customer.balance)}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Overdue Entries */}
            {(stats.alerts?.overdueEntries ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Overdue Entries</h3>
                <div className="space-y-2">
                  {(stats.alerts?.overdueEntries ?? []).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-2 px-3 bg-yellow-50 border border-yellow-200 rounded cursor-pointer hover:bg-yellow-100 transition-colors"
                      onClick={() => handleEntryClick(entry.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">{entry.entry_code}</div>
                        <div className="text-xs text-gray-600">{entry.customer_name}</div>
                        <div className="text-xs text-red-600 font-medium">{entry.days_overdue} days overdue</div>
                      </div>
                      <div className="text-right ml-2 flex items-center space-x-2">
                        <div>
                          <div className="font-semibold text-sm text-red-700">{formatCurrency(entry.balance)}</div>
                        </div>
                        {entry.customer_phone && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const message = buildOverdueReminderMessage(entry.customer_name, entry.balance, entry.created_at, 'en');
                                openWhatsAppReminder(entry.customer_phone as string, message);
                              }}
                              className="px-1.5 py-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors text-xs font-medium"
                              title="Send WhatsApp reminder (English)"
                            >
                              EN
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const message = buildOverdueReminderMessage(entry.customer_name, entry.balance, entry.created_at, 'ta');
                                openWhatsAppReminder(entry.customer_phone as string, message);
                              }}
                              className="px-1.5 py-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors text-xs font-medium"
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
            id: selectedEntry.entry.id,
            entry_code: selectedEntry.entry.entry_code,
            customer_id: selectedEntry.entry.customer_id,
            entry_mode: selectedEntry.entry.entry_mode as 'detailed' | 'quick',
            description: selectedEntry.entry.description || undefined,
            total_amount: selectedEntry.entry.total_amount,
            paid_amount: selectedEntry.entry.paid_amount,
            balance: selectedEntry.entry.balance,
            status: selectedEntry.entry.status as 'unpaid' | 'partial' | 'paid',
            photo_url: selectedEntry.entry.photo_url || undefined,
            notes: undefined,
            created_by: '',
            created_at: selectedEntry.entry.created_at,
            items: selectedEntry.entry.items || [],
          }}
          customerName={selectedEntry.entry.customer_name}
          onClose={() => setSelectedEntry(null)}
          onModify={() => navigate(`/add-credit?entry_id=${selectedEntry.entry.id}`)}
          onDelete={async () => {
            const res = await api.deleteEntry(selectedEntry.entry.id);
            if (res.ok) {
              setSelectedEntry(null);
              loadDashboardData();
            } else {
              const data = await res.json();
              alert(data.error || 'Failed to delete entry');
            }
          }}
        />
      )}

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <PaymentDetailModal
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onModify={() => navigate(`/record-payment/${selectedPayment.customer_id}/edit/${selectedPayment.id}`)}
          onDelete={async () => {
            const res = await api.deletePayment(selectedPayment.id);
            if (res.ok) {
              setSelectedPayment(null);
              loadDashboardData();
            } else {
              const data = await res.json();
              alert(data.error || 'Failed to delete payment');
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
