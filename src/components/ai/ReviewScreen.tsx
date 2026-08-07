// ============================================
// Review Screen
// ============================================
// Shows extracted data for user review before
// pre-filling the form. Highlights low-confidence fields.

import { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ImageLightbox } from '../common/ImageLightbox';
import { useAIScanStore } from '../../store/aiScanStore';
import { DocumentClassifier } from '../../services/ai/DocumentClassifier';
import { CustomerMatcher } from '../../services/ai/CustomerMatcher';
import { ExtractedCreditData, ExtractedPaymentData } from '../../services/ai/types';
import { formatCurrency } from '../../lib/utils';

interface ReviewScreenProps {
  onComplete: () => void;
  onBack: () => void;
}

export function ReviewScreen({ onComplete, onBack }: ReviewScreenProps) {
  const scanResult = useAIScanStore((state) => state.scanResult);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [createNewCustomer, setCreateNewCustomer] = useState(false);

  if (!scanResult) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No scan result available</p>
        <Button onClick={onBack} className="mt-4">Back</Button>
      </div>
    );
  }

  const isCredit = DocumentClassifier.isCreditInvoice(scanResult);
  const extractedData = scanResult.extractedData;
  const confidence = scanResult.confidence;
  const matches = scanResult.customerMatches;
  const bestMatch = CustomerMatcher.getBestMatch(matches);

  // Auto-select best match if high confidence
  useEffect(() => {
    if (bestMatch && CustomerMatcher.hasHighConfidenceMatch(matches) && bestMatch.id) {
      setSelectedCustomerId(bestMatch.id);
    }
  }, [bestMatch, matches]);

  const handleConfirm = () => {
    // Store the selected customer ID
    if (selectedCustomerId) {
      useAIScanStore.setState({
        scanResult: {
          ...scanResult,
          extractedData: {
            ...extractedData,
            ...(isCredit && extractedData && 'customer_name' in extractedData
              ? { customer_name: bestMatch?.name || extractedData.customer_name }
              : {}),
            ...(!isCredit && extractedData && 'customer_name' in extractedData
              ? { customer_name: bestMatch?.name || extractedData.customer_name }
              : {}),
          } as any,
        } as any,
      });
    }
    onComplete();
  };

  const getConfidenceColor = (conf: number): string => {
    if (conf >= 0.8) return 'text-green-600';
    if (conf >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBg = (conf: number): string => {
    if (conf >= 0.8) return 'bg-green-50';
    if (conf >= 0.5) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  return (
    <div className="space-y-6">
      {/* Document Type */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Document Type</h3>
            <p className="text-sm text-gray-600 mt-1">
              {DocumentClassifier.getLabel(scanResult.documentType)}
            </p>
          </div>
          <Badge variant={scanResult.documentTypeConfidence >= 0.7 ? 'success' : 'warning'}>
            {Math.round(scanResult.documentTypeConfidence * 100)}% confident
          </Badge>
        </div>
        {scanResult.classificationReason && (
          <p className="text-xs text-gray-500 mt-2">{scanResult.classificationReason}</p>
        )}
      </Card>

      {/* Customer Matching */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Match</h3>

        {matches.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">No matching customer found. Create a new customer?</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreateNewCustomer(!createNewCustomer)}
            >
              {createNewCustomer ? 'Cancel' : '+ Create New Customer'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <div
                key={match.id}
                onClick={() => setSelectedCustomerId(match.id)}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCustomerId === match.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 bg-white hover:border-primary-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{match.name}</div>
                    <div className="text-sm text-gray-500">
                      {match.customer_code} • {match.phone}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{match.customer_type}</div>
                  </div>
                  <div className="text-right">
                    <Badge variant={CustomerMatcher.getMatchTypeVariant(match.match_type)}>
                      {CustomerMatcher.getMatchTypeLabel(match.match_type)}
                    </Badge>
                    <div className="text-xs text-gray-500 mt-1">
                      {CustomerMatcher.formatMatchScore(match.match_score)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {createNewCustomer && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              A new customer will be created when you save the entry/payment.
            </p>
          </div>
        )}
      </Card>

      {/* Extracted Data */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Extracted Data</h3>

        {isCredit && extractedData && 'items' in extractedData ? (
          <CreditDataReview
            data={extractedData as ExtractedCreditData}
            confidence={confidence}
            getConfidenceColor={getConfidenceColor}
            getConfidenceBg={getConfidenceBg}
          />
        ) : extractedData && 'payment_amount' in extractedData ? (
          <PaymentDataReview
            data={extractedData as ExtractedPaymentData}
            confidence={confidence}
            getConfidenceColor={getConfidenceColor}
            getConfidenceBg={getConfidenceBg}
          />
        ) : (
          <p className="text-sm text-gray-500">No data extracted</p>
        )}
      </Card>

      {/* Document Preview */}
      {scanResult.fileUrl && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Preview</h3>
          {scanResult.fileType === 'image' ? (
            <img
              src={scanResult.fileUrl}
              alt="Scanned document"
              className="w-full h-64 object-contain rounded-lg cursor-pointer"
              onClick={() => setLightboxImage(scanResult.fileUrl || null)}
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">PDF Document</p>
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
          Confirm & Fill Form
        </Button>
        <Button variant="secondary" onClick={onBack} size="lg">
          Back
        </Button>
      </div>

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
function CreditDataReview({
  data,
  confidence,
  getConfidenceColor,
  getConfidenceBg,
}: {
  data: ExtractedCreditData;
  confidence: Record<string, number>;
  getConfidenceColor: (conf: number) => string;
  getConfidenceBg: (conf: number) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Customer Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.customer_name || 0.5)}`}>
            <span className={getConfidenceColor(confidence.customer_name || 0.5)}>
              {data.customer_name || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.phone_number || 0.5)}`}>
            <span className={getConfidenceColor(confidence.phone_number || 0.5)}>
              {data.phone_number || 'Not detected'}
            </span>
          </div>
        </div>
      </div>

      {/* Invoice Details */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.invoice_number || 0.5)}`}>
            <span className={getConfidenceColor(confidence.invoice_number || 0.5)}>
              {data.invoice_number || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.invoice_date || 0.5)}`}>
            <span className={getConfidenceColor(confidence.invoice_date || 0.5)}>
              {data.invoice_date || 'Not detected'}
            </span>
          </div>
        </div>
      </div>

      {/* Items */}
      {data.items.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Items ({data.items.length})
          </label>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Rate</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-gray-900">{item.item_name}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{item.quantity}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(item.rate)}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="border-t border-gray-200 pt-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">Subtotal:</span>
          <span className="font-medium text-gray-900">{formatCurrency(data.subtotal)}</span>
        </div>
        {data.discount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Discount:</span>
            <span className="font-medium text-gray-900">-{formatCurrency(data.discount)}</span>
          </div>
        )}
        {data.tax > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Tax:</span>
            <span className="font-medium text-gray-900">{formatCurrency(data.tax)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold">
          <span className="text-gray-900">Grand Total:</span>
          <span className="text-primary-700">{formatCurrency(data.grand_total)}</span>
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <div className="p-2 bg-gray-50 rounded text-sm text-gray-700">{data.notes}</div>
        </div>
      )}
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.customer_name || 0.5)}`}>
            <span className={getConfidenceColor(confidence.customer_name || 0.5)}>
              {data.customer_name || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.payment_date || 0.5)}`}>
            <span className={getConfidenceColor(confidence.payment_date || 0.5)}>
              {data.payment_date || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.reference_number || 0.5)}`}>
            <span className={getConfidenceColor(confidence.reference_number || 0.5)}>
              {data.reference_number || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
          <div className={`p-2 rounded ${getConfidenceBg(confidence.bank_name || 0.5)}`}>
            <span className={getConfidenceColor(confidence.bank_name || 0.5)}>
              {data.bank_name || 'Not detected'}
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
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