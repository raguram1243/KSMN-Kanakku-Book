import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, DatabaseBackup } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useToastStore } from '../../store/toastStore';
import { BACKUP_EVENT, getLastBackupAt, localDateKey, runSummaryBackup } from '../../hooks/useDailyBackup';

function formatBackupTime(at: Date): string {
  return at.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Shows when this browser last saved the daily Summary backup, and lets an
 * admin take one on demand.
 *
 * The automatic backup is a browser download, which the browser can block or
 * the user can dismiss without noticing. This makes its state visible and
 * gives a way to recover.
 */
export function BackupStatusCard() {
  const addToast = useToastStore(state => state.addToast);
  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(() => getLastBackupAt());
  const [running, setRunning] = useState(false);

  // Pick up the automatic backup if it finishes while this page is open.
  useEffect(() => {
    const refresh = () => setLastBackupAt(getLastBackupAt());
    window.addEventListener(BACKUP_EVENT, refresh);
    return () => window.removeEventListener(BACKUP_EVENT, refresh);
  }, []);

  const backedUpToday = lastBackupAt !== null && localDateKey(lastBackupAt) === localDateKey();

  const handleBackupNow = async () => {
    setRunning(true);
    try {
      const count = await runSummaryBackup();
      addToast({
        type: 'success',
        title: 'Backup downloaded',
        description: `${count} customer${count === 1 ? '' : 's'} saved to your downloads folder.`,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Backup failed',
        description: error instanceof Error ? error.message : 'Could not download the backup.',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Daily Backup</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        The Summary report downloads automatically as a CSV the first time an admin opens the app each day. It
        is saved per browser, so another device keeps its own record.
      </p>

      <div
        className={`flex items-start gap-3 rounded-lg border p-3 mb-4 ${
          backedUpToday
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
            : 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
        }`}
      >
        {backedUpToday ? (
          <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" />
        ) : (
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
        )}
        <div className="text-sm">
          <div className="font-medium text-gray-900 dark:text-white">
            {backedUpToday ? 'Backed up today' : 'Not backed up today'}
          </div>
          <div className="text-gray-600 dark:text-gray-400">
            {lastBackupAt
              ? `Last backup on this browser: ${formatBackupTime(lastBackupAt)}`
              : 'No backup has been downloaded on this browser yet.'}
          </div>
        </div>
      </div>

      <Button onClick={handleBackupNow} loading={running} disabled={running} className="w-full">
        <DatabaseBackup size={18} className="mr-2" />
        {running ? 'Preparing backup...' : 'Download backup now'}
      </Button>
    </Card>
  );
}
