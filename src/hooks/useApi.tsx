import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// Invalidation sets for saves made through direct `api.*` calls (which bypass
// the mutation hooks below). Keys are the ones declared in this file; the
// prefix forms ['customer'], ['day-book'] etc. cover every id/date/range.
export function invalidateCustomerQueries(qc: QueryClient, customerId?: string) {
  qc.invalidateQueries({ queryKey: ['customers'] });
  qc.invalidateQueries({ queryKey: customerId ? ['customer', customerId] : ['customer'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function invalidateEntryQueries(qc: QueryClient, customerId?: string) {
  qc.invalidateQueries({ queryKey: ['customers'] });
  qc.invalidateQueries({ queryKey: customerId ? ['customer', customerId] : ['customer'] });
  qc.invalidateQueries({ queryKey: customerId ? ['customer-balance', customerId] : ['customer-balance'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['day-book'] });
  qc.invalidateQueries({ queryKey: ['entries-report'] });
  qc.invalidateQueries({ queryKey: ['ledger-report'] });
  qc.invalidateQueries({ queryKey: ['today-stats'] });
}

export function invalidatePaymentQueries(qc: QueryClient, customerId?: string) {
  invalidateEntryQueries(qc, customerId);
  qc.invalidateQueries({ queryKey: ['payments-report'] });
  qc.invalidateQueries({ queryKey: ['recent-payments'] });
  qc.invalidateQueries({ queryKey: ['pending-payments'] });
}

/**
 * Pending staff payments awaiting admin approval.
 *
 * `count` feeds the nav badge and the dashboard alert: polled every minute and
 * on window focus so the admin notices new submissions without reloading.
 * Pass `enabled = isAdmin` — the endpoint is admin-only.
 */
export function usePendingPaymentsCount(enabled: boolean) {
  return useQuery<number, Error>({
    queryKey: ['pending-payments', 'count'],
    queryFn: async () => {
      const res = await api.countPendingPayments();
      if (!res.ok) throw new Error('Failed to load pending payments');
      const data = await res.json();
      return Number(data.count) || 0;
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    refetchOnWindowFocus: true,
  });
}

export function usePendingPayments() {
  return useQuery<any, Error, any, any>({
    queryKey: ['pending-payments', 'list'],
    queryFn: async () => {
      const res = await api.listPendingPayments();
      if (!res.ok) throw new Error('Failed to load pending payments');
      return res.json();
    },
    refetchOnWindowFocus: true,
  });
}

/** Top customers by credit given this month. Under 'dashboard' so every bill/payment change refreshes it. */
export function useTopCustomersMonth() {
  return useQuery<any, Error, any, any>({
    queryKey: ['dashboard', 'top-customers'],
    queryFn: async () => {
      const res = await api.getTopCustomers();
      if (!res.ok) throw new Error('Failed to load top customers');
      return res.json();
    },
  });
}

export function useDashboardStats() {
  return useQuery<any, Error, any, any>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.getDashboardStats();
      if (!res.ok) throw new Error('Failed to load dashboard');
      return res.json();
    },
  });
}

export function useLedgerReport(fromDate?: string, toDate?: string) {
  return useQuery<any, Error, any, any>({
    queryKey: ['ledger-report', fromDate ?? '', toDate ?? ''],
    queryFn: async () => {
      const res = await api.getLedgerReport(fromDate, toDate);
      if (!res.ok) throw new Error('Failed to load ledger report');
      return res.json();
    },
    placeholderData: keepPreviousData,
  });
}

export function useEntriesReport(fromDate?: string, toDate?: string) {
  return useQuery<any, Error, any, any>({
    queryKey: ['entries-report', fromDate ?? '', toDate ?? ''],
    queryFn: async () => {
      const res = await api.getEntriesReport(fromDate, toDate);
      if (!res.ok) throw new Error('Failed to load entries report');
      return res.json();
    },
    placeholderData: keepPreviousData,
  });
}

export function usePaymentsReport(fromDate?: string, toDate?: string) {
  return useQuery<any, Error, any, any>({
    queryKey: ['payments-report', fromDate ?? '', toDate ?? ''],
    queryFn: async () => {
      const res = await api.getPaymentsReport(fromDate, toDate);
      if (!res.ok) throw new Error('Failed to load payments report');
      return res.json();
    },
    placeholderData: keepPreviousData,
  });
}

export function useCustomers(search?: string, page?: number, pageSize?: number, filter?: string, sort?: string) {
  return useQuery<any, Error, any, any>({
    queryKey: ['customers', search ?? '', page ?? 1, pageSize ?? 50, filter ?? 'all', sort ?? 'name_asc'],
    queryFn: async () => {
      const res = await api.listCustomers(search, page, pageSize, filter, sort);
      if (!res.ok) throw new Error('Failed to load customers');
      return res.json();
    },
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id?: string) {
  return useQuery<any, Error, any, any>({
    queryKey: ['customer', id],
    queryFn: async () => {
      if (!id) throw new Error('Missing customer id');
      const res = await api.getCustomer(id);
      if (!res.ok) throw new Error('Failed to load customer');
      return res.json();
    },
    enabled: !!id,
  });
}

export function useRecentPayments() {
  return useQuery<any, Error, any, any>({
    queryKey: ['recent-payments'],
    queryFn: async () => {
      const res = await api.getRecentPayments();
      if (!res.ok) throw new Error('Failed to load recent payments');
      return res.json();
    },
  });
}

export function useTodayStats() {
  return useQuery<any, Error, any, any>({
    queryKey: ['today-stats'],
    queryFn: async () => {
      const res = await api.getTodayStats();
      if (!res.ok) throw new Error('Failed to load today stats');
      return res.json();
    },
  });
}

/**
 * Day-book for one date.
 *
 * Cached like every other query here, so returning to the page or flicking
 * back to a date already looked at renders from cache instead of showing
 * skeletons for another round trip. `keepPreviousData` keeps yesterday's
 * numbers on screen while the next date loads, rather than blanking the page.
 *
 * The client-side fallback is kept for the case where get-day-book is
 * unavailable: it costs three calls instead of one, so it stays a fallback.
 */
export function useDayBook(day: string) {
  return useQuery<any, Error, any, any>({
    queryKey: ['day-book', day],
    queryFn: async () => {
      try {
        const res = await api.getDayBook(day);
        if (res.ok) return { book: await res.json(), source: 'server' as const };
      } catch {
        // fall through to the on-device computation
      }

      const [statsRes, entriesRes, payRes] = await Promise.all([
        api.getTodayStats(),
        api.getEntriesReport(day, day),
        api.getPaymentsReport(day, day),
      ]);
      const stats = statsRes.ok ? await statsRes.json() : {};
      const entries = entriesRes.ok ? await entriesRes.json() : {};
      const pays = payRes.ok ? await payRes.json() : {};
      const entryList: any[] = entries.entries ?? [];
      // Only approved payments are collections (the server already filters;
      // this keeps the on-device fallback honest too).
      const payList: any[] = (pays.payments ?? []).filter((p: any) => !p.status || p.status === 'approved');
      const credit = entryList.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);
      const coll = payList.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const byMethod = new Map<string, { count: number; total: number }>();
      for (const p of payList) {
        const method = p.payment_method || 'unknown';
        const cur = byMethod.get(method) || { count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(p.amount || 0);
        byMethod.set(method, cur);
      }
      return {
        book: {
          day,
          credit_total: credit || Number(stats.todayEntriesTotalSum || 0),
          credit_count: entryList.length || Number(stats.todayEntriesCount || 0),
          collection_total: coll,
          collection_count: payList.length,
          net: credit - coll,
          by_method: [...byMethod.entries()].map(([method, v]) => ({ method, ...v })),
          by_staff: [],
        },
        source: 'local' as const,
      };
    },
    placeholderData: keepPreviousData,
  });
}

export function useCustomerBalance(id?: string) {
  return useQuery<any, Error, any, any>({
    queryKey: ['customer-balance', id],
    queryFn: async () => {
      if (!id) throw new Error('Missing customer id');
      const res = await api.getCustomerBalance(id);
      if (!res.ok) throw new Error('Failed to load customer balance');
      const data = await res.json();
      return Number(data.balance) || 0;
    },
    enabled: !!id,
  });
}



export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (payload) => {
      const res = await api.createCustomer(payload);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create customer");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (payload) => {
      const { id, ...rest } = payload;
      const res = await api.updateCustomer(id, rest);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update customer");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer", variables.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["customer-balance", variables.id] });
    },
  });
}
export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (id) => {
      const res = await api.deleteCustomer(id);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete customer");
      }
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
export function useCreateEntry() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (payload) => {
      const res = await api.createEntry(payload);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create entry");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      if (variables?.customer_id) {
        qc.invalidateQueries({ queryKey: ["customer", variables.customer_id] });
        qc.invalidateQueries({ queryKey: ["customer-balance", variables.customer_id] });
      }
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["today-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
    },
  });
}
export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (payload) => {
      const res = await api.updateEntry(payload);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update entry");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      if (variables?.customer_id) {
        qc.invalidateQueries({ queryKey: ["customer", variables.customer_id] });
        qc.invalidateQueries({ queryKey: ["customer-balance", variables.customer_id] });
      }
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["today-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
    },
  });
}
export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (entry_id) => {
      const res = await api.deleteEntry(entry_id);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete entry");
      }
      return entry_id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer"] });
      qc.invalidateQueries({ queryKey: ["customer-balance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["today-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
    },
  });
}
export function usePaymentReceived() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (payload) => {
      const res = await api.paymentReceived(payload);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to receive payment");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      if (variables?.customer_id) {
        qc.invalidateQueries({ queryKey: ["customer", variables.customer_id] });
        qc.invalidateQueries({ queryKey: ["customer-balance", variables.customer_id] });
      }
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
      qc.invalidateQueries({ queryKey: ["today-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (payload) => {
      const res = await api.updatePayment(payload);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update payment");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      if (variables?.customer_id) {
        qc.invalidateQueries({ queryKey: ["customer", variables.customer_id] });
        qc.invalidateQueries({ queryKey: ["customer-balance", variables.customer_id] });
      }
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
      qc.invalidateQueries({ queryKey: ["today-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
export function useEntry(id?: string) {
  return useQuery({
    queryKey: ['entry', id],
    queryFn: async () => {
      if (!id) throw new Error('Missing entry id');
      const res = await api.getEntry(id);
      if (!res.ok) throw new Error('Failed to load entry');
      return res.json();
    },
    enabled: !!id,
  });
}
export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (payment_id) => {
      const res = await api.deletePayment(payment_id);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete payment");
      }
      return payment_id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer"] });
      qc.invalidateQueries({ queryKey: ["customer-balance"] });
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
      qc.invalidateQueries({ queryKey: ["today-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}


