import { useState } from 'react';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';

interface DownloadStatementButtonProps {
  customerId: string;
}

export function DownloadStatementButton({ customerId }: DownloadStatementButtonProps) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const getDefaultFromDate = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().split('T')[0];
  };

  const getDefaultToDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await api.getStatement(
        customerId,
        fromDate || getDefaultFromDate(),
        toDate || getDefaultToDate()
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `statement_${customerId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setShowPanel(false);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to download statement');
      }
    } catch (error) {
      alert('Failed to download statement');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowPanel(!showPanel)}
      >
        Download Statement
      </Button>

      {showPanel && (
        <div className="absolute right-0 mt-2 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 w-80">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Download Statement</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate || getDefaultFromDate()}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
              <input
                type="date"
                value={toDate || getDefaultToDate()}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <Button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full"
              size="sm"
            >
              {downloading ? 'Generating...' : 'Download PDF'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}