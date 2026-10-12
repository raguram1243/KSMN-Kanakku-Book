import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { HoldToDelete } from '../ui/HoldToDelete';
import type { ActionStatus } from '../../hooks/useActionProgress';
import { ImageLightbox } from '../common/ImageLightbox';
import { formatCurrency, formatDateTime, safeFileUrl } from '../../lib/utils';
import { CreditEntry, CreditEntryItem } from '../../types';
import { useState } from 'react';

interface EntryDetailModalProps {
  entry: CreditEntry & { items?: CreditEntryItem[]; attachments?: any[] };
  customerName: string;
  onClose: () => void;
  onModify?: () => void;
  onDelete?: () => void;
  /**
   * State of the delete `onDelete` started, from `useActionProgress`. The
   * hold button needs it to say whether the delete actually went through.
   */
  deleteStatus?: ActionStatus;
}

export function EntryDetailModal({ entry, customerName, onClose, onModify, onDelete, deleteStatus }: EntryDetailModalProps) {
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Collect all image-type attachment URLs for the gallery
  const imageAttachments = (entry.attachments ?? []).filter((a: any) => a.file_type === 'image');
  // Only links to our own storage are ever rendered (see safeFileUrl).
  const imageUrls = imageAttachments
    .map((a: any) => safeFileUrl(a.file_url))
    .filter((u: string | null): u is string => !!u);

  const openLightbox = (fileUrl: string) => {
    const idx = imageUrls.indexOf(fileUrl);
    setLightbox({ images: imageUrls, index: idx >= 0 ? idx : 0 });
  };

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

          {/* Detailed entries saved before the line items were sent to the
              server kept only their total — the rows never reached the
              database, so say so instead of showing nothing. */}
          {entry.entry_mode === 'detailed' && (!entry.items || entry.items.length === 0) && (
            <Alert variant="info">
              Item details were not recorded for this entry. Use Modify to add them.
            </Alert>
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
                <span className={`font-bold ${Number(entry.balance) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {formatCurrency(entry.balance)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Status:</span>
                <Badge variant={getStatusVariant(entry.status)}>
                  {entry.status.toUpperCase()}
                </Badge>
              </div>

              {/* Progress bar for partial payments — quick visual of settled share */}
              {entry.status === 'partial' && Number(entry.total_amount) > 0 && (() => {
                const pct = Math.min(100, (Number(entry.paid_amount) / Number(entry.total_amount)) * 100);
                return (
                  <div className="pt-1">
                    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>{Math.round(pct)}% paid</span>
                      <span>{formatCurrency(entry.paid_amount)} of {formatCurrency(entry.total_amount)}</span>
                    </div>
                  </div>
                );
              })()}
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
                    
                    {!safeFileUrl(att.file_url) ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">File unavailable</p>
                    ) : att.file_type === 'image' ? (
                      <img
                        src={safeFileUrl(att.file_url)!}
                        alt="Attachment"
                        className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => openLightbox(safeFileUrl(att.file_url)!)}
                      />
                    ) : (
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => window.open(safeFileUrl(att.file_url)!, '_blank', 'noopener,noreferrer')}
                          className="flex-1"
                        >
                          👁️ Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = safeFileUrl(att.file_url)!;
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
              confirmDelete ? (
                <div className="flex-1 flex">
                  <HoldToDelete doneLabel="Deleted" onHold={onDelete} progress={deleteStatus} className="w-full">
                    Hold to delete
                  </HoldToDelete>
                </div>
              ) : (
                <Button
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  className="flex-1"
                >
                  Delete
                </Button>
              )
            )}
          </div>
        )}

        {/* Delete confirmation inline message */}
        {confirmDelete && (
          <Alert variant="error">
            Are you sure? This cannot be undone.
          </Alert>
        )}
      </Modal>

      {/* Lightbox (rendered via portal above the modal) */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}