// ============================================
// Review Screen
// ============================================
// Shows what the scan read, lets the user correct it, and lets them pick the
// customer this bill belongs to before the form is pre-filled.
//
// Every extracted field is editable: the AI is reading photographs of
// handwritten bills, so the user is the final authority. Confidence is shown as
// a tint behind each field rather than as blocking validation.

import { useState, useEffect, useMemo } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { ImageLightbox } from '../common/ImageLightbox';
import { CreateCustomerModal } from '../customer/CreateCustomerModal';
import { useAIScanStore } from '../../store/aiScanStore';
import { DocumentClassifier } from '../../services/ai/DocumentClassifier';
import { CustomerMatcher } from '../../services/ai/CustomerMatcher';
import { ExtractedCreditData, ExtractedPaymentData } from '../../services/ai/types';
import { Customer } from '../../types';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/utils';

interface ReviewScreenProps {
  onComplete: () => void;
  onBack: () => void;
}

export function ReviewScreen({ onComplete, onBack }: ReviewScreenProps) {
  const scanResult = useAIScanStore((state) => state.scanResult);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  // Editable copy of what the scan read. Seeded once, then owned by the user.
  const [form, setForm] = useState<any>(() => ({ ...(scanResult?.extractedData ?? {}) }));

  // Customer picker
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedCustomer, setPickedCustomer] = useState<Customer | null>(null);

  const isCredit = scanResult ? DocumentClassifier.isCreditInvoice(scanResult) : false;
  const confidence = scanResult?.confidence ?? {};
  const matches = useMemo(() => scanResult?.customerMatches ?? [], [scanResult]);
  const bestMatch = CustomerMatcher.getBestMatch(matches);

  // Pre-select the AI's match when it is confident, and adopt its details.
  useEffect(() => {
    if (bestMatch && CustomerMatcher.hasHighConfidenceMatch(matches) && bestMatch.id) {
      setSelectedCustomerId(bestMatch.id);
      setForm((prev: any) => ({
        ...prev,
        customer_name: bestMatch.name || prev.customer_name,
        ...(bestMatch.phone ? { phone: bestMatch.phone, phone_number: bestMatch.phone } : {}),
      }));
    }
  }, [bestMatch, matches]);

  // Type-ahead over the customer list. Debounced so typing does not spam the API.
  useEffect(() => {
    const query = customerQuery.trim();
    if (query.length < 1) {
      setCustomerResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await api.listCustomers(query);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setCustomerResults(data.customers ?? []);
      } catch {
        if (!cancelled) setCustomerResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerQuery]);

  if (!scanResult) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">No scan result available</p>
        <Button onClick={onBack} className="mt-4">Back</Button>
      </div>
    );
  }

  const setField = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));

  /** Choosing a customer fills their name and phone into the extracted data. */
  const chooseCustomer = (customer: { id: string; name: string; phone?: string }) => {
    setSelectedCustomerId(customer.id);
    setForm((prev: any) => ({
      ...prev,
      customer_name: customer.name,
      ...(customer.phone ? { phone: customer.phone, phone_number: customer.phone } : {}),
    }));
  };

  const pickFromSearch = (customer: Customer) => {
    setPickedCustomer(customer);
    chooseCustomer(customer);
    setCustomerQuery('');
    setCustomerResults([]);
  };

  const handleConfirm = () => {
    // Hand the edited values on, not the raw scan. The form reads these next.
    useAIScanStore.setState({
      scanResult: { ...scanResult, extractedData: { ...form } } as any,
    });
    onComplete();
  };

  const getConfidenceColor = (conf: number): string => {
    if (conf >= 0.8) return 'text-green-600 dark:text-green-400';
    if (conf >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getConfidenceBg = (conf: number): string => {
    if (conf >= 0.8) return 'bg-green-50 dark:bg-green-900/20';
    if (conf >= 0.5) return 'bg-yellow-50 dark:bg-yellow-900/20';
    return 'bg-red-50 dark:bg-red-900/20';
  };

  const selectedFromMatches = matches.find((m) => m.id === selectedCustomerId);
  const chosenLabel = pickedCustomer?.name || selectedFromMatches?.name || null;

  return (
    <div className="space-y-6">
      {/* Document Type */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Document Type</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {DocumentClassifier.getLabel(scanResult.documentType)}
            </p>
          </div>
          <Badge variant={scanResult.documentTypeConfidence >= 0.7 ? 'success' : 'warning'}>
            {Math.round(scanResult.documentTypeConfidence * 100)}% confident
          </Badge>
        </div>
        {scanResult.classificationReason && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{scanResult.classificationReason}</p>
        )}
      </Card>

      {/* Customer */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Customer</h3>

        {/* Always available, so a wrong AI match can be overridden too. */}
        <div className="relative mb-4">
          <Input
            label="Search customers"
            type="text"
            placeholder="Type a name, phone, or customer code..."
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
          />
          {customerQuery.trim() !== '' && (
            <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
              {searching && customerResults.length === 0 && (
                <div className="p-3 text-sm text-gray-500 dark:text-gray-400">Searching...</div>
              )}
              {!searching && customerResults.length === 0 && (
                <div className="p-3 text-sm text-gray-500 dark:text-gray-400">No customers match that.</div>
              )}
              {customerResults.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => pickFromSearch(customer)}
                  className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                >
                  <div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {customer.customer_code} • {customer.phone}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {chosenLabel && (
          <div className="mb-4 flex items-center justify-between rounded-lg border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/30 p-3">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Selected for this entry</div>
              <div className="font-medium text-gray-900 dark:text-white">{chosenLabel}</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedCustomerId(null);
                setPickedCustomer(null);
              }}
            >
              Clear
            </Button>
          </div>
        )}

        {matches.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Suggested from the document:</p>
            {matches.map((match) => (
              <div
                key={match.id}
                onClick={() => chooseCustomer(match)}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCustomerId === match.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">{match.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {match.customer_code} • {match.phone}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{match.customer_type}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant={CustomerMatcher.getMatchTypeVariant(match.match_type)}>
                      {CustomerMatcher.getMatchTypeLabel(match.match_type)}
                    </Badge>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {CustomerMatcher.formatMatchScore(match.match_score)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          {matches.length === 0 && !chosenLabel && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              No matching customer found. Search above, or create a new one.
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCreateCustomer(true)}
          >
            + Create New Customer
          </Button>
        </div>
      </Card>

      {/* Extracted Data */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Extracted Data</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Check these against the photo and correct anything that is wrong.
        </p>

        {isCredit ? (
          <CreditDataReview
            data={form as ExtractedCreditData}
            confidence={confidence}
            onChange={setField}
            getConfidenceBg={getConfidenceBg}
          />
        ) : form && 'payment_amount' in form ? (
          <PaymentDataReview
            data={form as ExtractedPaymentData}
            confidence={confidence}
            getConfidenceColor={getConfidenceColor}
            getConfidenceBg={getConfidenceBg}
          />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No data extracted</p>
        )}
      </Card>

      {/* Document Preview */}
      {scanResult.fileUrl && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Document Preview</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            This photo will be attached to the entry.
          </p>
          {scanResult.fileType === 'image' ? (
            <img
              src={scanResult.fileUrl}
              alt="Scanned document"
              className="w-full h-64 object-contain rounded-lg cursor-pointer"
              onClick={() => setLightboxImage(scanResult.fileUrl || null)}
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400 mb-4">PDF Document</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(scanResult.fileUrl, '_blank')}
              >
                Open PDF
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Actions */}
      <div className="flex space-x-3">
        <Button onClick={handleConfirm} className="flex-1" size="lg">
          Confirm &amp; Fill Form
        </Button>
        <Button variant="secondary" onClick={onBack} size="lg">
          Back
        </Button>
      </div>

      {/* Creating a customer here actually creates one, and selects it. */}
      <CreateCustomerModal
        isOpen={showCreateCustomer}
        onClose={() => setShowCreateCustomer(false)}
        initialName={form.customer_name || ''}
        initialPhone={form.phone_number || form.phone || ''}
        onCreated={(customer) => {
          setShowCreateCustomer(false);
          setPickedCustomer(customer);
          chooseCustomer(customer);
        }}
      />

      {/* Lightbox */}
      {lightboxImage && (
        <ImageLightbox imageUrl={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}

// ============================================
// Credit Data Review Component
// ============================================
// No per-item table: handwritten bills rarely carry reliable unit rates, so the
// scan returns a written summary of the goods plus the bill total.
function CreditDataReview({
  data,
  confidence,
  onChange,
  getConfidenceBg,
}: {
  data: ExtractedCreditData;
  confidence: Record<string, number>;
  onChange: (key: string, value: any) => void;
  getConfidenceBg: (conf: number) => string;
}) {
  const tint = (key: string) => getConfidenceBg(confidence[key] ?? 0.5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Customer Name"
          type="text"
          placeholder="Not detected — type or pick a customer above"
          value={data.customer_name || ''}
          onChange={(e) => onChange('customer_name', e.target.value)}
          className={tint('customer_name')}
        />
        <Input
          label="Phone Number"
          type="text"
          placeholder="Not detected"
          value={data.phone_number || ''}
          onChange={(e) => {
            onChange('phone_number', e.target.value);
            onChange('phone', e.target.value);
          }}
          className={tint('phone_number')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Invoice / Bill Number"
          type="text"
          placeholder="Not detected"
          value={data.invoice_number || ''}
          onChange={(e) => onChange('invoice_number', e.target.value)}
          className={tint('invoice_number')}
        />
        <Input
          label="Invoice Date"
          type="date"
          value={data.invoice_date || ''}
          onChange={(e) => onChange('invoice_date', e.target.value)}
          className={tint('invoice_date')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Items
        </label>
        <textarea
          rows={3}
          placeholder="What was bought, e.g. Asian Putty 21, 10 inch putty blade 4, 150 grit 10"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          This becomes the entry description. The bill number is added automatically.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Total Amount
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={Number.isFinite(data.grand_total) ? data.grand_total : 0}
          onChange={(e) => onChange('grand_total', parseFloat(e.target.value) || 0)}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-bold text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${tint('grand_total')}`}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          The amount payable on the bill. This becomes the credit entry total.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
        <textarea
          rows={2}
          placeholder="Any remark written on the bill"
          value={data.notes || ''}
          onChange={(e) => onChange('notes', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
        />
      </div>
    </div>
  );
}

// ============================================
// Payment Data Review Component
// ============================================
function PaymentDataReview({
  data,
  confidence,
  getConfidenceColor,
  getConfidenceBg,
}: {
  data: ExtractedPaymentData;
  confidence: Record<string, number>;
  getConfidenceColor: (conf: number) => string;
  getConfidenceBg: (conf: number) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Customer & Amount */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Name</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.customer_name || 0.5)}`}>
            <span className={getConfidenceColor(confidence.customer_name || 0.5)}>
              {data.customer_name || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Amount</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.payment_amount || 0.5)}`}>
            <span className={`text-lg font-bold ${getConfidenceColor(confidence.payment_amount || 0.5)}`}>
              {data.payment_amount > 0 ? formatCurrency(data.payment_amount) : 'Not detected'}
            </span>
          </div>
        </div>
      </div>

      {/* Date & Method */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Date</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.payment_date || 0.5)}`}>
            <span className={getConfidenceColor(confidence.payment_date || 0.5)}>
              {data.payment_date || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Method</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.payment_method || 0.5)}`}>
            <span className={getConfidenceColor(confidence.payment_method || 0.5)}>
              {data.payment_method || 'Not detected'}
            </span>
          </div>
        </div>
      </div>

      {/* Reference & UPI */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference Number</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.reference_number || 0.5)}`}>
            <span className={getConfidenceColor(confidence.reference_number || 0.5)}>
              {data.reference_number || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">UPI ID</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.upi_id || 0.5)}`}>
            <span className={getConfidenceColor(confidence.upi_id || 0.5)}>
              {data.upi_id || 'Not detected'}
            </span>
          </div>
        </div>
      </div>

      {/* Bank & Notes */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Name</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.bank_name || 0.5)}`}>
            <span className={getConfidenceColor(confidence.bank_name || 0.5)}>
              {data.bank_name || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.notes || 0.5)}`}>
            <span className={getConfidenceColor(confidence.notes || 0.5)}>
              {data.notes || 'Not detected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
