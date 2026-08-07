import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatDate, debugError } from '../lib/utils';
import { Staff } from '../types';
import { Skeleton, SkeletonCard, SkeletonListItem } from '../components/ui/Skeleton';

export function StaffManagementPage() {
  const { isAdmin, staff: currentStaff } = useAuth();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [newStaff, setNewStaff] = useState({ name: '', pin: '', role: 'staff' as 'admin' | 'staff' });
  const [resetPin, setResetPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadStaff();
    }
  }, [isAdmin]);

  const loadStaff = async () => {
    try {
      const response = await api.listStaff();
      if (response.ok) {
        const data = await response.json();
        setStaffList(data.staff);
      }
    } catch (error) {
      debugError('Failed to load staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await api.createStaff({
        name: newStaff.name,
        pin: newStaff.pin,
        role: newStaff.role,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create staff');
      }

      setShowAddModal(false);
      setNewStaff({ name: '', pin: '', role: 'staff' });
      loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await api.updateStaff(selectedStaff.id, {
        pin: resetPin,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset PIN');
      }

      setShowResetModal(false);
      setSelectedStaff(null);
      setResetPin('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset PIN');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (staffMember: Staff) => {
    try {
      const response = await api.updateStaff(staffMember.id, {
        active: !staffMember.active,
      });

      if (response.ok) {
        loadStaff();
      }
    } catch (error) {
      debugError('Failed to toggle staff status:', error);
    }
  };

  const handleDeleteClick = (staffMember: Staff) => {
    setSelectedStaff(staffMember);
    setDeleteWarning(null);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async (force: boolean) => {
    if (!selectedStaff) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await api.deleteStaff(selectedStaff.id, force);

      if (response.status === 409) {
        const data = await response.json();
        setDeleteWarning(data.details?.message || 'This staff member has associated records.');
        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete staff');
      }

      setShowDeleteModal(false);
      setSelectedStaff(null);
      setDeleteWarning(null);
      loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete staff');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Access denied. Admin only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>

        {/* Staff List Skeleton */}
        <SkeletonCard>
          <div className="space-y-3">
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
          </div>
        </SkeletonCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
        <Button onClick={() => setShowAddModal(true)}>
          + Add Staff Member
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Card>
        <div className="space-y-3">
          {staffList.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No staff members yet.</p>
          ) : (
            staffList.map(member => (
              <div key={member.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {member.name}
                    {currentStaff?.id === member.id && (
                      <span className="ml-2 text-xs text-primary-600">(You)</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {member.role === 'admin' ? 'Administrator' : 'Staff'} • Created {formatDate(member.created_at)}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant={member.active ? 'success' : 'default'}>
                    {member.active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedStaff(member);
                      setShowResetModal(true);
                    }}
                  >
                    Reset PIN
                  </Button>
                  <Button
                    variant={member.active ? 'danger' : 'primary'}
                    size="sm"
                    onClick={() => handleToggleActive(member)}
                  >
                    {member.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteClick(member)}
                    disabled={currentStaff?.id === member.id}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Add Staff Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Staff Member" size="md">
        <form onSubmit={handleAddStaff} className="space-y-4">
          <Input
            label="Name"
            value={newStaff.name}
            onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
            required
          />
          <Input
            label="PIN"
            type="text"
            value={newStaff.pin}
            onChange={(e) => setNewStaff({ ...newStaff, pin: e.target.value })}
            required
            maxLength={20}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={newStaff.role}
              onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as 'admin' | 'staff' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Adding...' : 'Add Staff'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset PIN Modal */}
      <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title="Reset PIN" size="sm">
        <form onSubmit={handleResetPin} className="space-y-4">
          <p className="text-sm text-gray-600">
            Reset PIN for <strong>{selectedStaff?.name}</strong>
          </p>
          <Input
            label="New PIN"
            type="text"
            value={resetPin}
            onChange={(e) => setResetPin(e.target.value)}
            required
            maxLength={20}
          />
          <div className="flex space-x-3 pt-4">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Resetting...' : 'Reset PIN'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowResetModal(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Staff Modal */}
      <Modal isOpen={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeleteWarning(null); }} title="Delete Staff Member" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{selectedStaff?.name}</strong>?
          </p>
          {deleteWarning && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
              <p className="font-semibold mb-1">⚠️ Warning</p>
              <p>{deleteWarning}</p>
            </div>
          )}
          <div className="flex space-x-3 pt-4">
            {!deleteWarning ? (
              <Button
                variant="danger"
                disabled={submitting}
                className="flex-1"
                onClick={() => handleDeleteConfirm(false)}
              >
                {submitting ? 'Checking...' : 'Delete'}
              </Button>
            ) : (
              <>
                <Button
                  variant="danger"
                  disabled={submitting}
                  className="flex-1"
                  onClick={() => handleDeleteConfirm(true)}
                >
                  {submitting ? 'Deleting...' : 'Delete Anyway'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setShowDeleteModal(false); setDeleteWarning(null); }}
                >
                  Cancel (Deactivate instead)
                </Button>
              </>
            )}
            {!deleteWarning && (
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}