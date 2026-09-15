import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, debugError } from '../../lib/utils';
import { Customer, CreditEntry, Payment } from '../../types';
import { buildLedgerTransactions } from '../../lib/ledger';
import { PaginationControls } from '../ui/PaginationControls';
import { useClientPagination } from '../../hooks/useClientPagination';
import { Skeleton, SkeletonCard, SkeletonListItem, SkeletonButton } from '../ui/Skeleton';

interface CustomerLedgerModalProps {
  customerId: string | null;
  onClose: () => void;
}

export function CustomerLedgerModal({ customerId, onClose }: CustomerLedgerModalProps) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<CreditEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId) {
      loadCustomerData();
    }
  }, [customerId]);

  const loadCustomerData = async () => {
    try {
      const response = await api.getCustomer(customerId!);
      if (response.ok) {
        const data = await response.json();
        setCustomer(data.customer);
        setEntries(data.entries || []);
        setPayments(data.payments || []);
      }
    } catch (error) {
      debugError('Failed to load customer data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCredit = () => {
    onClose();
    navigate(`/add-credit?customer_id=${customerId}`);
  };

  const handlePaymentReceived = () => {
    onClose();
    navigate(`/payment-received/${customerId}`);
  };

  // Memoised: this rebuilt and re-sorted the whole ledger on every render.
  const ledgerTransactions = useMemo(() => buildLedgerTransactions(entries, payments), [entries, payments]);
  const pager = useClientPagination(ledgerTransactions, 25, customerId ?? '');

  if (!customerId) return null;

  const totalOutstanding = entries.reduce((sum, entry) => sum + Number(entry.balance), 0);

  return (
    <Modal isOpen={!!customerId} onClose={onClose} title="Customer Ledger" size="xl">
      {loading ? (
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-4 w-40" />
          </div>

          {/* Net Outstanding Skeleton */}
          <SkeletonCard>
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-10 w-40" />
          </SkeletonCard>

          {/* Action Buttons Skeleton */}
          <div className="flex space-x-3">
            <SkeletonButton className="w-32" />
            <SkeletonButton className="w-40" />
          </div>

          {/* Ledger Table Skeleton */}
          <SkeletonCard>
            <Skeleton className="h-5 w-1/4 mb-4" />
            <div className="space-y-2">
              <SkeletonListItem />
              <SkeletonListItem />
              <SkeletonListItem />
              <SkeletonListItem />
            </div>
          </SkeletonCard>
        </div>
      ) : !customer ? (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">Customer not found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Customer Header */}
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{customer.name}</h3>
            <p className="text-gray-600 dark:text-gray-400">
              {customer.customer_code} • {customer.phone}
            </p>
            <div className="mt-2">
              <Badge variant={customer.customer_type === 'regular' ? 'info' : 'default'}>
                {customer.customer_type}
              </Badge>
            </div>
          </div>

          {/* Net Outstanding */}
          <Card>
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Net Outstanding</div>
            <div className={`text-3xl font-bold ${totalOutstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {formatCurrency(totalOutstanding)}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Total Entries: {entries.length} • Unpaid: {entries.filter(e => e.status === 'unpaid').length} • Partial: {entries.filter(e => e.status === 'partial').length} • Paid: {entries.filter(e => e.status === 'paid').length}
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <Button variant="secondary" onClick={handleAddCredit} className="flex-1">
              Add Credit Entry
            </Button>
            <Button onClick={handlePaymentReceived} className="flex-1">
              Payment Received
            </Button>
          </div>

          {/* Ledger Table */}
          <Card>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Full Ledger</h4>
            {ledgerTransactions.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No transactions yet.</p>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Date & Time</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Reference</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Description</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Debit</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Credit</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Balance</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {/* Opening Balance Row */}
                      {pager.page === 1 && (<tr className="bg-gray-100 dark:bg-gray-700 italic">
                        <td colSpan={3} className="px-3 py-2 text-gray-600 dark:text-gray-400">Opening Balance</td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">-</td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">-</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(0)}</td>
                        <td colSpan={2}></td>
                      </tr>)}

                      {/* Transaction Rows */}
                      {pager.pageRows.map(transaction => (
                        <tr key={transaction.id} className="border-b border-gray-200 dark:border-gray-700">
                          <td className="px-3 py-2 text-gray-900 dark:text-white">{formatDateTime(transaction.date)}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{transaction.reference}</td>
                          <td className="px-3 py-2 text-gray-900 dark:text-white">{transaction.description}</td>
                          <td className={`px-3 py-2 text-right font-medium ${transaction.debit > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                            {transaction.debit > 0 ? formatCurrency(transaction.debit) : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${transaction.credit > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                            {transaction.credit > 0 ? formatCurrency(transaction.credit) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(transaction.balance)}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant={transaction.type === 'entry' ? 'info' : 'success'}>
                              {transaction.type === 'entry' ? 'Entry' : 'Payment'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {transaction.status && (
                              <Badge variant={transaction.status === 'paid' ? 'success' : transaction.status === 'partial' ? 'warning' : 'danger'}>
                                {transaction.status}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-3">
                  {/* Opening Balance Card */}
                  {pager.page === 1 && (<div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg italic">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">Opening Balance</span>
                      <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(0)}</span>
                    </div>
                  </div>)}

                  {/* Transaction Cards */}
                  {pager.pageRows.map(transaction => (
                    <div key={transaction.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{formatDateTime(transaction.date)}</div>
                          <Badge variant={transaction.type === 'entry' ? 'info' : 'success'}>
                            {transaction.type === 'entry' ? 'Entry' : 'Payment'}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-gray-700 dark:text-gray-300">{transaction.reference}</div>
                        <div className="text-sm text-gray-900 dark:text-white">{transaction.description}</div>
                        
                        <div className="flex items-center justify-between pt-2 border-t">
                          {transaction.debit > 0 && (
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">Debit: </span>
                              <span className="text-sm font-medium text-red-600 dark:text-red-400">{formatCurrency(transaction.debit)}</span>
                            </div>
                          )}
                          {transaction.credit > 0 && (
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">Credit: </span>
                              <span className="text-sm font-medium text-green-600 dark:text-green-400">{formatCurrency(transaction.credit)}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Balance: </span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(transaction.balance)}</span>
                          </div>
                        </div>

                        {transaction.status && (
                          <div className="pt-2 border-t">
                            <Badge variant={transaction.status === 'paid' ? 'success' : transaction.status === 'partial' ? 'warning' : 'danger'}>
                              {transaction.status}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {pager.total > 25 && (
                  <PaginationControls
                    page={pager.page}
                    totalPages={pager.totalPages}
                    pageSize={pager.pageSize}
                    total={pager.total}
                    onPageChange={pager.setPage}
                  />
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </Modal>
  );
}