import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCustomerQueries } from '../../hooks/useApi';
import { Customer } from '../../types';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useActionProgress } from '../../hooks/useActionProgress';
import { UserPlus } from 'lucide-react';

export type CustomerType = 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate';

interface CreateCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  /** Seed the form, e.g. with the name and phone an AI Scan read off a bill. */
  initialName?: string;
  initialPhone?: string;
}

const CUSTOMER_TYPE_OPTIONS: { value: CustomerType; label: string }[] = [
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'regular', label: 'Regular' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'wholesale', label: 'Wholesale/Dealer' },
  { value: 'corporate', label: 'Corporate/Institutional' },
];

export function CreateCustomerModal({ isOpen, onClose, onCreated, initialName, initialPhone }: CreateCustomerModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('regular');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const create = useActionProgress();

  // Seed from the caller when opening, and clear everything when dismissed.
  useEffect(() => {
    if (isOpen) {
      setName(initialName ?? '');
      setPhone(initialPhone ?? '');
      setError('');
    } else {
      setName('');
      setPhone('');
      setAddress('');
      setNotes('');
      setCustomerType('regular');
      setError('');
    }
  }, [isOpen, initialName, initialPhone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone are required');
      return;
    }
    setLoading(true);
    setError('');
    create.start();
    try {
      const response = await api.createCustomer({
        name,
        phone,
        address: address || undefined,
        customer_type: customerType,
        notes: notes || undefined,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create customer');
      }

      const data = await response.json();
      create.succeed();
      invalidateCustomerQueries(queryClient);
      onCreated(data.customer);
      onClose();
    } catch (err) {
      create.fail();
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Customer" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error">
            {error}
          </Alert>
        )}
        <Input
          label="Customer Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer name"
          required
          autoFocus
        />
        <Input
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          required
        />
        <Input
          label="Address (optional)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Customer address"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this customer..."
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
          <ThemedSelect
            value={customerType}
            onChange={(value) => setCustomerType(value as CustomerType)}
            options={CUSTOMER_TYPE_OPTIONS}
            ariaLabel="Customer type"
            size="md"
            menuWidth={250}
          />
        </div>
        <div className="flex space-x-2 pt-2">
          <Button
            type="submit"
            size="sm"
            disabled={loading}
            loading={loading}
            progress={create.status}
            progressLabel="Creating"
            progressIcon={<UserPlus size={14} />}
          >
            Create Customer
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}