import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusPill } from '../components/ui/StatusPill';
import { Alert } from '../components/ui/Alert';
import { formatDate, formatCurrency } from '../lib/utils';
import { Customer } from '../types';
import { SkeletonCard } from '../components/ui/Skeleton';
import { CreateCustomerModal } from '../components/customer/CreateCustomerModal';
import { useCustomers } from '../hooks/useApi';
import { PaginationControls, PaginationSkeleton } from '../components/ui/PaginationControls';

const PAGE_SIZE = 20;

const OVERDUE_DEFAULTS: Record<string, number> = {
  'walk-in': 30,
  'regular': 45,
  'contractor': 45,
  'wholesale': 30,
  'corporate': 45,
}

function getOverdueStatus(customer: Customer): { isOverdue: boolean; label: string } | null {
  if (!customer.oldest_unpaid_date) return null

  const daysSince = Math.floor((Date.now() - new Date(customer.oldest_unpaid_date).getTime()) / (1000 * 60 * 60 * 24))
  const threshold = customer.custom_overdue_days ?? OVERDUE_DEFAULTS[customer.customer_type] ?? 30

  if (daysSince > threshold) {
    return { isOverdue: true, label: `Overdue — ${daysSince} days` }
  }

  const daysRemaining = threshold - daysSince
  if (daysRemaining <= 7) {
    return { isOverdue: false, label: `Due in ${daysRemaining} days` }
  }

  return null
}

export function CustomersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'newest' | 'oldest' | 'balance_desc' | 'balance_asc'>('name_asc');
  const [page, setPage] = useState(1);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Debounce the search box (300ms) so the server is only queried after the
  // user stops typing, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Go back to the first page whenever the search term or filter changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filter]);

  const customersQuery = useCustomers(debouncedSearch, page, PAGE_SIZE, filter, sortBy);

  const customers = (customersQuery.data?.customers ?? []) as Customer[];
  const total = customersQuery.data?.total ?? 0;
  const loading = customersQuery.isLoading;
  const error = (customersQuery.error as Error)?.message || null;

  // Sorting is now applied server-side by the list_customers RPC across the
  // full dataset before pagination, so the page is returned in the correct
  // global order. No client-side re-sort needed (and doing one would be wrong
  // — it would re-introduce the per-page sort bug).

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    const state = location.state as { toast?: string } | null;
    if (state && state.toast) {
      setToast(state.toast);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Customers</h1>
        <div className="flex space-x-2">
          <Button
            variant={view === 'grid' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('grid')}
          >
            Grid
          </Button>
          <Button
            variant={view === 'list' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('list')}
          >
            List
          </Button>
        </div>
      </div>

      {toast && (
        <Alert variant="success" onClose={() => setToast(null)} className="mb-0">
          {toast}
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Input
          type="text"
          placeholder="Search by name, phone, or customer code..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md flex-1"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          aria-label="Filter customers"
        >
          <option value="all">All customers</option>
          <option value="outstanding">Outstanding</option>
          <option value="paid">Fully Paid</option>
          <option value="advance">Has Advance</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          aria-label="Sort customers"
        >
          <option value="name_asc">Name (A-Z)</option>
          <option value="balance_desc">Outstanding Balance: High to Low</option>
          <option value="balance_asc">Outstanding Balance: Low to High</option>
          <option value="newest">Newest Customer First</option>
          <option value="oldest">Oldest Customer First</option>
        </select>
        <Button variant="primary" size="sm" onClick={() => setShowCreateCustomer(true)}>
          + Add Customer
        </Button>
      </div>

      {customersQuery.isFetching && !loading && (
        <PaginationSkeleton rows={view === 'grid' ? 6 : 4} />
      )}

      {error ? (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-500">{error}</p>
            <button
              onClick={() => customersQuery.refetch()}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors focus-ring"
            >
              Retry
            </button>
          </div>
        </Card>
      ) : loading && customers.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            {debouncedSearch || filter !== 'all'
              ? 'No customers found matching your search.'
              : 'No customers yet. Add your first customer to get started.'}
          </p>
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map(customer => (
            <Card
              key={customer.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/customers/${customer.id}`)}
            >
                <div className="space-y-3">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{customer.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{customer.customer_code}</div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="text-gray-600 dark:text-gray-400">📞 {customer.phone}</div>
                    {customer.address && <div className="text-gray-600 dark:text-gray-400">📍 {customer.address}</div>}
                    <div className="text-gray-500 dark:text-gray-400">Created: {formatDate(customer.created_at)}</div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center space-x-2">
                      {(() => {
                        const bal = customer.balance ?? 0;
                        if (bal <= 0) return null;
                        const status = getOverdueStatus(customer);
                        const isOverdue = status?.isOverdue ?? false;
                        const textColor = isOverdue
                          ? 'text-red-600 dark:text-red-400'
                          : status
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-gray-900 dark:text-gray-100';
                        return (
                          <span className={`text-sm font-semibold tabular-nums ${textColor}`}>
                            Owes: {formatCurrency(bal)}
                          </span>
                        );
                      })()}
                      {(customer.advance_balance ?? 0) > 0 && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          Adv: {formatCurrency(customer.advance_balance ?? 0)}
                        </span>
                      )}
                      {(() => {
                        const status = getOverdueStatus(customer)
                        if (!status) return null
                        return (
                          <StatusPill
                            status={status.isOverdue ? 'overdue' : 'partial'}
                            label={status.label}
                            size="sm"
                          />
                        )
                      })()}
                    </div>
                    <Badge variant={customer.customer_type === 'regular' ? 'info' : 'default'}>
                      {customer.customer_type}
                    </Badge>
                  </div>
                </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map(customer => (
            <Card
              key={customer.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/customers/${customer.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-white">{customer.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{customer.customer_code} • {customer.phone}</div>
                </div>
                <div className="flex items-center space-x-3">
                  {(() => {
                    const bal = customer.balance ?? 0;
                    if (bal <= 0) return null;
                    const status = getOverdueStatus(customer);
                    const isOverdue = status?.isOverdue ?? false;
                    const textColor = isOverdue
                      ? 'text-red-600 dark:text-red-400'
                      : status
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-900 dark:text-gray-100';
                    return (
                      <span className={`text-sm font-semibold tabular-nums ${textColor}`}>
                        Owes: {formatCurrency(bal)}
                      </span>
                    );
                  })()}
                  {(customer.advance_balance ?? 0) > 0 && (
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      Adv: {formatCurrency(customer.advance_balance ?? 0)}
                    </span>
                  )}
                  {(() => {
                    const status = getOverdueStatus(customer)
                    if (!status) return null
                    return (
                      <StatusPill
                        status={status.isOverdue ? 'overdue' : 'partial'}
                        label={status.label}
                        size="sm"
                      />
                    )
                  })()}
                  <Badge variant={customer.customer_type === 'regular' ? 'info' : 'default'}>
                    {customer.customer_type}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination footer */}
      <PaginationControls
        page={page}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        isLoading={customersQuery.isFetching}
      />

      {/* Create New Customer (shared modal) */}
      <CreateCustomerModal
        isOpen={showCreateCustomer}
        onClose={() => setShowCreateCustomer(false)}
        onCreated={(_customer: Customer) => {
          setShowCreateCustomer(false);
        }}
      />
    </div>
  );
}
