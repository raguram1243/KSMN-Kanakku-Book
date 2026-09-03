import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ImageLightbox } from '../common/ImageLightbox';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { CreditEntry, CreditEntryItem } from '../../types';
import { useState } from 'react';

interface EntryDetailModalProps {
  entry: CreditEntry & { items?: CreditEntryItem[]; attachments?: any[] };
  customerName: string;
  onClose: () => void;
  onModify?: () => void;
  onDelete?: () => void;
}

export function EntryDetailModal({ entry, customerName, onClose, onModify, onDelete }: EntryDetailModalProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'paid':
        return 'success';
      case 'partial':
        return 'warning';
      default:
        return 'danger';
    }
  };

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title="Entry Details" size="lg">
        <div className="space-y-4">
          {/* Entry Number & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Entry Number</div>
              <div className="font-semibold text-gray-900 dark:text-white">{entry.entry_code}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Date & Time</div>
              <div className="font-medium text-gray-900 dark:text-white">{formatDateTime(entry.created_at)}</div>
            </div>
          </div>

          {/* Customer */}
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Customer</div>
            <div className="font-medium text-gray-900 dark:text-white">{customerName}</div>
          </div>

          {/* Items Table (for detailed mode) */}
          {entry.entry_mode === 'detailed' && entry.items && entry.items.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Items</div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Item</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Rate</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {entry.items.map((item: CreditEntryItem) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-gray-900 dark:text-white">{item.item_name}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{item.qty}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(item.rate)}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Description (for quick mode) */}
          {entry.entry_mode === 'quick' && entry.description && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Description</div>
              <div className="font-medium text-gray-900 dark:text-white">{entry.description}</div>
            </div>
          )}

          {/* Financial Summary */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Financial Summary</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Total Amount:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(entry.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Paid Amount:</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(entry.paid_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Balance:</span>
                <span className={`font-bold ${Number(entry.balance) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {formatCurrency(entry.balance)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Status:</span>
                <Badge variant={getStatusVariant(entry.status)}>
                  {entry.status.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* Notes */}
          {entry.notes && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Notes</div>
              <div className="text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">{entry.notes}</div>
            </div>
          )}

          {/* Created Info */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Created By</div>
            <div className="text-sm text-gray-900 dark:text-white">
              {entry.staff_name || entry.created_by}
              {entry.staff_role && ` (${entry.staff_role.charAt(0).toUpperCase() + entry.staff_role.slice(1)})`}
              {' • '}
              {formatDateTime(entry.created_at)}
            </div>
          </div>

          {/* Attachments */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Attachments</div>
            {entry.attachments && entry.attachments.length > 0 ? (
              <div className="space-y-3">
                {entry.attachments.map((att: any) => (
                  <div key={att.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium text-sm text-gray-900 dark:text-white">
                          {att.file_name || 'Attachment'}
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
                        alt="Attachment"
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
                            link.download = att.file_name || 'download';
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
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No attachments available.</p>
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