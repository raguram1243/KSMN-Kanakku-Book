import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { useToastStore } from '../../store/toastStore';
import { addFollowUp, updateFollowUp } from '../../lib/followUps';
import type { FollowUp } from '../../lib/followUps';
import { formatCurrency } from '../../lib/utils';

export function FollowUpEditModal({ item, onClose, onSaved }: { item: FollowUp; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(item.promised_date || '');
  const [note, setNote] = useState(item.note || '');
  const addToast = useToastStore((s) => s.addToast);
  const save = () => {
    updateFollowUp(item.id, { promised_date: date || null, note });
    addToast({ type: 'success', title: 'Follow-up updated' });
    onSaved();
  };
  return (
    <Modal isOpen onClose={onClose} title={`Follow-up — ${item.customer_name}`} size="sm">
      <div className="space-y-4">
        <Input label="Promised date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. pay half on Friday..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} className="flex-1">Save</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

export function FollowUpCreateModal({ customer, amount, onClose, onSaved }: {
  customer: { id: string; name: string; code: string; phone: string | null };
  amount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const addToast = useToastStore((s) => s.addToast);
  const save = () => {
    addFollowUp({
      customer_id: customer.id, customer_name: customer.name, customer_code: customer.code,
      customer_phone: customer.phone, amount, promised_date: date || null, note, created_by: null,
    });
    addToast({ type: 'success', title: 'Follow-up added', description: date ? `Due ${date}` : undefined });
    onSaved();
  };
  return (
    <Modal isOpen onClose={onClose} title={`Follow-up — ${customer.name}`} size="sm">
      <div className="space-y-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">Outstanding: <strong>{formatCurrency(amount)}</strong></div>
        <Input label="Promised date (optional)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} className="flex-1">Add follow-up</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
