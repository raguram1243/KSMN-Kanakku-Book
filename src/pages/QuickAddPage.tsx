import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatCurrency, debugError } from '../lib/utils';
import { Customer } from '../types';
import { FileItem } from '../components/ui/MultiFileUpload';
import { MultiFileUpload } from '../components/ui/MultiFileUpload';
import { Modal } from '../components/ui/Modal';
import { AIScanButton } from '../components/ai/AIScanButton';
import { useAIScanStore } from '../store/aiScanStore';
import { InvoiceExtractor } from '../services/ai/InvoiceExtractor';
import { DocumentClassifier } from '../services/ai/DocumentClassifier';

interface LineItem {
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

export function QuickAddPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const entryId = searchParams.get('entry_id');
  const isEditMode = !!entryId;
  const [entryMode, setEntryMode] = useState<'detailed' | 'quick'>('quick');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [todayStats, setTodayStats] = useState<{ todayEntriesCount: number; todayEntriesTotalSum: number } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '', notes: '', customer_type: 'walk-in' as 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate' });
  
  // Quick mode fields
  const [quickDescription, setQuickDescription] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  
  // Detailed mode fields
  const [lineItems, setLineItems] = useState<LineItem[]>([{ item_name: '', qty: 0, rate: 0, amount: 0 }]);
  
