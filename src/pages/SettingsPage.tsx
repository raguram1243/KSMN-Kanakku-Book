import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { debugError } from '../lib/utils';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import { Download } from 'lucide-react';

interface Setting {
  key: string;
  value: string;
}

const SETTING_LABELS: Record<string, string> = {
  'overdue_days_walkin': 'Walk-in customers: overdue after',
  'overdue_days_regular': 'Regular customers: overdue after',
  'overdue_days_contractor': 'Contractor customers: overdue after',
  'overdue_days_wholesale': 'Wholesale/Dealer customers: overdue after',
  'overdue_days_corporate': 'Corporate/Institutional customers: overdue after',
}

export function SettingsPage() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadSettings();
    }
  }, [isAdmin]);

  const loadSettings = async () => {
    try {
      const response = await api.getSettings();
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
    } catch (error) {
      debugError('Failed to load settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const updates = settings.map(s => ({ key: s.key, value: s.value }));
      const response = await api.updateSettings(updates);
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      debugError('Failed to save settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
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
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />

        <SkeletonCard>
          <Skeleton className="h-5 w-1/3 mb-4" />
          <Skeleton className="h-4 w-2/3 mb-6" />
          <div className="space-y-4">
            <div>
              <Skeleton className="h-3 w-1/4 mb-1" />
              <Skeleton className="h-10 w-full max-w-xs rounded-lg" />
            </div>
            <div>
              <Skeleton className="h-3 w-1/4 mb-1" />
              <Skeleton className="h-10 w-full max-w-xs rounded-lg" />
            </div>
            <div>
              <Skeleton className="h-3 w-1/4 mb-1" />
              <Skeleton className="h-10 w-full max-w-xs rounded-lg" />
            </div>
          </div>
          <div className="mt-6 pt-6 border-t">
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </SkeletonCard>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Overdue Day Thresholds</h2>
        <p className="text-sm text-gray-600 mb-6">
          Configure how many days must pass before a credit entry is marked as overdue for each customer type.
        </p>

        <div className="space-y-4">
          {settings.map(setting => (
            <div key={setting.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {SETTING_LABELS[setting.key] || setting.key}
              </label>
              <Input
                type="number"
                min="1"
                value={setting.value}
                onChange={(e) => handleChange(setting.key, e.target.value)}
                className="max-w-xs"
              />
              <p className="text-xs text-gray-500 mt-1">days</p>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </Card>

      {/* Export Data */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Export Data</h2>
        <p className="text-sm text-gray-600 mb-4">
          Download your data in Excel or CSV format.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
            <div className="flex space-x-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportFormat"
                  value="xlsx"
                  defaultChecked
                  className="text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Excel (XLSX)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportFormat"
                  value="csv"
                  className="text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">CSV</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Dataset</label>
            <select
              id="exportDataset"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="customers">Customers</option>
              <option value="entries">Credit Entries</option>
              <option value="payments">Payments</option>
            </select>
          </div>

          <Button
            onClick={async () => {
              const format = (document.querySelector('input[name="exportFormat"]:checked') as HTMLInputElement)?.value as 'xlsx' | 'csv';
              const dataset = (document.getElementById('exportDataset') as HTMLSelectElement)?.value;
              
              try {
                const response = await api.exportData(format, dataset);
                if (response.ok) {
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `ksmn-export-${dataset}.${format}`;
                  a.click();
                  URL.revokeObjectURL(url);
                } else {
                  const data = await response.json();
                  alert(data.error || 'Failed to export data');
                }
              } catch (error) {
                alert('Failed to export data');
              }
            }}
            className="w-full"
          >
            <Download size={18} className="mr-2" />
            Download Export
          </Button>
        </div>
      </Card>
    </div>
  );
}
