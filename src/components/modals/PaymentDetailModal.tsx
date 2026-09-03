import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ImageLightbox } from '../common/ImageLightbox';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { Payment } from '../../types';
import { useState } from 'react';

interface PaymentDetailModalProps {
  payment: Payment;
  onClose: () => void;
  onModify?: () => void;
  onDelete?: () => void;
}

export function PaymentDetailModal({ payment, onClose, onModify, onDelete }: PaymentDetailModalProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const getPaymentMethodLabel = (method: string): string => {
    switch (method) {
      case 'cash':
        return 'Cash';
      case 'upi':
        return 'UPI';
      case 'bank_transfer':
        return 'Bank Transfer';
      case 'card':
        return 'Card';
      case 'others':
        return 'Others';
      default:
        return method;
    }
  };

  const getPaymentMethodIcon = (method: string): string => {
    switch (method) {
      case 'cash':
        return '💵';
      case 'upi':
        return '📱';
      case 'bank_transfer':
        return '🏦';
      case 'card':
        return '💳';
      case 'others':
        return '💰';
      default:
        return '💳';
    }
  };

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title="Payment Details" size="lg">
        <div className="space-y-4">
          {/* Payment Date & Time */}
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Payment Date & Time</div>
            <div className="font-semibold text-gray-900 dark:text-white">{formatDateTime(payment.payment_date)}</div>
          </div>

          {/* Amount */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="text-sm text-green-700 dark:text-green-300">Amount Paid</div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{formatCurrency(payment.amount)}</div>
          </div>

          {/* Payment Method */}
          {payment.payment_method && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Payment Method</div>
              <div className="flex items-center space-x-2">
                <span className="text-xl">{getPaymentMethodIcon(payment.payment_method)}</span>
                <span className="font-medium text-gray-900 dark:text-white">{getPaymentMethodLabel(payment.payment_method)}</span>
              </div>
            </div>
          )}

          {/* Receipt Number */}
          {payment.receipt_number && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Receipt / Reference Number</div>
              <div className="font-medium text-gray-900 dark:text-white">{payment.receipt_number}</div>
            </div>
          )}

          {/* Notes */}
          {payment.notes && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Notes</div>
              <div className="text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">{payment.notes}</div>
            </div>
          )}

          {/* Recorded By */}
          {payment.staff_name && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Recorded By</div>
              <div className="font-medium text-gray-900 dark:text-white">{payment.staff_name}</div>
            </div>
          )}

          {/* Created Info */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Created Date & Time</div>
            <div className="text-sm text-gray-900 dark:text-white">{formatDateTime(payment.created_at)}</div>
          </div>

          {/* Payment Proof */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Payment Proof</div>
            {payment.attachments && payment.attachments.length > 0 ? (
              <div className="space-y-3">
                {payment.attachments.map((att: any) => (
                  <div key={att.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium text-sm text-gray-900 dark:text-white">
                          {att.file_name || 'Payment Proof'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {att.file_size && `${(att.file_size / 1024).toFixed(1)} KB`}
                          {att.uploaded_at && ` • ${formatDateTime(att.uploaded_at)}`}
                        </div>
                      </div>
                    </div>
                    
                    {att.file_type === 'image' ? (
                      <img
                        src={att.file_url}
                        alt="Payment proof"
                        className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxImage(att.file_url)}
                      />
                    ) : (
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => window.open(att.file_url, '_blank')}
                          className="flex-1"
                        >
                          👁️ Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = att.file_url;
                            link.download = att.file_name || 'payment-proof';
                            link.click();
                          }}
                          className="flex-1"
                        >
                          ⬇️ Download
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No payment proof uploaded.</p>
            )}
          </div>
        </div>

        {/* Modify/Delete Footer */}
        {(onModify || onDelete) && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex space-x-3">
            {onModify && (
              <Button variant="secondary" onClick={onModify} className="flex-1">
                Modify
              </Button>
            )}
            {onDelete && (
              <Button
                variant="danger"
                onClick={() => {
                  if (confirmDelete) {
                    onDelete();
                  } else {
                    setConfirmDelete(true);
                  }
                }}
                className="flex-1"
              >
                {confirmDelete ? 'Confirm Delete' : 'Delete'}
              </Button>
            )}
          </div>
        )}

        {/* Delete confirmation inline message */}
        {confirmDelete && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
            Are you sure? This cannot be undone.
          </div>
        )}
      </Modal>

      {/* Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </>
  );
}