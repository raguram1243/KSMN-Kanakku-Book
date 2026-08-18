import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatDate, formatCurrency } from '../lib/utils';
import { Customer } from '../types';
import { SkeletonCard } from '../components/ui/Skeleton';
import { CreateCustomerModal } from '../components/customer/CreateCustomerModal';
import { useCustomers } from '../hooks/useApi';

const PAGE_SIZE = 50;

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

  const customersQuery = useCustomers(debouncedSearch, page, PAGE_SIZE, filter);

  const customers = (customersQuery.data?.customers ?? []) as Customer[];
  const total = customersQuery.data?.total ?? 0;
  const loading = customersQuery.isLoading;
  const error = (customersQuery.error as Error)?.message || null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startCount = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endCount = Math.min(page * PAGE_SIZE, total);

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
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
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
        <div className="flex items-center justify-between bg-green-50 border border-green-200 text-green-800 px-4 py-2 rounded-lg text-sm">
          <span>{toast}</span>
          <button
            onClick={() => setToast(null)}
            className="text-green-600 hover:text-green-800 font-medium"
          >
            &times;
          </button>
        </div>
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
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          aria-label="Filter customers"
        >
          <option value="all">All customers</option>
          <option value="outstanding">Outstanding</option>
          <option value="paid">Fully Paid</option>
          <option value="advance">Has Advance</option>
        </select>
        <Button variant="primary" size="sm" onClick={() => setShowCreateCustomer(true)}>
          + Add Customer
        </Button>
      </div>

      {customersQuery.isFetching && !loading && (
        <p className="text-sm text-gray-400">Searching...</p>
      )}

      {error ? (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-500">{error}</p>
            <button
              onClick={() => customersQuery.refetch()}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
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
          <p className="text-center text-gray-500 py-8">
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
                    <div className="font-semibold text-gray-900">{customer.name}</div>
                    <div className="text-sm text-gray-500">{customer.customer_code}</div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="text-gray-600">📞 {customer.phone}</div>
                    {customer.address && <div className="text-gray-600">📍 {customer.address}</div>}
                    <div className="text-gray-500">Created: {formatDate(customer.created_at)}</div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center space-x-2">
                      {(customer.balance ?? 0) > 0 && (
                        <span className="text-sm font-semibold text-red-600">
                          Owes: {formatCurrency(customer.balance ?? 0)}
                        </span>
                      )}
                      {(customer.advance_balance ?? 0) > 0 && (
                        <span className="text-xs font-semibold text-green-600">
                          Adv: {formatCurrency(customer.advance_balance ?? 0)}
                        </span>
                      )}
                      {(() => {
                        const status = getOverdueStatus(customer)
                        if (!status) return null
                        if (status.isOverdue) {
                          return <Badge variant="danger">{status.label}</Badge>
                        }
                        return <span className="text-xs font-semibold text-amber-600">{status.label}</span>
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
                  <div className="font-semibold text-gray-900">{customer.name}</div>
                  <div className="text-sm text-gray-500">{customer.customer_code} • {customer.phone}</div>
                </div>
                <div className="flex items-center space-x-3">
                  {(customer.balance ?? 0) > 0 && (
                    <span className="text-sm font-semibold text-red-600">
                      Owes: {formatCurrency(customer.balance ?? 0)}
                    </span>
                  )}
                  {(customer.advance_balance ?? 0) > 0 && (
                    <span className="text-sm font-semibold text-green-600">
                      Adv: {formatCurrency(customer.advance_balance ?? 0)}
                    </span>
                  )}
                  {(() => {
                    const status = getOverdueStatus(customer)
                    if (!status) return null
                    if (status.isOverdue) {
                      return <Badge variant="danger">{status.label}</Badge>
                    }
                    return <span className="text-xs font-semibold text-amber-600">{status.label}</span>
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
      {total > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">
            Showing {startCount}–{endCount} of {total} customers
          </p>
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || customersQuery.isFetching}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || customersQuery.isFetching}
            >
              Next
            </Button>
          </div>
        </div>
      )}

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
