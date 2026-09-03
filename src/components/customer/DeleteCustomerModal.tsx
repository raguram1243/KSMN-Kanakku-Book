import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';
import { Customer } from '../../types';

interface DeleteCustomerModalProps {
  customer: Customer;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

type ConfirmStep = 1 | 2;

// Any of these strings typed into the confirmation field counts as an
// explicit "I confirm" gesture that's hard to click through by accident.
const CONFIRM_PHRASES = ['delete'];

export function DeleteCustomerModal({ customer, isOpen, onClose, onDeleted }: DeleteCustomerModalProps) {
  const [step, setStep] = useState<ConfirmStep>(1);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // Reset state each time the modal is opened.
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setConfirmText('');
      setError('');
    }
  }, [isOpen]);

  // The final delete button is only enabled once the admin actively types
  // the customer's name (or "DELETE") — a deliberate, read-the-room action.
  const canDelete =
    confirmText === customer.name ||
    CONFIRM_PHRASES.includes(confirmText.toLowerCase());

  const handleDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      const response = await api.deleteCustomer(customer.id);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete customer');
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  };

  // In step 2, the backdrop/X/Cancel should step back to the warning, not
  // dismiss the whole flow and lose the two-factor confirmation.
  const handleBackdropClose = () => {
    if (step === 2) {
      setStep(1);
      setConfirmText('');
    } else {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleBackdropClose}
      title="Delete Customer"
      size="md"
    >
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <p className="font-semibold">Are you sure?</p>
              <p>
                This will permanently delete <strong>{customer.name}</strong> and{' '}
                <strong>ALL their credit entries and payment history</strong> — this
                cannot be undone.
              </p>
              <p>
                All linked credit entries, attachments, payments and payment
                allocations will also be permanently removed.
              </p>
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <p className="font-semibold mb-1">Confirm deletion</p>
            <p>
              To confirm you want to permanently delete <strong>{customer.name}</strong>,
              type the customer's name (or <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">DELETE</code>)
              into the field below.
            </p>
          </div>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={customer.name}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            autoFocus
          />
          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setStep(1);
                setConfirmText('');
              }}
              disabled={deleting}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Customer Forever'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}