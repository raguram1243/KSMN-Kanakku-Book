import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CreditCard, Send, UserPlus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { ThemedSelect } from '../components/ui/ThemedSelect';
import { MultiFileUpload, FileItem } from '../components/ui/MultiFileUpload';
import { CreateCustomerModal } from '../components/customer/CreateCustomerModal';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useActionProgress } from '../hooks/useActionProgress';
import { api } from '../lib/api';
import { formatCurrency, debugError, todayLocalISO } from '../lib/utils';
import { Customer } from '../types';

/**
 * Add Payment, staff version.
 *
 * Staff record what the customer handed over and attach the receipt photo;
 * nothing else. The payment is saved as pending with no allocation and does
 * not touch any balance until an admin approves it on the Approvals screen,
 * where the split over bills is decided. So this screen shows no bills, no
 * balances and no advance — and calls no endpoint that would return them.
 */

const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'Select method' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'others', label: 'Others' },
];

// Same generator as Payment Received: one key per form fill, so a retry after
// a timeout returns the payment already saved instead of saving it twice.
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface SentPayment {
  customerName: string;
  amount: number;
  duplicate: boolean;
}

export default function StaffPaymentPage() {
  const location = useLocation();

  // The staff customer list hands the chosen customer over in router state.
  const [customer, setCustomer] = useState<Customer | null>(
    () => (location.state as { customer?: Customer } | null)?.customer ?? null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayLocalISO());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<FileItem[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);

  const [submitting, setSubmitting] = useState(false);
  const save = useActionProgress();
  const [error, setError] = useState('');
  const [sent, setSent] = useState<SentPayment | null>(null);

  // Search once typing pauses; ignore responses that arrive after a newer query.
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);
  useEffect(() => {
    if (debouncedSearch.length < 2) return;
    let cancelled = false;
    api
      .listCustomers(debouncedSearch)
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (!cancelled) setSearchResults(data.customers ?? []);
      })
      .catch((err) => debugError('Search failed:', err))
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const visibleResults = searchQuery.trim().length >= 2 ? searchResults : [];

  const pickCustomer = (c: Customer) => {
    setCustomer(c);
    setSearchQuery('');
    setSearchResults([]);
    setSent(null);
  };

  const resetForm = () => {
    setCustomer(null);
    setAmount('');
    setPaymentMethod('');
    setReceiptNumber('');
    setNotes('');
    setAttachments([]);
    setIdempotencyKey(generateIdempotencyKey());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!customer) {
      setError('Please select a customer');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Please enter an amount greater than 0');
      return;
    }
    if (!paymentDate) {
      setError('Please pick the payment date');
      return;
    }
    if (paymentDate > todayLocalISO()) {
      setError('Payment date cannot be in the future');
      return;
    }

    setSubmitting(true);
    setError('');
    setSent(null);
    save.start();

    try {
      // Receipt photos first; the payment stores their canonical URLs.
      const uploaded = await Promise.all(
        attachments.map(async (item) => {
          const response = await api.uploadAttachment(item.file, 'payment');
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Upload failed');
          }
          const result = await response.json();
          return { file_url: result.url as string, file_type: result.file_type as string };
        })
      );

      // No allocations: the admin decides the split when approving.
      const response = await api.paymentReceived({
        customer_id: customer.id,
        amount: value,
        payment_date: paymentDate,
        payment_method: paymentMethod || undefined,
        receipt_number: receiptNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotency_key: idempotencyKey,
        attachments: uploaded,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send the payment');
      }
      const data = await response.json();

      await save.succeed();
      setSent({
        customerName: customer.name,
        amount: Number(data.payment?.amount ?? value),
        duplicate: !!data.duplicate,
      });
      resetForm();
    } catch (err) {
      save.fail();
      setError(err instanceof Error ? err.message : 'Failed to send the payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Add Payment</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Record a payment from a customer. It goes to the admin for approval before it counts.
        </p>
      </div>

      {sent && (
        <Alert variant="success" title="Sent to admin for approval" onClose={() => setSent(null)}>
          {sent.duplicate
            ? `This payment of ${formatCurrency(sent.amount)} from ${sent.customerName} was already sent.`
            : `${formatCurrency(sent.amount)} from ${sent.customerName} is waiting for the admin.`}
        </Alert>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {/* 1. Customer */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">1. Customer</h2>
        {customer ? (
          <div className="flex items-center justify-between gap-3 p-4 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 dark:text-white truncate">{customer.name}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {customer.customer_code} • {customer.phone}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCustomer(null)} disabled={submitting}>
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by name, phone, or customer code..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearching(e.target.value.trim().length >= 2);
                }}
                autoFocus
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Spinner size="sm" />
                </div>
              )}
              {visibleResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {visibleResults.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="block w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700 last:border-b-0 focus-ring"
                      onClick={() => pickCustomer(c)}
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{c.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {c.customer_code} • {c.phone}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button variant="secondary" className="w-full" onClick={() => setShowCreateCustomer(true)}>
              <UserPlus size={16} className="mr-1 inline" /> Create New Customer
            </Button>
          </div>
        )}
      </Card>

      {/* 2. Payment */}
      {customer && (
        <form onSubmit={handleSubmit}>
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">2. Payment Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Amount (₹)"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <Input
                  label="Payment Date"
                  type="date"
                  value={paymentDate}
                  max={todayLocalISO()}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Payment Method
                  </label>
                  <ThemedSelect
                    value={paymentMethod}
                    onChange={(value) => setPaymentMethod(value)}
                    options={PAYMENT_METHOD_OPTIONS}
                    ariaLabel="Payment method"
                    size="md"
                    menuWidth={170}
                  />
                </div>
                <Input
                  label="Receipt Number (optional)"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  placeholder="e.g., TXN123456"
                  maxLength={100}
                />
              </div>
              <Input
                label="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment notes..."
                maxLength={2000}
              />
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <MultiFileUpload
                  label="Receipt Photo (optional, up to 2 files)"
                  maxFiles={2}
                  files={attachments}
                  onFilesChange={setAttachments}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || !amount || Number(amount) <= 0}
                loading={submitting}
                progress={save.status}
                progressLabel="Sending"
                progressIcon={<Send size={16} />}
              >
                <CreditCard size={16} className="mr-2 inline" /> Send for Approval
              </Button>
            </div>
          </Card>
        </form>
      )}

      <CreateCustomerModal
        isOpen={showCreateCustomer}
        onClose={() => setShowCreateCustomer(false)}
        onCreated={(c: Customer) => {
          setShowCreateCustomer(false);
          pickCustomer(c);
        }}
      />
    </div>
  );
}