  // Common fields
  const [entryNotes, setEntryNotes] = useState('');
  const [attachments, setAttachments] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editPaidAmount, setEditPaidAmount] = useState<number | null>(null);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [newEntryId, setNewEntryId] = useState<string | null>(null);
  const [newEntryCode, setNewEntryCode] = useState<string>('');
  const [newEntryTotal, setNewEntryTotal] = useState(0);
  const [applyingAdvance, setApplyingAdvance] = useState(false);
  const [advanceDialogCustomerId, setAdvanceDialogCustomerId] = useState<string>('');

  // Check for pre-selected customer from URL params
  useEffect(() => {
    const customerId = searchParams.get('customer_id');
    if (customerId) {
      loadPreSelectedCustomer(customerId);
    }
  }, [searchParams]);

  // Edit mode: load existing entry data
  useEffect(() => {
    if (entryId) {
      loadEntryForEdit(entryId);
    }
  }, [entryId]);

  const loadEntryForEdit = async (id: string) => {
    try {
      const response = await api.getEntry(id);
      if (response.ok) {
        const data = await response.json();
        const entry = data.entry;
        // Load customer
        await loadPreSelectedCustomer(entry.customer_id);
        // Set entry mode
        setEntryMode(entry.entry_mode);
        // Set paid amount for hint
        setEditPaidAmount(Number(entry.paid_amount) || 0);
        // Prefill fields based on mode
        if (entry.entry_mode === 'quick') {
          setQuickDescription(entry.description || '');
          setQuickAmount(entry.total_amount?.toString() || '');
        } else {
          // Prefill line items
          if (entry.items && entry.items.length > 0) {
            setLineItems(entry.items.map((item: any) => ({
              item_name: item.item_name,
              qty: item.qty,
              rate: item.rate,
              amount: item.amount,
            })));
          }
        }
        // Prefill notes
        setEntryNotes(entry.notes || '');
      }
    } catch (error) {
      debugError('Failed to load entry for edit:', error);
    }
  };

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchCustomers();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Load recent customers and stats on mount
  useEffect(() => {
    loadRecentCustomers();
    loadTodayStats();
  }, []);

  const loadPreSelectedCustomer = async (customerId: string) => {
    try {
      const response = await api.getCustomer(customerId);
      if (response.ok) {
        const data = await response.json();
        setSelectedCustomer(data.customer);
      }
    } catch (error) {
      debugError('Failed to load pre-selected customer:', error);
    }
  };

  const loadRecentCustomers = async () => {
    try {
      const response = await api.listRecentCustomers(4);
      if (response.ok) {
        const data = await response.json();
        setRecentCustomers(data.customers);
      }
    } catch (error) {
      debugError('Failed to load recent customers:', error);
    }
  };

  const loadTodayStats = async () => {
    try {
      const response = await api.getTodayStats();
      if (response.ok) {
        const data = await response.json();
        setTodayStats(data);
      }
    } catch (error) {
      debugError('Failed to load today stats:', error);
    }
  };

  const searchCustomers = async () => {
    try {
      const response = await api.listCustomers(searchQuery);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.customers);
      }
    } catch (error) {
      debugError('Search failed:', error);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.createCustomer(newCustomer);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create customer');
      }

      const data = await response.json();
      setSelectedCustomer(data.customer);
      setShowCreateCustomer(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setLoading(false);
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { item_name: '', qty: 0, rate: 0, amount: 0 }]);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-calculate amount
    if (field === 'qty' || field === 'rate') {
      updated[index].amount = Number(updated[index].qty) * Number(updated[index].rate);
    }
    
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const getTotalAmount = () => {
    if (entryMode === 'quick') {
      return parseFloat(quickAmount) || 0;
    } else {
      return lineItems.reduce((sum, item) => sum + item.amount, 0);
    }
  };

  // Load customer balance when customer is selected
  useEffect(() => {
    if (selectedCustomer) {
      loadCustomerBalance(selectedCustomer.id);
    } else {
      setCustomerBalance(null);
    }
  }, [selectedCustomer]);

  const loadCustomerBalance = async (customerId: string) => {
    try {
      const response = await api.getCustomer(customerId);
      if (response.ok) {
        const data = await response.json();
        setCustomerBalance(data.customer.balance || 0);
      }
    } catch (error) {
      debugError('Failed to load customer balance:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      setError('Please select a customer');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const totalAmount = getTotalAmount();
      if (totalAmount <= 0) {
        throw new Error('Total amount must be greater than 0');
      }

      // Upload attachments if present
      const uploadedAttachments = await Promise.all(
        attachments.map(async (item) => {
          const response = await api.uploadAttachment(item.file, 'entry');
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Upload failed');
          }
          const result = await response.json();
          return {
            file_url: result.url,
            file_type: result.file_type,
          };
        })
      );

      // Create or update credit entry
      if (isEditMode && entryId) {
        // Edit mode: update existing entry
        const updateData: any = {
          entry_id: entryId,
          total_amount: totalAmount,
        };

        if (entryMode === 'quick') {
          updateData.description = quickDescription;
        } else {
          updateData.items = lineItems.filter(item => item.item_name && item.qty > 0);
        }

        if (entryNotes) {
          updateData.notes = entryNotes;
        }

        const updateResponse = await api.updateEntry(updateData);

        if (!updateResponse.ok) {
          const data = await updateResponse.json();
          throw new Error(data.error || 'Failed to update entry');
        }

        alert('Credit entry updated successfully!');
        navigate(`/customers/${selectedCustomer.id}`);
      } else {
        // Create mode: create new entry
        const entryData: any = {
          customer_id: selectedCustomer.id,
          entry_mode: entryMode,
          total_amount: totalAmount,
          attachments: uploadedAttachments,
        };

        if (entryMode === 'quick') {
          entryData.description = quickDescription;
        }

        if (entryNotes) {
          entryData.notes = entryNotes;
        }

        const entryResponse = await api.createEntry(entryData);

        if (!entryResponse.ok) {
          const data = await entryResponse.json();
          throw new Error(data.error || 'Failed to create entry');
        }

        const createdEntryData = await entryResponse.json();
        const newEntry = createdEntryData.entry;

        // Capture customer ID before resetting form (selectedCustomer will be cleared below)
        const customerIdForAdvance = selectedCustomer.id;
        setAdvanceDialogCustomerId(customerIdForAdvance);

        // Reset form
        setSelectedCustomer(null);
        setQuickDescription('');
        setQuickAmount('');
        setLineItems([{ item_name: '', qty: 0, rate: 0, amount: 0 }]);
        setAttachments([]);
        setEntryNotes('');

        // Check for advance balance to suggest applying
        if (customerIdForAdvance) {
          const customerResponse = await api.getCustomer(customerIdForAdvance);
          if (customerResponse.ok) {
            const customerData = await customerResponse.json();
            const advanceBalance = customerData.customer.advance_balance || 0;
            if (advanceBalance > 0 && newEntry) {
              setAdvanceAmount(advanceBalance);
              setNewEntryId(newEntry.id);
              setNewEntryCode(newEntry.entry_code);
              setNewEntryTotal(Number(newEntry.total_amount));
              setShowAdvanceModal(true);
              return; // Don't navigate yet, wait for modal
            }
          }
        }

        alert('Credit entry created successfully!');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create entry');
    } finally {
      setLoading(false);
    }
  };

  // Auto-fill from AI scan
  useEffect(() => {
    const scanResult = useAIScanStore.getState().scanResult;
    if (scanResult && DocumentClassifier.isCreditInvoice(scanResult)) {
      const extracted = scanResult.extractedData;
      if (extracted && 'items' in extracted) {
        const prefilled = InvoiceExtractor.toPrefilledEntry(extracted, scanResult.confidence);
        
        // Prefill customer
        if (prefilled.customerName) {
          // Try to find customer by name or phone
          const matchCustomer = async () => {
            const response = await api.listCustomers(prefilled.customerName);
            if (response.ok) {
              const data = await response.json();
              const found = data.customers.find((c: Customer) => 
                c.name.toLowerCase() === prefilled.customerName?.toLowerCase() ||
                c.phone === prefilled.phoneNumber
              );
              if (found) setSelectedCustomer(found);
            }
          };
          matchCustomer();
        }

        // Smart mode selection: use detailed mode only if we have meaningful line items
        const hasDetailedItems = prefilled.lineItems.length >= 2 && 
                                 prefilled.lineItems[0].item_name.trim() !== '';

        if (hasDetailedItems) {
          // Use detailed mode with line items
          setEntryMode('detailed');
          setLineItems(prefilled.lineItems);
        } else {
          // Use quick mode with description and total
          setEntryMode('quick');
          if (prefilled.description) {
            setQuickDescription(prefilled.description);
          }
          if (prefilled.totalAmount > 0) {
            setQuickAmount(prefilled.totalAmount.toString());
          }
        }

        // Prefill notes (common to both modes)
        if (prefilled.notes) {
          setEntryNotes(prefilled.notes);
        }

        // Clear scan result after using it
        useAIScanStore.getState().clearScan();

        // Clear scan result after using it
        useAIScanStore.getState().clearScan();
      }
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{isEditMode ? 'Edit Credit Entry' : 'Add Credit Entry'}</h1>
        {!isEditMode && <AIScanButton variant="primary" />}
      </div>

      {/* Advance Credit Suggestion Modal */}
      <Modal
        isOpen={showAdvanceModal}
        onClose={() => {
          setShowAdvanceModal(false);
          navigate(`/customers/${advanceDialogCustomerId || ''}`);
        }}
        title="Apply Advance Credit?"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            This customer has <strong>{formatCurrency(advanceAmount)}</strong> advance credit.
          </p>
          <p className="text-gray-600 text-sm">
            Apply <strong>{formatCurrency(Math.min(advanceAmount, newEntryTotal))}</strong> to this new bill ({newEntryCode})?
          </p>
          <div className="flex space-x-3 pt-2">
            <Button
              onClick={async () => {
                setApplyingAdvance(true);
                try {
                  // Safety check: guard against empty customer_id
                  if (!advanceDialogCustomerId) {
                    alert('Something went wrong — please refresh and try again');
                    setApplyingAdvance(false);
                    return;
                  }
                  const applyAmount = Math.min(advanceAmount, newEntryTotal);
                  const res = await api.applyAdvance({
                    customer_id: advanceDialogCustomerId,
                    credit_entry_id: newEntryId || '',
                    amount: applyAmount,
                  });
                  if (res.ok) {
                    setShowAdvanceModal(false);
                    alert(`Applied ${formatCurrency(applyAmount)} advance credit to ${newEntryCode}`);
                    navigate(`/customers/${advanceDialogCustomerId}`);
                  } else {
                    const data = await res.json();
                    alert(data.error || 'Failed to apply advance credit');
                  }
                } catch (err) {
                  alert('Failed to apply advance credit');
                } finally {
                  setApplyingAdvance(false);
                }
              }}
              disabled={applyingAdvance}
              className="flex-1"
            >
              {applyingAdvance ? 'Applying...' : 'Apply'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowAdvanceModal(false);
                navigate(`/customers/${advanceDialogCustomerId || ''}`);
              }}
              disabled={applyingAdvance}
              className="flex-1"
            >
              Skip
            </Button>
          </div>
        </div>
      </Modal>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Customer Selection */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">1. Select Customer</h2>
        
        {selectedCustomer ? (
          <div className="flex items-center justify-between p-4 bg-primary-50 rounded-lg">
            <div>
              <div className="font-semibold text-gray-900">{selectedCustomer.name}</div>
              <div className="text-sm text-gray-600">{selectedCustomer.customer_code} • {selectedCustomer.phone}</div>
              {customerBalance !== null && (
                <div className="text-sm font-medium text-red-600 mt-1">
                  Currently owes: {formatCurrency(customerBalance)}
                </div>
              )}
            </div>
            {!isEditMode && (
              <Button variant="secondary" size="sm" onClick={() => setSelectedCustomer(null)}>
                Change
              </Button>
            )}
          </div>
        ) : (
          isEditMode ? (
            <p className="text-gray-500 text-center py-4">Loading entry data...</p>
          ) : (
          <div className="space-y-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by name, phone, or customer code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {searchResults.map(customer => (
                    <div
                      key={customer.id}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      <div className="font-medium text-gray-900">{customer.name}</div>
                      <div className="text-sm text-gray-500">{customer.customer_code} • {customer.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recently active customers (4-item grid) */}
            {recentCustomers.length > 0 && !searchQuery && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-700">Recently Active Customers</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {recentCustomers.map(customer => (
                    <div
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="p-3 bg-white border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow-sm cursor-pointer transition-all flex flex-col justify-between h-24"
                    >
                      <div>
                        <div className="font-medium text-gray-900 truncate">{customer.name}</div>
                        <div className="text-xs text-gray-500">{customer.customer_code}</div>
                      </div>
                      <div className="mt-1">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          customer.customer_type === 'regular'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-gray-50 text-gray-700 border border-gray-200'
                        }`}>
                          {customer.customer_type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Today's Activity Stats Strip */}
            {todayStats && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Today's Activity</div>
                  <div className="text-sm text-gray-700 mt-1 font-medium">
                    Credit entries added: <span className="text-gray-900 font-bold">{todayStats.todayEntriesCount}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Total Combined Value</div>
                  <div className="text-lg font-bold text-primary-700 mt-0.5">
                    {formatCurrency(todayStats.todayEntriesTotalSum)}
                  </div>
                </div>
              </div>
            )}

            <div className="text-center">
              <span className="text-sm text-gray-600">or</span>
            </div>

            {!showCreateCustomer ? (
              <Button
                variant="secondary"
                onClick={() => setShowCreateCustomer(true)}
                className="w-full"
              >
                + Create New Customer
              </Button>
            ) : (
              <form onSubmit={handleCreateCustomer} className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <Input
                  label="Customer Name"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  required
                />
                <Input
                  label="Phone"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  required
                />
                <Input
                  label="Address (optional)"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  placeholder="Customer address"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={newCustomer.notes}
                    onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                    placeholder="Any notes about this customer..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={newCustomer.customer_type}
                    onChange={(e) => setNewCustomer({ ...newCustomer, customer_type: e.target.value as 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="walk-in">Walk-in</option>
                    <option value="regular">Regular</option>
                    <option value="contractor">Contractor</option>
                    <option value="wholesale">Wholesale/Dealer</option>
                    <option value="corporate">Corporate/Institutional</option>
                  </select>
                </div>
                <div className="flex space-x-2">
                  <Button type="submit" size="sm" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Customer'}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreateCustomer(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
          )
        )}
      </Card>

      {/* Entry Mode Selection */}
      {selectedCustomer && (
        <>
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">2. Entry Mode</h2>
            {isEditMode ? (
              <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
                {entryMode === 'quick' ? 'Quick Entry' : 'Detailed Entry'} (locked in edit mode)
              </div>
            ) : (
              <div className="flex space-x-4">
                <Button
                  variant={entryMode === 'quick' ? 'primary' : 'secondary'}
                  onClick={() => setEntryMode('quick')}
                  className="flex-1"
                >
                  Quick Entry
                </Button>
                <Button
                  variant={entryMode === 'detailed' ? 'primary' : 'secondary'}
                  onClick={() => setEntryMode('detailed')}
                  className="flex-1"
                >
                  Detailed Entry
                </Button>
              </div>
            )}
          </Card>

          {/* Entry Details */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">3. Entry Details</h2>
            
            {entryMode === 'quick' ? (
              <div className="space-y-4">
                <Input
                  label="Description"
                  value={quickDescription}
                  onChange={(e) => setQuickDescription(e.target.value)}
                  placeholder="e.g., Cement bags, Sand, etc."
                  required
                />
                <Input
                  label="Total Amount (₹)"
                  type="number"
                  step="0.01"
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
                {isEditMode && editPaidAmount !== null && editPaidAmount > 0 && (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    ₹{formatCurrency(editPaidAmount)} already paid — amount can't go below this
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {lineItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Input
                        label={index === 0 ? 'Item Name' : ''}
                        value={item.item_name}
                        onChange={(e) => updateLineItem(index, 'item_name', e.target.value)}
                        placeholder="Item name"
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label={index === 0 ? 'Qty' : ''}
                        type="number"
                        step="0.01"
                        value={item.qty || ''}
                        onChange={(e) => updateLineItem(index, 'qty', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label={index === 0 ? 'Rate (₹)' : ''}
                        type="number"
                        step="0.01"
                        value={item.rate || ''}
                        onChange={(e) => updateLineItem(index, 'rate', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label={index === 0 ? 'Amount (₹)' : ''}
                        type="number"
                        value={item.amount.toFixed(2)}
                        readOnly
                      />
                    </div>
                    <div className="col-span-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeLineItem(index)}
                        disabled={lineItems.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="secondary" onClick={addLineItem} size="sm">
                  + Add Item
                </Button>
                <div className="text-right text-lg font-semibold text-gray-900">
                  Total: {formatCurrency(getTotalAmount())}
                </div>
                {isEditMode && editPaidAmount !== null && editPaidAmount > 0 && (
                  <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    ₹{formatCurrency(editPaidAmount)} already paid — amount can't go below this
                  </div>
                )}
              </div>
            )}

            {/* Entry Notes */}
            <div className="mt-6 pt-6 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                placeholder="Any notes about this entry..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Multi-file Attachments */}
            <div className="pt-6 border-t">
              <MultiFileUpload
                label="Attachments (optional, up to 3 files)"
                maxFiles={3}
                files={attachments}
                onFilesChange={setAttachments}
                attachmentType="entry"
              />
            </div>

            <div className="mt-6 pt-6 border-t">
              <Button
                onClick={handleSubmit}
                disabled={loading || !selectedCustomer}
                className="w-full"
                size="lg"
              >
                {loading ? 'Saving...' : (isEditMode ? 'Update Credit Entry' : 'Save Credit Entry')}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}