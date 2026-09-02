import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { downloadSummaryCsv, SummaryRow } from '../lib/summaryReport';
import { useToastStore } from '../store/toastStore';
import { debugError, debugLog } from '../lib/utils';

export const BACKUP_DATE_KEY = 'lastBackupDate';

/** Local device date as YYYY-MM-DD (not UTC — the admin's calendar day is what matters). */
export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** backup_kanakkubook_DD-MM-YYYY_HH-MM-SS.csv — dashes only, colons are illegal in Windows filenames. */
export function backupFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
  const timePart = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `backup_kanakkubook_${datePart}_${timePart}.csv`;
}

/**
 * Downloads the Reports > Summary data as CSV once per calendar day, per
 * browser/device, for admins only (the summary carries full financial data).
 *
 * This can only fire while an admin actually has the app open — a browser
 * cannot download anything on a schedule with the tab closed.
 */
export function useDailyBackup() {
  const { staff, isAdmin, loading } = useAuth();
  const addToast = useToastStore(state => state.addToast);
  const inFlight = useRef(false);

  useEffect(() => {
    if (loading || !staff || !isAdmin) return;
    if (inFlight.current) return;

    const today = localDateKey();
    if (localStorage.getItem(BACKUP_DATE_KEY) === today) {
      debugLog('[Backup] Already downloaded today:', today);
      return;
    }

    inFlight.current = true;
    (async () => {
      try {
        debugLog('[Backup] Fetching summary report for daily backup');
        const res = await api.getLedgerReport();
        if (!res.ok) throw new Error('Failed to load summary report for backup');
        const data = await res.json();
        const rows = (data?.customers ?? []) as SummaryRow[];

        downloadSummaryCsv(rows, backupFilename());
        localStorage.setItem(BACKUP_DATE_KEY, today);

        addToast({
          type: 'success',
          title: 'Daily backup downloaded',
          description: `${rows.length} customer${rows.length === 1 ? '' : 's'} saved to your downloads folder.`,
        });
      } catch (error) {
        // Leave lastBackupDate untouched so the next load retries.
        inFlight.current = false;
        debugError('[Backup] Daily backup failed:', error);
        addToast({
          type: 'error',
          title: 'Daily backup failed',
          description: error instanceof Error ? error.message : 'Could not download the daily backup.',
        });
      }
    })();
  }, [loading, staff, isAdmin, addToast]);
}
