import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Query } from '@tanstack/react-query';

/**
 * Read-only offline mode, part 1: the last loaded data.
 *
 * React Query's cache is copied to localStorage as it changes and restored on
 * the next launch, so with no network the customer list, balances, dashboard
 * and other pages already opened still show what they showed last. Saving is
 * disabled while offline (see apiCall in api.ts); nothing is ever queued.
 *
 * It holds the same data the signed-in user could already see, so it follows
 * the session: signing out, an expired or ended session, or opening the app
 * with no session wipes it (clearOfflineCache / purgeIfSignedOut).
 */

const CACHE_KEY = 'ksmn_query_cache';

/** Matches the 24h life of the login token. */
export const OFFLINE_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

/** Bump to discard every device's saved cache, e.g. after a response shape changes. */
export const OFFLINE_CACHE_VERSION = 'v1';

export const offlinePersister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: CACHE_KEY,
  throttleTime: 1000,
});

/** Big, rarely re-opened report payloads would only fill localStorage. */
const NOT_SAVED = new Set(['ledger-report', 'entries-report', 'payments-report']);

export function shouldSaveQuery(query: Query): boolean {
  return query.state.status === 'success' && !NOT_SAVED.has(String(query.queryKey[0]));
}

export function clearOfflineCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // storage unavailable: nothing was saved
  }
}

/** Call before the first render: no session means no saved data either. */
export function purgeIfSignedOut() {
  try {
    if (!localStorage.getItem('ksmn_token')) clearOfflineCache();
  } catch {
    // ignore
  }
}
