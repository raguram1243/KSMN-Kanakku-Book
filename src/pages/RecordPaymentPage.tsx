import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatCurrency, formatDate, debugError } from '../lib/utils';
import { CreditEntry, Customer } from '../types';
import { FileItem } from '../components/ui/MultiFileUpload';
import { MultiFileUpload } from '../components/ui/MultiFileUpload';
import { Skeleton, SkeletonCard, SkeletonListItem, SkeletonButton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { AIScanButton } from '../components/ai/AIScanButton';
import { useAIScanStore } from '../store/aiScanStore';
import { PaymentExtractor } from '../services/ai/PaymentExtractor';
import { DocumentClassifier } from '../services/ai/DocumentClassifier';

interface EntryWithAllocation extends CreditEntry {
  allocated_amount?: number;
  selected: boolean;
}

export function RecordPaymentPage() {
  const { customerId: rawCustomerId, paymentId: rawPaymentId } = useParams<{ customerId: string; paymentId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isEditMode = !!rawPaymentId;

  const [customerId, setCustomerId] = useState<string | null>(rawCustomerId || null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<EntryWithAllocation[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Customer search state (shown when no customerId param)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [topDebtors, setTopDebtors] = useState<any[]>([]);
  const [todayStats, setTodayStats] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [attachments, setAttachments] = useState<FileItem[]>([]);

  // Auto-fill from AI scan
  useEffect(() => {
    const scanResult = useAIScanStore.getState().scanResult;
    if (scanResult && DocumentClassifier.isPaymentReceipt(scanResult)) {
      const extracted = scanResult.extractedData;
      if (extracted && 'payment_amount' in extracted) {
        const prefilled = PaymentExtractor.toPrefilledPayment(extracted, scanResult.confidence);
        
        // Prefill customer
        if (prefilled.customerName) {
          const matchCustomer = async () => {
            const response = await api.listCustomers(prefilled.customerName);
            if (response.ok) {
              const data = await response.json();
              const found = data.customers.find((c: Customer) => 
                c.name.toLowerCase() === prefilled.customerName?.toLowerCase()
              );
              if (found) {
                handleSelectCustomer(found);
              }
            }
          };
          matchCustomer();
        }

        // Prefill payment fields
        if (prefilled.amount > 0) {
          setPaymentAmount(prefilled.amount.toString());
        }
        if (prefilled.paymentDate) {
          setPaymentDate(prefilled.paymentDate);
        }
        if (prefilled.paymentMethod) {
          setPaymentMethod(prefilled.paymentMethod);
        }
        if (prefilled.receiptNumber) {
          setReceiptNumber(prefilled.receiptNumber);
        }
        if (prefilled.notes) {
          setNotes(prefilled.notes);
        }

        // Clear scan result after using it
        useAIScanStore.getState().clearScan();
      }
    }
  }, []);

  useEffect(() => {
    if (rawCustomerId) {
      setCustomerId(rawCustomerId);
    }
  }, [rawCustomerId]);

  useEffect(() => {
    if (customerId && isAdmin) {
      loadCustomerData();
    }
  }, [customerId, isAdmin]);

  // Load search step extra data (recent payments, top debtors, today stats)
  useEffect(() => {
    if (!customerId && isAdmin) {
      loadSearchStepData();
    }
  }, [customerId, isAdmin]);

  const loadSearchStepData = async () => {
    try {
      // 1. Fetch recent payments
      const payResponse = await api.getRecentPayments();
      if (payResponse.ok) {
        const payData = await payResponse.json();
        setRecentPayments(payData.payments || []);
      }

      // 2. Fetch today stats
      const statsResponse = await api.getTodayStats();
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setTodayStats(statsData);
      }

      // 3. Fetch top debtors (highest outstanding balance customers)
      const dashboardResponse = await api.getDashboardStats();
      if (dashboardResponse.ok) {
        const dbData = await dashboardResponse.json();
        setTopDebtors(dbData.topDebtors || []);
      }
    } catch (error) {
      debugError('Failed to load search step data:', error);
    }
  };

  // Live search for customers (when no customerId)
  useEffect(() => {
    if (!customerId && searchQuery.length >= 2) {
      const timeoutId = setTimeout(() => {
        searchCustomers();
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, customerId]);

  const searchCustomers = async () => {
    setSearchLoading(true);
    try {
      const response = await api.listCustomers(searchQuery);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.customers);
      }
    } catch (error) {
      debugError('Search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectCustomer = (cust: Customer) => {
    setCustomerId(cust.id);
    setSearchQuery('');
    setSearchResults([]);
    // Update URL to include customerId
    navigate(`/record-payment/${cust.id}`);
  };

  const loadCustomerData = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const response = await api.getCustomer(customerId);
      if (response.ok) {
        const data = await response.json();
        setCustomer(data.customer);

        if (isEditMode && rawPaymentId) {
          // Edit mode: find the payment and its allocations
          const payment = (data.payments || []).find((p: any) => p.id === rawPaymentId);
          if (payment) {
            // Prefill payment fields
            setPaymentAmount(payment.amount?.toString() || '');
            setPaymentDate(payment.payment_date?.split('T')[0] || new Date().toISOString().split('T')[0]);
            setPaymentMethod(payment.payment_method || '');
            setReceiptNumber(payment.receipt_number || '');
            setNotes(payment.notes || '');

            // Build a map of existing allocations by credit_entry_id
            const existingAllocMap: Record<string, number> = {};
            (payment.allocations || []).forEach((alloc: any) => {
              existingAllocMap[alloc.credit_entry_id] = Number(alloc.allocated_amount);
            });

            // In edit mode: load ALL entries (don't filter 'paid'), compute adjusted balance
            const entriesWithSelection = (data.entries || [])
              .map((entry: CreditEntry) => {
                const oldAlloc = existingAllocMap[entry.id] || 0;
                // Adjusted balance = current balance + old allocation (undo this payment's contribution)
                const adjustedBalance = Number(entry.balance) + oldAlloc;
                const hasExistingAlloc = oldAlloc > 0;
                return {
                  ...entry,
                  balance: adjustedBalance, // Use adjusted balance as the cap
                  selected: hasExistingAlloc,
                  allocated_amount: oldAlloc,
                };
              });
            setEntries(entriesWithSelection);
          } else {
            // Payment not found, fall back to create mode behavior
            const entriesWithSelection = (data.entries || [])
              .filter((e: CreditEntry) => e.status !== 'paid')
              .map((entry: CreditEntry) => ({
                ...entry,
                selected: false,
                allocated_amount: 0,
              }));
            setEntries(entriesWithSelection);
          }
        } else {
          // Create mode: only show unpaid entries
          const entriesWithSelection = (data.entries || [])
            .filter((e: CreditEntry) => e.status !== 'paid')
            .map((entry: CreditEntry) => ({
              ...entry,
              selected: false,
              allocated_amount: 0,
            }));
          setEntries(entriesWithSelection);
        }
      }
    } catch (error) {
      debugError('Failed to load customer data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalOutstanding = () => {
    return entries.reduce((sum, entry) => sum + Number(entry.balance), 0);
  };

  const calculateSelectedTotal = () => {
    return entries
      .filter(entry => entry.selected)
      .reduce((sum, entry) => sum + Number(entry.allocated_amount || 0), 0);
  };

  const handleEntryToggle = (entryId: string) => {
    const amount = parseFloat(paymentAmount) || 0;
    setEntries(entries.map(entry => {
      if (entry.id !== entryId) return entry;
      const nowSelected = !entry.selected;
      if (!nowSelected) {
        return { ...entry, selected: false, allocated_amount: 0 };
      }
      const otherAllocated = entries
        .filter(e => e.id !== entryId && e.selected)
        .reduce((sum, e) => sum + (e.allocated_amount || 0), 0);
      const remaining = Math.max(0, amount - otherAllocated);
      const fill = Math.min(Number(entry.balance), remaining);
      return { ...entry, selected: true, allocated_amount: fill };
    }));
  };

  const autoAllocate = () => {
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) return;

    // Sort entries oldest-first by created_at, then walk through allocating
    const sorted = [...entries].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let remaining = amount;
    const updatedMap = new Map<string, { selected: boolean; allocated_amount: number }>();

    for (const entry of sorted) {
      if (remaining <= 0) {
        updatedMap.set(entry.id, { selected: false, allocated_amount: 0 });
        continue;
      }

      const balance = Number(entry.balance);
      const allocation = Math.min(balance, remaining);
      remaining -= allocation;

      updatedMap.set(entry.id, {
        selected: allocation > 0,
        allocated_amount: allocation,
      });
    }

    setEntries(entries.map(entry => ({
      ...entry,
      selected: updatedMap.get(entry.id)?.selected || false,
      allocated_amount: updatedMap.get(entry.id)?.allocated_amount || 0,
    })));
  };

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Only admin can record payments');
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      setError('Please enter a valid payment amount');
      return;
    }

    const selectedEntries = entries.filter(entry => entry.selected && (entry.allocated_amount || 0) > 0);
    const totalAllocated = selectedEntries.reduce((sum, entry) => sum + (entry.allocated_amount || 0), 0);

    // Allow zero selected entries if customer has no outstanding balance or intentionally under-allocating
    if (selectedEntries.length === 0 && totalOutstanding > 0) {
      setError('Please select at least one entry to allocate payment');
      return;
    }

    // Block over-allocation, allow under-allocation (remainder becomes advance credit)
    if (totalAllocated > amount + 0.01) {
      setError(`Total allocated (${formatCurrency(totalAllocated)}) cannot exceed payment amount (${formatCurrency(amount)})`);
      return;
    }

    setError('');
    setShowConfirmDialog(true);
  };

  const confirmAndSubmit = async () => {
    const amount = parseFloat(paymentAmount);
    const selectedEntries = entries.filter(entry => entry.selected && (entry.allocated_amount || 0) > 0);

    setSubmitting(true);
    setError('');

    try {
      // Upload attachments if present
      const uploadedAttachments = await Promise.all(
        attachments.map(async (item) => {
          const response = await api.uploadAttachment(item.file, 'payment');
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Upload failed');
          }
          const result = await response.json();
          return {
            file_url: result.url,
            file_type: result.file_type,
          };
        })
      );

      if (isEditMode && rawPaymentId) {
        // Edit mode: update existing payment
        const updateResponse = await api.updatePayment({
          payment_id: rawPaymentId,
          amount: amount,
          payment_date: paymentDate,
          payment_method: paymentMethod || undefined,
          receipt_number: receiptNumber || undefined,
          notes: notes || undefined,
          allocations: selectedEntries
            .filter(e => e.allocated_amount && e.allocated_amount > 0)
            .map(e => ({
              credit_entry_id: e.id,
              allocated_amount: e.allocated_amount,
            })),
        });

        if (!updateResponse.ok) {
          const data = await updateResponse.json();
          throw new Error(data.error || 'Failed to update payment');
        }

        setShowConfirmDialog(false);
        alert('Payment updated successfully!');
        navigate(`/customers/${customerId}`);
      } else {
        // Create mode: create new payment
        const paymentResponse = await api.recordPayment({
          customer_id: customerId!,
          amount: amount,
          payment_date: paymentDate,
          payment_method: paymentMethod || undefined,
          receipt_number: receiptNumber || undefined,
          notes: notes || undefined,
          allocations: selectedEntries
            .filter(e => e.allocated_amount && e.allocated_amount > 0)
            .map(e => ({
              credit_entry_id: e.id,
              allocated_amount: e.allocated_amount,
            })),
          attachments: uploadedAttachments,
        });

        if (!paymentResponse.ok) {
          const data = await paymentResponse.json();
          throw new Error(data.error || 'Failed to create payment');
        }

        const data = await paymentResponse.json();
        void data.payment; // Payment created successfully

        setShowConfirmDialog(false);
        alert('Payment recorded successfully!');
        navigate(`/customers/${customerId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Access denied. Admin only.</p>
      </div>
    );
  }

  // Step 1: Customer selection (when no customerId)
  if (!customerId) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link to="/dashboard" className="text-sm text-primary-600 hover:text-primary-700">
            ← Back to Dashboard
          </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{isEditMode ? 'Edit Payment' : 'Record Payment'}</h1>
          <p className="text-gray-600">Search or select a customer to record a payment for.</p>
        </div>

        <Card>
          <div className="space-y-6">
            {/* Search Input */}
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by name, phone, or customer code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Spinner size="sm" />
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {searchResults.map(cust => (
                    <div
                      key={cust.id}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                      onClick={() => handleSelectCustomer(cust)}
                    >
                      <div className="font-medium text-gray-900">{cust.name}</div>
                      <div className="text-sm text-gray-500">{cust.customer_code} • {cust.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stat Strip: Collected Today & This Month */}
            {todayStats && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Collected Today</div>
                  <div className="text-xl font-bold text-green-700 mt-1">
                    {formatCurrency(todayStats.todayPaymentsTotalSum)}
                  </div>
                </div>
                <div className="border-l pl-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Collected This Month</div>
                  <div className="text-xl font-bold text-primary-700 mt-1">
                    {formatCurrency(todayStats.monthPaymentsTotalSum)}
                  </div>
                </div>
              </div>
            )}

            {/* Recently Recorded Payments Grid */}
            {recentPayments.length > 0 && !searchQuery && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Recently Recorded Payments</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {recentPayments.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectCustomer({ id: p.customer_id } as any)}
                      className="p-3 bg-white border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow-sm cursor-pointer transition-all flex flex-col justify-between h-24"
                    >
                      <div>
                        <div className="font-medium text-gray-900 truncate">{p.customer_name}</div>
                        <div className="text-xs text-gray-500">{formatDate(p.payment_date)}</div>
                      </div>
                      <div className="mt-1 text-sm font-bold text-green-600">
                        {formatCurrency(p.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Highest Outstanding Balance Customers (Top Debtors) */}
            {topDebtors.length > 0 && !searchQuery && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Highest Outstanding Balance Customers</h3>
                <div className="space-y-2">
                  {topDebtors.slice(0, 5).map((debtor) => (
                    <div
                      key={debtor.id || debtor.customer_code}
                      onClick={() => handleSelectCustomer({ id: debtor.id || debtor.customer_id } as any)}
                      className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg cursor-pointer transition-all"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{debtor.name}</div>
                        <div className="text-xs text-gray-500">{debtor.customer_code}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-red-600">
                          {formatCurrency(debtor.balance)}
                        </div>
                        <div className="text-[10px] text-gray-400">outstanding</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Step 2: Payment form (when customerId is set)
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Skeleton */}
        <div>
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-8 w-48 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Payment Details Skeleton */}
        <SkeletonCard>
          <Skeleton className="h-5 w-1/4 mb-4" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Skeleton className="h-3 w-1/3 mb-1" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div>
                <Skeleton className="h-3 w-1/3 mb-1" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Skeleton className="h-3 w-1/3 mb-1" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div>
                <Skeleton className="h-3 w-1/3 mb-1" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </SkeletonCard>

        {/* Outstanding Balance Skeleton */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-8 w-24" />
            </div>
            <SkeletonButton />
          </div>
        </div>

        {/* Entry List Skeleton */}
        <SkeletonCard>
          <Skeleton className="h-5 w-1/3 mb-4" />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </SkeletonCard>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Customer not found.</p>
        <Link to="/record-payment">
          <Button className="mt-4">Back to Search</Button>
        </Link>
      </div>
    );
  }

  const totalOutstanding = calculateTotalOutstanding();
  const selectedTotal = calculateSelectedTotal();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/record-payment" className="text-sm text-primary-600 hover:text-primary-700">
            ← Change Customer
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{isEditMode ? 'Edit Payment' : 'Record Payment'}</h1>
          <p className="text-gray-600">{customer.name} • {customer.customer_code}</p>
        </div>
        <AIScanButton variant="primary" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Payment Amount (₹)"
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              <Input
                label="Payment Date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select method</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="card">Card</option>
                  <option value="others">Others</option>
                </select>
              </div>
              <Input
                label="Receipt Number (optional)"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="e.g., TXN123456"
              />
            </div>

            <Input
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment notes..."
            />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-blue-900">Total Outstanding</div>
                <div className="text-2xl font-bold text-blue-900">{formatCurrency(totalOutstanding)}</div>
                {customer?.advance_balance && customer.advance_balance > 0 && (
                  <div className="text-sm text-green-700 mt-1">
                    Advance Credit: {formatCurrency(customer.advance_balance)}
                  </div>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={autoAllocate}>
                Auto Allocate
              </Button>
            </div>
          </div>

          {/* Advance credit informational line */}
          {(() => {
            const amount = parseFloat(paymentAmount) || 0;
            if (amount > selectedTotal + 0.01) {
              return (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
                  {formatCurrency(amount - selectedTotal)} will be added as advance credit for this customer
                </div>
              );
            }
            return null;
          })()}
        </div>
      </Card>

      {entries.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Allocate Payment to Entries</h2>
          <div className="space-y-3">
            {entries.map(entry => (
              <div
                key={entry.id}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  entry.selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={entry.selected}
                      onChange={() => handleEntryToggle(entry.id)}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{entry.entry_code}</div>
                      <div className="text-sm text-gray-500">{formatDate(entry.created_at)}</div>
                      {entry.description && (
                        <div className="text-sm text-gray-600 mt-1">{entry.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{formatCurrency(entry.balance)}</div>
                    {entry.selected && (
                      <Input
                        type="number"
                        step="0.01"
                        value={entry.allocated_amount?.toString() || ''}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value) || 0;
                          const value = Math.min(raw, Number(entry.balance));
                          setEntries(entries.map(en =>
                            en.id === entry.id ? { ...en, allocated_amount: value } : en
                          ));
                        }}
                        placeholder="Allocated amount"
                        className="w-32 mt-2"
                        max={entry.balance}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total Allocated:</span>
              <span className={selectedTotal === (parseFloat(paymentAmount) || 0) ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(selectedTotal)}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Payment Proof Attachments */}
      <div className="pt-6 border-t">
        <MultiFileUpload
          label="Payment Proof (optional, up to 2 files)"
          maxFiles={2}
          files={attachments}
          onFilesChange={setAttachments}
          attachmentType="payment"
        />
      </div>

      <div className="flex space-x-3">
        <Button
          onClick={handleOpenConfirm}
          disabled={submitting || !paymentAmount || parseFloat(paymentAmount) <= 0}
          className="flex-1"
          size="lg"
        >
          {submitting ? (isEditMode ? 'Updating Payment...' : 'Recording Payment...') : (isEditMode ? 'Update Payment' : 'Record Payment')}
        </Button>
        <Link to="/record-payment">
          <Button variant="secondary" size="lg">
            Cancel
          </Button>
        </Link>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        title="Confirm Payment"
        size="lg"
      >
        <div className="space-y-4">
          {/* Customer Info */}
          <div>
            <div className="font-semibold text-gray-900">{customer.name}</div>
            <div className="text-sm text-gray-500">{customer.customer_code}</div>
          </div>

          {/* Payment Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Payment Amount</span>
              <span className="font-semibold text-gray-900">{formatCurrency(parseFloat(paymentAmount) || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Payment Date</span>
              <span className="font-medium text-gray-900">{paymentDate}</span>
            </div>
            {paymentMethod && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Payment Method</span>
                <span className="font-medium text-gray-900 capitalize">{paymentMethod.replace('_', ' ')}</span>
              </div>
            )}
          </div>

          {/* Selected Entries */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Entries Being Paid</h4>
            <div className="space-y-2">
              {entries.filter(e => e.selected && (e.allocated_amount || 0) > 0).map(entry => (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{entry.entry_code}</div>
                    <div className="text-xs text-gray-500">{formatDate(entry.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      Allocating: {formatCurrency(entry.allocated_amount || 0)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Remaining after: {formatCurrency(Number(entry.balance) - (entry.allocated_amount || 0))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Outstanding Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1">
            <div className="flex justify-between">
              <span className="text-sm text-blue-900">Outstanding before</span>
              <span className="font-semibold text-blue-900">{formatCurrency(totalOutstanding)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-blue-900">Outstanding after</span>
              <span className="font-semibold text-blue-900">{formatCurrency(Math.max(0, totalOutstanding - selectedTotal))}</span>
            </div>
            {(() => {
              const amount = parseFloat(paymentAmount) || 0;
              if (amount > selectedTotal + 0.01) {
                return (
                  <div className="flex justify-between pt-2 border-t border-blue-200">
                    <span className="text-sm text-green-800">Advance credit added</span>
                    <span className="font-semibold text-green-800">{formatCurrency(amount - selectedTotal)}</span>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-2">
            <Button
              onClick={confirmAndSubmit}
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? (isEditMode ? 'Updating Payment...' : 'Recording Payment...') : (isEditMode ? 'Confirm & Update Payment' : 'Confirm & Record Payment')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowConfirmDialog(false)}
              disabled={submitting}
            >
              Back
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
