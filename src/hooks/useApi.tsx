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

export function useLedgerReport() {
  return useQuery<any, Error, any, any>({
    queryKey: ['ledger-report'],
    queryFn: async () => {
      const res = await api.getLedgerReport();
      if (!res.ok) throw new Error('Failed to load ledger report');
      return res.json();
    },
  });
}

export function useCustomers(search?: string, page?: number, pageSize?: number, filter?: string) {
  return useQuery<any, Error, any, any>({
    queryKey: ['customers', search ?? '', page ?? 1, pageSize ?? 50, filter ?? 'all'],
    queryFn: async () => {
      const res = await api.listCustomers(search, page, pageSize, filter);
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
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation<any, Error, any, any>({
    mutationFn: async (payload) => {
      const res = await api.recordPayment(payload);
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


