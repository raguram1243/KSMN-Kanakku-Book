import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDate, formatDateTime, debugError } from '../lib/utils';
import { api } from '../lib/api';
import { CreditEntry, Payment } from '../types';
import { EntryDetailModal } from '../components/modals/EntryDetailModal';
import { PaymentDetailModal } from '../components/modals/PaymentDetailModal';
import { Skeleton, SkeletonCard, SkeletonListItem, SkeletonButton } from '../components/ui/Skeleton';
import { buildLedgerTransactions } from '../lib/ledger';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { openWhatsAppReminder, buildEntryReminderMessage, buildAggregateReminderMessage } from '../lib/whatsapp';
import { DownloadStatementButton } from '../components/customer/DownloadStatementButton';
import { EditCustomerModal } from '../components/customer/EditCustomerModal';
import { DeleteCustomerModal } from '../components/customer/DeleteCustomerModal';
import { useCustomer, useUpdateCustomer } from '../hooks/useApi';
import { useToastStore } from '../store/toastStore';

interface CreditEntryWithItems extends CreditEntry {
  items?: any[];
  attachments?: any[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<'detailed' | 'ledger'>('ledger');
  const [selectedEntry, setSelectedEntry] = useState<CreditEntryWithItems | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [savingOverdue, setSavingOverdue] = useState(false);
  const [pendingOverdueDays, setPendingOverdueDays] = useState<number | null>(null);
  const [overdueSaveMessage, setOverdueSaveMessage] = useState<string | null>(null);
    const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [showDeleteCustomer, setShowDeleteCustomer] = useState(false);
  const [applyingAdvance, setApplyingAdvance] = useState(false);

  // Ledger filter states
  const [filterType, setFilterType] = useState<'all' | 'entries' | 'payments'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [displayedCount, setDisplayedCount] = useState(50);

  const customerQuery = useCustomer(id);
  const updateCustomer = useUpdateCustomer();

    const handleApplyAdvance = async () => {
    if (!customer || !id) return;
    setApplyingAdvance(true);
    try {
      const res = await api.applyAdvance({ customer_id: id });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to apply advance');
      }
      const data = await res.json();
      await customerQuery.refetch();
      if (data.applied > 0.01) {
        const codes = (data.entries || [])
          .map((e: any) => e.entry_code)
          .filter(Boolean)
          .join(', ');
        useToastStore.getState().addToast({
          type: 'success',
          title: 'Advance applied',
          description: codes
            ? `${formatCurrency(data.applied)} applied to ${codes}`
            : `${formatCurrency(data.applied)} advance credit applied`,
        });
      } else {
        useToastStore.getState().addToast({
          type: 'info',
          title: 'No advance to apply',
          description: 'There is no advance credit available to apply',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply advance';
      useToastStore.getState().addToast({
        type: 'error',
        title: 'Could not apply advance',
        description: message,
      });
    } finally {
      setApplyingAdvance(false);
    }
  };

  const customer = customerQuery.data?.customer ?? null;
  const entries = (customerQuery.data?.entries ?? []) as CreditEntryWithItems[];
  const payments = (customerQuery.data?.payments ?? []) as Payment[];
  const loading = customerQuery.isLoading;
  const error = (customerQuery.error as Error)?.message || null;

  const [settingsMap, setSettingsMap] = useState<Record<string, number>>({});

  useEffect(() => {
    api.getSettings().then(res => {
      if (res.ok) return res.json();
      return null;
    }).then(data => {
      if (!data) return;
      const map: Record<string, number> = {};
      data.settings?.forEach((s: { key: string; value: string }) => {
        map[s.key] = parseInt(s.value);
      });
      setSettingsMap(map);
    }).catch((err) => {
      debugError('Failed to load settings:', err);
    });
  }, []);

  const CUSTOMER_TYPE_TO_SETTING_KEY: Record<string, string> = {
    'walk-in': 'overdue_days_walkin',
    'regular': 'overdue_days_regular',
    'contractor': 'overdue_days_contractor',
    'wholesale': 'overdue_days_wholesale',
    'corporate': 'overdue_days_corporate',
  }

  const getDefaultOverdueDays = (customerType: string): number => {
    const key = CUSTOMER_TYPE_TO_SETTING_KEY[customerType];
    return key ? (settingsMap[key] ?? 30) : 30;
  }

  const handleSaveOverdueDays = async () => {
    if (!customer) return
    setSavingOverdue(true);
    setOverdueSaveMessage(null);
    try {
      await updateCustomer.mutateAsync({
        id: customer.id,
        custom_overdue_days: pendingOverdueDays,
      });
      setOverdueSaveMessage('Saved successfully');
      setTimeout(() => setOverdueSaveMessage(null), 3000);
    } catch (error) {
      debugError('Failed to update overdue days:', error);
    } finally {
      setSavingOverdue(false);
    }
  };

  const handleResetOverdueDays = async () => {
    setPendingOverdueDays(null);
    await handleSaveOverdueDays();
  };

  // Calculate ledger transactions (once, before filtering)
  const ledgerTransactions = useMemo(() => {
    return buildLedgerTransactions(entries, payments);
  }, [entries, payments]);

  // Apply filters (after balance calculation)
  const filteredTransactions = useMemo(() => {
    return ledgerTransactions.filter(t => {
      // Type filter
      if (filterType === 'entries' && t.type !== 'entry') return false;
      if (filterType === 'payments' && t.type !== 'payment') return false;

      // Date range
      const transactionDate = t.date.split('T')[0];
      if (dateFrom && transactionDate < dateFrom) return false;
      if (dateTo && transactionDate > dateTo) return false;

      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          t.reference.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [ledgerTransactions, filterType, dateFrom, dateTo, searchQuery]);

  // Pagination
  const displayedTransactions = filteredTransactions.slice(0, displayedCount);
  const hasMore = displayedCount < filteredTransactions.length;

  const loadMore = () => {
    setDisplayedCount(prev => prev + 50);
  };

  // Reset pagination when filters change
  useEffect(() => {
    setDisplayedCount(50);
  }, [filterType, dateFrom, dateTo, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div>
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-8 w-48 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Customer Info Skeleton */}
        <SkeletonCard>
          <Skeleton className="h-5 w-1/4 mb-4" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Skeleton className="h-3 w-1/3 mb-1" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div>
              <Skeleton className="h-3 w-1/3 mb-1" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div>
              <Skeleton className="h-3 w-1/3 mb-1" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div>
              <Skeleton className="h-3 w-1/3 mb-1" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </SkeletonCard>

        {/* Outstanding Balance Skeleton */}
        <SkeletonCard>
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-8 w-32" />
            </div>
            <div className="text-right space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </SkeletonCard>

        {/* View Toggle Skeleton */}
        <div className="flex space-x-2">
          <SkeletonButton />
          <SkeletonButton />
        </div>

        {/* Entry History Skeleton */}
        <SkeletonCard>
          <Skeleton className="h-5 w-1/4 mb-4" />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </SkeletonCard>

        {/* Payment History Skeleton */}
        <SkeletonCard>
          <Skeleton className="h-5 w-1/4 mb-4" />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </SkeletonCard>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => customerQuery.refetch()}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Customer not found.</p>
        <Link to="/customers">
          <Button className="mt-4">Back to Customers</Button>
        </Link>
      </div>
    );
  }

  const totalOutstanding = entries.reduce((sum, entry) => sum + Number(entry.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/customers" className="text-sm text-primary-600 hover:text-primary-700">
            <ArrowLeft size={14} className="inline mr-1" /> Back to Customers
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{customer.name}</h1>
          <p className="text-gray-600">{customer.customer_code} • {customer.phone}</p>
        </div>
        {isAdmin && (
          <div className="flex space-x-3">
            <Link to={`/add-credit?customer_id=${customer.id}`}>
              <Button variant="secondary">Add Credit Entry</Button>
            </Link>
            <Link to={`/record-payment/${customer.id}`}>
              <Button>Payment Received</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setShowEditCustomer(true)}>Edit</Button>
            <Button variant="danger" size="sm" onClick={() => setShowDeleteCustomer(true)}>Delete Customer</Button>
          </div>
        )}
      </div>

      {/* Customer Info */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600">Customer Code</div>
            <div className="font-medium text-gray-900">{customer.customer_code}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Phone</div>
            <div className="font-medium text-gray-900">{customer.phone}</div>
          </div>
          {customer.address && (
            <div className="col-span-2">
              <div className="text-sm text-gray-600">Address</div>
              <div className="font-medium text-gray-900">{customer.address}</div>
            </div>
          )}
          <div>
            <div className="text-sm text-gray-600">Type</div>
            <Badge variant={customer.customer_type === 'regular' ? 'info' : 'default'}>
              {customer.customer_type}
            </Badge>
          </div>
          <div>
            <div className="text-sm text-gray-600">Created</div>
            <div className="font-medium text-gray-900">{formatDate(customer.created_at)}</div>
          </div>
          {customer.notes && (
            <div className="col-span-2">
              <div className="text-sm text-gray-600">Notes</div>
              <div className="font-medium text-gray-900">{customer.notes}</div>
            </div>
          )}
        </div>
            </Card>


      {/* Total Outstanding (admin only) */}
      {isAdmin && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-600">Total Outstanding Balance</div>
              <div className={`text-3xl font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(totalOutstanding)}
              </div>
              {(customer.advance_balance ?? 0) > 0 && (
                <div className="mt-2 flex items-center space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                    Advance Credit: {formatCurrency(customer.advance_balance ?? 0)}
                  </span>
                  {isAdmin && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleApplyAdvance}
                      disabled={applyingAdvance}
                    >
                      {applyingAdvance ? 'Applying...' : 'Apply Advance'}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Total Entries: {entries.length}</div>
              <div className="text-sm text-gray-500">
                Unpaid: {entries.filter(e => e.status === 'unpaid').length} •
                Partial: {entries.filter(e => e.status === 'partial').length} •
                Paid: {entries.filter(e => e.status === 'paid').length}
              </div>
              {totalOutstanding > 0 && (
                <div className="mt-2 inline-flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const message = buildAggregateReminderMessage(customer.name, totalOutstanding, 'en');
                      openWhatsAppReminder(customer.phone, message);
                    }}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <MessageCircle size={16} />
                    <span>EN</span>
                  </button>
                  <button
                    onClick={() => {
                      const message = buildAggregateReminderMessage(customer.name, totalOutstanding, 'ta');
                      openWhatsAppReminder(customer.phone, message);
                    }}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <MessageCircle size={16} />
                    <span>தமிழ்</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Payment Deadline (admin only) */}
      {isAdmin && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Deadline</h2>
          <div className="space-y-3">
            <div className="text-sm text-gray-600">
              {(() => {
                const customerType = customer.customer_type || 'walk-in'
                const hasCustomOverride = customer.custom_overdue_days != null
                const threshold = hasCustomOverride 
                  ? customer.custom_overdue_days 
                  : getDefaultOverdueDays(customerType)
                
                return (
                  <>
                    Current threshold: <span className="font-semibold text-gray-900">{threshold} days</span>
                    {hasCustomOverride ? (
                      <span className="ml-2 text-xs text-blue-600">(custom override)</span>
                    ) : (
                      <span className="ml-2 text-xs text-gray-500">({customerType} default)</span>
                    )}
                  </>
                )
              })()}
            </div>
            <div className="flex items-center space-x-3">
              <Input
                type="number"
                min="1"
                value={pendingOverdueDays?.toString() || ''}
                onChange={(e) => setPendingOverdueDays(e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Use default"
                className="max-w-xs"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveOverdueDays}
                disabled={savingOverdue}
              >
                {savingOverdue ? 'Saving...' : 'Save'}
              </Button>
              {customer.custom_overdue_days != null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResetOverdueDays}
                  disabled={savingOverdue}
                >
                  Reset to default
                </Button>
              )}
              {overdueSaveMessage && (
                <span className="text-sm text-green-600">{overdueSaveMessage}</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* View Toggle */}
      {isAdmin && (
        <div className="flex items-center space-x-2">
          <Button
            variant={view === 'detailed' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('detailed')}
          >
            Detailed View
          </Button>
          <Button
            variant={view === 'ledger' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('ledger')}
          >
            Ledger View
          </Button>
          <DownloadStatementButton customerId={customer.id} />
        </div>
      )}

      {/* Detailed View */}
      {view === 'detailed' && (
        <>
          {/* Entry History */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Entry History</h2>
            {entries.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No entries yet.</p>
            ) : (
              <div className="space-y-4">
                {entries.map(entry => (
                  <div 
                    key={entry.id} 
                    className="p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{entry.entry_code}</div>
                        <div className="text-sm text-gray-500">{formatDateTime(entry.created_at)}</div>
                        {entry.description && (
                          <div className="text-sm text-gray-600 mt-1">{entry.description}</div>
                        )}
                      </div>
                      <div className="text-right">
                        {isAdmin && (
                          <>
                            <div className="font-semibold text-gray-900">{formatCurrency(entry.total_amount)}</div>
                            <div className="text-sm text-gray-600">
                              Paid: {formatCurrency(entry.paid_amount)} • Balance: {formatCurrency(entry.balance)}
                            </div>
                          </>
                        )}
                        <Badge variant={entry.status === 'paid' ? 'success' : entry.status === 'partial' ? 'warning' : 'danger'}>
                          {entry.status}
                        </Badge>
                        {entry.balance > 0 && (
                          <div className="mt-2 flex items-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const message = buildEntryReminderMessage(customer.name, entry.balance, entry.description ?? null, entry.created_at ?? '', 'en');
                                openWhatsAppReminder(customer.phone, message);
                              }}
                              className="inline-flex items-center space-x-1 px-2 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors"
                            >
                              <MessageCircle size={14} />
                              <span>EN</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const message = buildEntryReminderMessage(customer.name, entry.balance, entry.description ?? null, entry.created_at ?? '', 'ta');
                                openWhatsAppReminder(customer.phone, message);
                              }}
                              className="inline-flex items-center space-x-1 px-2 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors"
                            >
                              <MessageCircle size={14} />
                              <span>தமிழ்</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Line items for detailed-mode entries */}
                    {entry.entry_mode === 'detailed' && entry.items && entry.items.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="pb-1 font-medium">Item</th>
                              <th className="pb-1 font-medium text-right">Qty</th>
                              <th className="pb-1 font-medium text-right">Rate</th>
                              <th className="pb-1 font-medium text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.items.map((item: any) => (
                              <tr key={item.id} className="border-t border-gray-100">
                                <td className="py-1 text-gray-900">{item.item_name}</td>
                                <td className="py-1 text-right text-gray-700">{item.qty}</td>
                                <td className="py-1 text-right text-gray-700">{formatCurrency(item.rate)}</td>
                                <td className="py-1 text-right font-medium text-gray-900">{formatCurrency(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Attachments */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {/* Legacy single photo fallback */}
                      {entry.photo_url && !(entry.attachments && entry.attachments.length > 0) && (
                        <a href={entry.photo_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:text-primary-700">
                          📎 View attached photo
                        </a>
                      )}

                      {/* New multi-file attachments */}
                      {entry.attachments && entry.attachments.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Attachments</div>
                          <div className="flex flex-wrap gap-2">
                            {entry.attachments.map((att: any) => (
                              <a
                                key={att.id}
                                href={att.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center space-x-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow-sm transition-all"
                              >
                                {att.file_type === 'image' ? (
                                  <>
                                    <span className="text-lg">🖼️</span>
                                    <span className="text-sm text-gray-700">Image</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-lg">📄</span>
                                    <span className="text-sm text-gray-700">PDF</span>
                                  </>
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Payment History */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h2>
            {payments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No payment history available.</p>
            ) : (
              <div className="space-y-4">
                {payments.map(payment => (
                  <div 
                    key={payment.id} 
                    className="p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setSelectedPayment(payment)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{formatDateTime(payment.payment_date)}</div>
                        {payment.payment_method && (
                          <div className="text-sm text-gray-600 mt-1">
                            Method: {payment.payment_method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </div>
                        )}
                        {payment.receipt_number && (
                          <div className="text-sm text-gray-600">
                            Receipt: {payment.receipt_number}
                          </div>
                        )}
                        {payment.notes && (
                          <div className="text-sm text-gray-600 mt-1">{payment.notes}</div>
                        )}
                        {payment.staff_name && (
                          <div className="text-xs text-gray-500 mt-1">Recorded by: {payment.staff_name}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">{formatCurrency(payment.amount)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Ledger View */}
      {view === 'ledger' && (
        <Card>
          {/* Filters */}
          <div className="mb-4 space-y-3">
            {/* Transaction Type Filter */}
            <div className="flex space-x-2">
              <Button
                variant={filterType === 'all' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFilterType('all')}
              >
                All
              </Button>
              <Button
                variant={filterType === 'entries' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFilterType('entries')}
              >
                Entries
              </Button>
              <Button
                variant={filterType === 'payments' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFilterType('payments')}
              >
                Payments
              </Button>
            </div>

            {/* Date Range & Search */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                type="date"
                label="From Date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <Input
                type="date"
                label="To Date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              <Input
                type="text"
                label="Search"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Ledger Table - Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date & Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Debit</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Credit</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Balance</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* Opening Balance Row */}
                <tr className="bg-gray-100 italic">
                  <td colSpan={3} className="px-3 py-2 text-gray-600">Opening Balance</td>
                  <td className="px-3 py-2 text-right text-gray-600">-</td>
                  <td className="px-3 py-2 text-right text-gray-600">-</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(0)}</td>
                  <td colSpan={2}></td>
                </tr>

                {/* Transaction Rows */}
                {displayedTransactions.map(transaction => (
                  <tr 
                    key={transaction.id}
                    className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      if (transaction.type === 'entry') {
                        setSelectedEntry(transaction.originalData as CreditEntryWithItems);
                      } else {
                        setSelectedPayment(transaction.originalData as Payment);
                      }
                    }}
                  >
                    <td className="px-3 py-2 text-gray-900">{formatDateTime(transaction.date)}</td>
                    <td className="px-3 py-2 text-gray-700">{transaction.reference}</td>
                    <td className="px-3 py-2 text-gray-900">{transaction.description}</td>
                    <td className={`px-3 py-2 text-right font-medium ${transaction.debit > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {transaction.debit > 0 ? formatCurrency(transaction.debit) : '-'}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${transaction.credit > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {transaction.credit > 0 ? formatCurrency(transaction.credit) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(transaction.balance)}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={transaction.type === 'entry' ? 'info' : 'success'}>
                        {transaction.type === 'entry' ? 'Entry' : 'Payment'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {transaction.status && (
                        <Badge variant={transaction.status === 'paid' ? 'success' : transaction.status === 'partial' ? 'warning' : 'danger'}>
                          {transaction.status}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ledger Cards - Mobile */}
          <div className="md:hidden space-y-3">
            {/* Opening Balance Card */}
            <div className="bg-gray-100 p-4 rounded-lg italic">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Opening Balance</span>
                <span className="font-bold text-gray-900">{formatCurrency(0)}</span>
              </div>
            </div>

            {/* Transaction Cards */}
            {displayedTransactions.map(transaction => (
              <div
                key={transaction.id}
                className="border border-gray-200 rounded-lg p-4 bg-white cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  if (transaction.type === 'entry') {
                    setSelectedEntry(transaction.originalData as CreditEntryWithItems);
                  } else {
                    setSelectedPayment(transaction.originalData as Payment);
                  }
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-900">{formatDateTime(transaction.date)}</div>
                    <Badge variant={transaction.type === 'entry' ? 'info' : 'success'}>
                      {transaction.type === 'entry' ? 'Entry' : 'Payment'}
                    </Badge>
                  </div>
                  
                  <div className="text-sm text-gray-700">{transaction.reference}</div>
                  <div className="text-sm text-gray-900">{transaction.description}</div>
                  
                  <div className="flex items-center justify-between pt-2 border-t">
                    {transaction.debit > 0 && (
                      <div>
                        <span className="text-xs text-gray-500">Debit: </span>
                        <span className="text-sm font-medium text-red-600">{formatCurrency(transaction.debit)}</span>
                      </div>
                    )}
                    {transaction.credit > 0 && (
                      <div>
                        <span className="text-xs text-gray-500">Credit: </span>
                        <span className="text-sm font-medium text-green-600">{formatCurrency(transaction.credit)}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-xs text-gray-500">Balance: </span>
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(transaction.balance)}</span>
                    </div>
                  </div>

                  {transaction.status && (
                    <div className="pt-2 border-t">
                      <Badge variant={transaction.status === 'paid' ? 'success' : transaction.status === 'partial' ? 'warning' : 'danger'}>
                        {transaction.status}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={loadMore}>
                Load More ({filteredTransactions.length - displayedCount} remaining)
              </Button>
            </div>
          )}

          {/* Results count */}
          <div className="mt-3 text-sm text-gray-500 text-center">
            Showing {displayedTransactions.length} of {filteredTransactions.length} transactions
          </div>
        </Card>
      )}

      {/* Edit Customer (admin only) */}
      {isAdmin && customer && (
        <EditCustomerModal
          customer={customer}
          isOpen={showEditCustomer}
          onClose={() => setShowEditCustomer(false)}
          onSaved={() => customerQuery.refetch()}
        />
      )}

      {/* Delete Customer (admin only) */}
      {isAdmin && customer && (
        <DeleteCustomerModal
          customer={customer}
          isOpen={showDeleteCustomer}
          onClose={() => setShowDeleteCustomer(false)}
                    onDeleted={() => {
            useToastStore.getState().addToast({
              type: 'success',
              title: 'Customer deleted',
              description: 'Customer has been removed from the records',
            });
            navigate('/customers');
          }}
        />
      )}

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <EntryDetailModal
          entry={selectedEntry}
          customerName={customer.name}
          onClose={() => setSelectedEntry(null)}
          onModify={() => navigate(`/add-credit?entry_id=${selectedEntry.id}`)}
                    onDelete={async () => {
            const res = await api.deleteEntry(selectedEntry.id);
            if (res.ok) {
              setSelectedEntry(null);
              customerQuery.refetch();
              useToastStore.getState().addToast({
                type: 'success',
                title: 'Entry deleted',
                description: selectedEntry.entry_code,
              });
            } else {
              const data = await res.json();
              useToastStore.getState().addToast({
                type: 'error',
                title: 'Could not delete entry',
                description: data.error || 'Please try again',
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
          onModify={() => navigate(`/record-payment/${customer.id}/edit/${selectedPayment.id}`)}
                    onDelete={async () => {
            const res = await api.deletePayment(selectedPayment.id);
            if (res.ok) {
              setSelectedPayment(null);
              customerQuery.refetch();
              useToastStore.getState().addToast({
                type: 'success',
                title: 'Payment deleted',
                description: `₹${Number(selectedPayment.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              });
            } else {
              const data = await res.json();
              useToastStore.getState().addToast({
                type: 'error',
                title: 'Could not delete payment',
                description: data.error || 'Please try again',
              });
            }
          }}
        />
      )}
    </div>
  );
}







