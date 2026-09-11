import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';
import { Customer } from '../../types';
import { CustomerType } from './CreateCustomerModal';

const CUSTOMER_TYPE_OPTIONS: { value: CustomerType; label: string }[] = [
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'regular', label: 'Regular' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'wholesale', label: 'Wholesale/Dealer' },
  { value: 'corporate', label: 'Corporate/Institutional' },
];

interface EditCustomerModalProps {
  customer: Customer;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

export function EditCustomerModal({ customer, isOpen, onClose, onSaved }: EditCustomerModalProps) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [address, setAddress] = useState(customer.address || '');
  const [notes, setNotes] = useState(customer.notes || '');
  const [customerType, setCustomerType] = useState<CustomerType>(customer.customer_type);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill the form whenever the modal opens or the customer changes.
  useEffect(() => {
    if (isOpen) {
      setName(customer.name);
      setPhone(customer.phone);
      setAddress(customer.address || '');
      setNotes(customer.notes || '');
      setCustomerType(customer.customer_type);
      setError('');
    }
  }, [isOpen, customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.updateCustomer(customer.id, {
        name,
        phone,
        address: address || null,
        notes: notes || null,
        customer_type: customerType,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update customer');
      }

      const data = await response.json();
      onSaved(data.customer);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Customer" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
        {/* Customer code is read-only — it is a generated, immutable identifier */}
        <Input
          label="Customer Code"
          value={customer.customer_code}
          readOnly
          disabled
          className="bg-gray-50 dark:bg-gray-900/50"
        />
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <Input
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Customer address"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
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
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value as CustomerType)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {CUSTOMER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex space-x-2 pt-2">
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}