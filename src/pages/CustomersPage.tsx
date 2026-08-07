import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { api } from '../lib/api';
import { formatDate, formatCurrency } from '../lib/utils';
import { Customer } from '../types';
import { debugError } from '../lib/utils';
import { Skeleton, SkeletonCard, SkeletonSearchBar } from '../components/ui/Skeleton';

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(query) ||
        customer.phone.includes(query) ||
        customer.customer_code.toLowerCase().includes(query)
      );
      setFilteredCustomers(filtered);
    }
  }, [searchQuery, customers]);

  const loadCustomers = async () => {
    try {
      const response = await api.listCustomers();
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers);
        setFilteredCustomers(data.customers);
      }
    } catch (error) {
      debugError('Failed to load customers:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <div className="flex space-x-2">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        </div>

        {/* Search Bar Skeleton */}
        <SkeletonSearchBar />

        {/* Customer Cards Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

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

      <Input
        type="text"
        placeholder="Search by name, phone, or customer code..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-md"
      />

      {filteredCustomers.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">
            {searchQuery ? 'No customers found matching your search.' : 'No customers yet. Add your first customer to get started.'}
          </p>
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map(customer => (
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
                      {customer.advance_balance && customer.advance_balance > 0 && (
                        <span className="text-xs font-semibold text-green-600">
                          Adv: {formatCurrency(customer.advance_balance)}
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
          {filteredCustomers.map(customer => (
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
                  {customer.advance_balance && customer.advance_balance > 0 && (
                    <span className="text-sm font-semibold text-green-600">
                      Adv: {formatCurrency(customer.advance_balance)}
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
    </div>
  );
}