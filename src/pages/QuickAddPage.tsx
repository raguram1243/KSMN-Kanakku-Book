import { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateCustomerQueries, invalidateEntryQueries } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatCurrency, debugError, safeFileUrl } from '../lib/utils';
import { Customer } from '../types';
import { FileItem } from '../components/ui/MultiFileUpload';
import { MultiFileUpload } from '../components/ui/MultiFileUpload';
import { AIScanButton } from '../components/ai/AIScanButton';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAIScanStore } from '../store/aiScanStore';
import { InvoiceExtractor } from '../services/ai/InvoiceExtractor';
import { DocumentClassifier } from '../services/ai/DocumentClassifier';
import { useToastStore } from '../store/toastStore';
import { ThemedSelect } from '../components/ui/ThemedSelect';
import { useActionProgress } from '../hooks/useActionProgress';
import { UserPlus, IndianRupee, Printer } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { DuplicateCustomerWarning } from '../components/customer/DuplicateCustomerWarning';
import type { SimilarCustomer } from '../components/customer/DuplicateCustomerWarning';
import { BillPreviewDialog } from '../components/bill/BillPreviewDialog';
import { generateAndSaveBill, toBillItems, type GeneratedBill } from '../lib/billUpload';

const CUSTOMER_TYPE_OPTIONS = [
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'regular', label: 'Regular' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'wholesale', label: 'Wholesale/Dealer' },
  { value: 'corporate', label: 'Corporate/Institutional' },
];

interface LineItem {
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

export default function QuickAddPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Staff may only add entries. Balances, credit limits, today's totals,
  // editing an existing entry and AI Scan all call admin-only endpoints, so
  // every one of them is skipped for staff (the server refuses them anyway).
  const { isAdmin } = useAuth();
  const entryId = isAdmin ? searchParams.get('entry_id') : null;
  const isEditMode = !!entryId;
  const [entryMode, setEntryMode] = useState<'detailed' | 'quick'>('quick');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [todayStats, setTodayStats] = useState<{ todayEntriesCount: number; todayEntriesTotalSum: number } | null>(null);
  // Staff arrive from the customer list with the row in router state (they
  // cannot call get-customer); see the ?customer_id= effect below for admin.
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    () => (location.state as { customer?: Customer } | null)?.customer ?? null
  );
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  // Same phone / very alike name found when creating a customer; the next submit confirms.
  const [similarCustomers, setSimilarCustomers] = useState<SimilarCustomer[] | null>(null);
  // Same customer and total saved minutes ago; asks before saving the bill again.
  const [duplicateBill, setDuplicateBill] = useState<{
    entry_code: string; total_amount: number; created_at: string; withBill: boolean
  } | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '', notes: '', customer_type: 'walk-in' as 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate' });
  
  // Quick mode fields
  const [quickDescription, setQuickDescription] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  
  // Detailed mode fields
  const [lineItems, setLineItems] = useState<LineItem[]>([{ item_name: '', qty: 0, rate: 0, amount: 0 }]);
  
  // Common fields
  const [entryNotes, setEntryNotes] = useState('');
  const [attachments, setAttachments] = useState<FileItem[]>([]);
  // The AI Scan photo is already in storage (it had to be uploaded to be
  // analysed), so it is carried over by URL rather than uploaded a second time.
  // `file_url` is the stored identifier sent with the entry; `preview_url` is
  // the short-lived signed link used to show the thumbnail (buckets are private).
  const [scannedAttachment, setScannedAttachment] = useState<{ file_url: string; file_type: string; preview_url?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  // Drives the progress bar inside the two submit buttons; the `loading` flag
  // above still owns disabling and validation.
  const createCustomer = useActionProgress();
  const saveEntry = useActionProgress();
  // Progress for the Print Bill button (save, then make and store the bill).
  const printBillProgress = useActionProgress();
  const [error, setError] = useState('');
  const [editPaidAmount, setEditPaidAmount] = useState<number | null>(null);
  // Edit mode: what is needed to redraw the entry's bill after an update.
  // Only entries that already have a generated bill get it redrawn.
  const [editBillInfo, setEditBillInfo] = useState<{ entryCode: string; createdAt: string; hasGeneratedBill: boolean } | null>(null);
  // The bill just made by Print Bill, shown in the preview dialog.
  const [billPreview, setBillPreview] = useState<{ result: GeneratedBill; customerName: string; phone: string | null } | null>(null);
  // Pre-selected customer. Admin links pass ?customer_id= and the customer is
  // loaded from get-customer. Staff cannot call get-customer, so the staff
  // customer list hands the row it already has over in router state.
  useEffect(() => {
    const customerId = searchParams.get('customer_id');
    if (customerId && isAdmin) {
      loadPreSelectedCustomer(customerId);
    }
  }, [searchParams, isAdmin]);


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
        setEditBillInfo({
          entryCode: entry.entry_code,
          createdAt: entry.created_at,
          hasGeneratedBill: (entry.attachments || []).some((a: { kind?: string }) => a.kind === 'generated_bill'),
        });
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

  // Search once typing pauses rather than on every keystroke, and ignore any
  // response that arrives after a newer query has started, so results for
  // "ra" can never overwrite results for "ragu".
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);
  useEffect(() => {
    if (debouncedSearch.length < 2) return;
    let cancelled = false;
    api
      .listCustomers(debouncedSearch)
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (!cancelled) setSearchResults(data.customers);
      })
      .catch((error) => debugError('Search failed:', error));
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  // Short queries show no results; derived here instead of clearing state in an
  // effect, which cost an extra render per keystroke.
  const visibleSearchResults = searchQuery.trim().length >= 2 ? searchResults : [];

  // Load recent customers and stats on mount
  useEffect(() => {
    loadRecentCustomers();
    if (isAdmin) loadTodayStats();
  }, [isAdmin]);

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


  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    createCustomer.start();

    try {
      const response = await api.createCustomer({ ...newCustomer, confirm_duplicate: similarCustomers !== null });

      if (response.status === 409) {
        const dup = await response.json().catch(() => ({}));
        if (dup.code === 'possible_duplicate') {
          createCustomer.reset();
          setSimilarCustomers(dup.matches ?? []);
          return;
        }
        throw new Error(dup.error || 'Failed to create customer');
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create customer');
      }

      const data = await response.json();
      await createCustomer.succeed();
      invalidateCustomerQueries(queryClient);
      setSelectedCustomer(data.customer);
      setShowCreateCustomer(false);
      setSimilarCustomers(null);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      createCustomer.fail();
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

  // The rows the server will actually store: a name and a quantity above
  // zero. Mirrors normalizeLineItems() in supabase/functions/_shared.
  const getValidLineItems = () =>
    lineItems.filter(item => item.item_name.trim() && Number(item.qty) > 0);

  const getTotalAmount = () => {
    if (entryMode === 'quick') {
      return parseFloat(quickAmount) || 0;
    } else {
      return lineItems.reduce((sum, item) => sum + item.amount, 0);
    }
  };

  // Load customer balance when customer is selected
  // Admin only: staff never see what a customer owes.
  useEffect(() => {
    if (selectedCustomer && isAdmin) {
      loadCustomerBalance(selectedCustomer.id);
    } else {
      setCustomerBalance(null);
    }
  }, [selectedCustomer, isAdmin]);

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

  const handleSubmit = (e: React.FormEvent) => submitEntry(e, false);
  // Print Bill: exactly the same save, then the bill is made, stored with the
  // entry and shown. Detailed entries only.
  const handlePrintBill = (e: React.FormEvent) => submitEntry(e, true);

  const submitEntry = async (e: { preventDefault: () => void }, withBill: boolean, confirmDuplicate = false) => {
    e.preventDefault();
    if (!selectedCustomer) {
      setError('Please select a customer');
      return;
    }

    // Each button drives its own progress bar; everything else is shared.
    const progress = withBill ? printBillProgress : saveEntry;
    setLoading(true);
    setError('');
    progress.start();

    try {
      const totalAmount = getTotalAmount();
      if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        throw new Error('Total amount must be greater than 0');
      }
      if (totalAmount > 9_999_999_999.99) {
        throw new Error('Total amount is too large');
      }

      const validLineItems = entryMode === 'detailed' ? getValidLineItems() : [];
      if (entryMode === 'detailed' && validLineItems.length === 0) {
        throw new Error('Add at least one item with a name and a quantity above zero');
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

      // Freshly uploaded files plus the AI Scan photo, which is already in
      // storage and is carried over by its stored URL (never the signed one).
      const entryAttachments = [
        ...uploadedAttachments,
        ...(scannedAttachment
          ? [{ file_url: scannedAttachment.file_url, file_type: scannedAttachment.file_type }]
          : []),
      ];

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
          updateData.items = validLineItems;
        }

        if (entryNotes) {
          updateData.notes = entryNotes;
        }

        // Files picked during the edit are already in storage by now; without
        // sending them here they would be uploaded and then silently dropped.
        if (entryAttachments.length > 0) {
          updateData.attachments = entryAttachments;
        }

        const updateResponse = await api.updateEntry(updateData);

        if (!updateResponse.ok) {
          const data = await updateResponse.json();
          throw new Error(data.error || 'Failed to update entry');
        }

        await saveEntry.succeed();
        invalidateEntryQueries(queryClient, selectedCustomer.id);

                        useToastStore.getState().addToast({
          type: 'success',
          title: 'Credit entry updated',
          description: 'Credit entry updated successfully',
        });

        // The entry already had a printed bill: redraw it so it matches the
        // edit. Photos and uploaded files are never touched.
        if (entryMode === 'detailed' && editBillInfo?.hasGeneratedBill) {
          await regenerateBill(entryId, validLineItems, selectedCustomer);
          invalidateEntryQueries(queryClient, selectedCustomer.id);
        }
        navigate(`/customers/${selectedCustomer.id}`);
      } else {
        // Create mode: create new entry
        const entryData: any = {
          customer_id: selectedCustomer.id,
          entry_mode: entryMode,
          total_amount: totalAmount,
          attachments: entryAttachments,
        };

        if (entryMode === 'quick') {
          entryData.description = quickDescription;
        } else {
          // Without this the line items never reach the server and the
          // breakdown of a detailed entry is lost at save time.
          entryData.items = validLineItems;
        }

        if (entryNotes) {
          entryData.notes = entryNotes;
        }

        if (confirmDuplicate) entryData.confirm_duplicate = true;

        const entryResponse = await api.createEntry(entryData);

        // Same customer and total saved minutes ago: nothing was written, ask first.
        if (entryResponse.status === 409) {
          const dup = await entryResponse.json().catch(() => ({}));
          if (dup.code === 'possible_duplicate' && dup.duplicate) {
            progress.reset();
            setDuplicateBill({ ...dup.duplicate, withBill });
            return;
          }
          throw new Error(dup.error || 'Failed to create entry');
        }

        if (!entryResponse.ok) {
          const data = await entryResponse.json();
          throw new Error(data.error || 'Failed to create entry');
        }

        invalidateEntryQueries(queryClient, selectedCustomer.id);

        const createdEntryData = await entryResponse.json();
        const newEntry = createdEntryData.entry;

        // Print Bill: the entry is saved; make the bill from what was just
        // entered (staff get no items back) before the form is cleared.
        if (withBill && entryMode === 'detailed') {
          const billCustomer = selectedCustomer;
          try {
            const result = await generateAndSaveBill(
              {
                entryCode: newEntry.entry_code,
                billDate: newEntry.created_at || new Date().toISOString(),
                customerName: billCustomer.name,
                customerCode: billCustomer.customer_code,
                phone: billCustomer.phone,
                items: toBillItems(validLineItems),
                total: Number(newEntry.total_amount) || totalAmount,
              },
              newEntry.id
            );
            setBillPreview({ result, customerName: billCustomer.name, phone: billCustomer.phone ?? null });
            if (!result.saveError) invalidateEntryQueries(queryClient, billCustomer.id);
          } catch (billErr) {
            useToastStore.getState().addToast({
              type: 'error',
              title: 'Entry saved, but the bill could not be made',
              description: billErr instanceof Error && billErr.message ? billErr.message : 'Open the entry later and use Print Bill.',
            });
          }
        }
        await progress.succeed();

        // Reset form
        setSelectedCustomer(null);
        setQuickDescription('');
        setQuickAmount('');
        setLineItems([{ item_name: '', qty: 0, rate: 0, amount: 0 }]);
        setAttachments([]);
        setScannedAttachment(null);
        setEntryNotes('');

                const advanceApplied = createdEntryData.advance_applied || 0;
        if (advanceApplied > 0.01) {
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Credit entry created',
            description: `${formatCurrency(advanceApplied)} advance credit auto-applied to ${newEntry.entry_code}`,
          });
        } else {
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Credit entry created',
            description: `Added to ${selectedCustomer.customer_code || selectedCustomer.name}`,
          });
        }
      }
    } catch (err) {
      progress.fail();
      setError(err instanceof Error ? err.message : 'Failed to create entry');
    } finally {
      setLoading(false);
    }
  };

  // Admin edit of an entry that already had a generated bill: redraw it and
  // replace the old one on the server. Never blocks the update itself.
  const regenerateBill = async (id: string, items: LineItem[], customer: Customer) => {
    if (!editBillInfo) return;
    try {
      const { saveError } = await generateAndSaveBill(
        {
          entryCode: editBillInfo.entryCode,
          billDate: editBillInfo.createdAt,
          customerName: customer.name,
          customerCode: customer.customer_code,
          phone: customer.phone,
          items: toBillItems(items),
          total: items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        },
        id
      );
      if (saveError) throw new Error(saveError);
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Bill updated',
        description: 'The printed bill now matches this entry.',
      });
    } catch (err) {
      useToastStore.getState().addToast({
        type: 'error',
        title: 'Entry updated, but the bill was not',
        description: `${err instanceof Error && err.message ? err.message : 'Please try again'}. Open the entry and use Print Bill.`,
      });
    }
  };

  // Auto-fill from AI scan.
  // Runs on mount (a scan started from another page) and again when the user
  // presses "Confirm & Fill Form". It cannot simply subscribe to the store:
  // the result lands there before the review screen is shown, and clearing it
  // then would blank the review the user is still reading.
  const applyScanResult = useCallback(() => {
    const scanResult = useAIScanStore.getState().scanResult;
    if (scanResult && DocumentClassifier.isCreditInvoice(scanResult)) {
      const extracted = scanResult.extractedData;
      if (extracted && 'grand_total' in extracted) {
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

        // A scan always fills Quick Entry: a summary of the goods plus the bill
        // total. Per-item rates on handwritten bills are not reliable enough to
        // build a Detailed Entry from, and summing them loses any discount.
        setEntryMode('quick');
        if (prefilled.description) {
          setQuickDescription(prefilled.description);
        }
        if (prefilled.totalAmount > 0) {
          setQuickAmount(prefilled.totalAmount.toString());
        }

        // Prefill notes
        if (prefilled.notes) {
          setEntryNotes(prefilled.notes);
        }

        // Keep the scanned photo so it lands on the entry as an attachment.
        if (scanResult.fileUrl) {
          setScannedAttachment({
            file_url: scanResult.fileUrl,
            file_type: scanResult.fileType || 'image',
            preview_url: scanResult.previewUrl,
          });
        }

        // Clear scan result after using it
        useAIScanStore.getState().clearScan();
      }
    }
  }, []);

  useEffect(() => {
    applyScanResult();
  }, [applyScanResult]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{isEditMode ? 'Edit Credit Entry' : 'Add Credit Entry'}</h1>
        {!isEditMode && isAdmin && <AIScanButton variant="primary" onScanComplete={applyScanResult} />}
      </div>



      {error && (
        <Alert variant="error">{error}</Alert>
      )}

      {/* Customer Selection */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">1. Select Customer</h2>
        
        {selectedCustomer ? (
          <div className="flex items-center justify-between p-4 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">{selectedCustomer.name}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{selectedCustomer.customer_code} • {selectedCustomer.phone}</div>
              {customerBalance !== null && (
                <div className="text-sm font-medium text-red-600 dark:text-red-400 mt-1">
                  Currently owes: {formatCurrency(customerBalance)}
                  {selectedCustomer.credit_limit ? (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      (Limit: {formatCurrency(selectedCustomer.credit_limit)})
                    </span>
                  ) : null}
                </div>
              )}
              {isAdmin && selectedCustomer.credit_limit && customerBalance !== null && (
                (() => {
                  const currentAmt = entryMode === 'quick' ? Number(quickAmount || 0) : getTotalAmount();
                  const projected = customerBalance + currentAmt;
                  const limit = Number(selectedCustomer.credit_limit);
                  const over = projected - limit;
                  if (over > 0) {
                    return (
                      <Alert variant="warning" className="mt-2 text-xs py-2 px-3">
                        Credit limit exceeded by {formatCurrency(over)} (new balance will be {formatCurrency(projected)})
                      </Alert>
                    );
                  }
                  return (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Remaining credit available: {formatCurrency(limit - customerBalance)}
                    </div>
                  );
                })()
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
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading entry data...</p>
          ) : (
          <div className="space-y-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by name, phone, or customer code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              
              {visibleSearchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {visibleSearchResults.map(customer => (
                    <div
                      key={customer.id}
                      className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer border-b last:border-b-0"
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{customer.customer_code} • {customer.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recently active customers (4-item grid) */}
            {recentCustomers.length > 0 && !searchQuery && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recently Active Customers</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {recentCustomers.map(customer => (
                    <div
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 hover:shadow-sm cursor-pointer transition-all flex flex-col justify-between h-24"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white truncate">{customer.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{customer.customer_code}</div>
                      </div>
                      <div className="mt-1">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          customer.customer_type === 'regular'
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : 'bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
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
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider">Today's Activity</div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-medium">
                    Credit entries added: <span className="text-gray-900 dark:text-white font-bold">{todayStats.todayEntriesCount}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider">Total Combined Value</div>
                  <div className="text-lg font-bold text-primary-700 dark:text-primary-300 mt-0.5">
                    {formatCurrency(todayStats.todayEntriesTotalSum)}
                  </div>
                </div>
              </div>
            )}

            <div className="text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">or</span>
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
              <form onSubmit={handleCreateCustomer} className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <Input
                  label="Customer Name"
                  value={newCustomer.name}
                  onChange={(e) => { setNewCustomer({ ...newCustomer, name: e.target.value }); setSimilarCustomers(null); }}
                  required
                />
                <Input
                  label="Phone"
                  value={newCustomer.phone}
                  onChange={(e) => { setNewCustomer({ ...newCustomer, phone: e.target.value }); setSimilarCustomers(null); }}
                  required
                />
                <Input
                  label="Address (optional)"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  placeholder="Customer address"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                  <textarea
                    value={newCustomer.notes}
                    onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                    placeholder="Any notes about this customer..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <ThemedSelect
                    value={newCustomer.customer_type}
                    onChange={(value) => setNewCustomer({ ...newCustomer, customer_type: value as 'walk-in' | 'regular' | 'contractor' | 'wholesale' | 'corporate' })}
                    options={CUSTOMER_TYPE_OPTIONS}
                    ariaLabel="Customer type"
                    size="md"
                    menuWidth={250}
                  />
                </div>
                {similarCustomers && similarCustomers.length > 0 && (
                  <DuplicateCustomerWarning
                    matches={similarCustomers}
                    onUse={(m) => {
                      setSelectedCustomer({
                        id: m.id,
                        customer_code: m.code,
                        name: m.name,
                        phone: m.phone ?? '',
                        customer_type: 'regular',
                        last_entry_seq: 0,
                        created_by: '',
                        created_at: '',
                      });
                      setShowCreateCustomer(false);
                      setSimilarCustomers(null);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  />
                )}
                <div className="flex space-x-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={loading}
                    loading={loading}
                    progress={createCustomer.status}
                    progressLabel="Creating"
                    progressIcon={<UserPlus size={14} />}
                  >
                    {similarCustomers ? 'Create anyway' : 'Create Customer'}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => { setShowCreateCustomer(false); setSimilarCustomers(null); }}>
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">2. Entry Mode</h2>
            {isEditMode ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-sm text-gray-600 dark:text-gray-400">
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">3. Entry Details</h2>
            
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
                  <Alert variant="warning">
                    ₹{formatCurrency(editPaidAmount)} already paid — amount can't go below this
                  </Alert>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {lineItems.map((item, index) => (
                  <div key={index} className={`grid grid-cols-2 gap-3 items-end rounded-lg border border-gray-200 dark:border-gray-700 p-3 md:grid-cols-12 md:gap-2 md:rounded-none md:border-0 md:p-0 ${index > 0 ? 'md:[&_label]:hidden' : ''}`}>
                    <div className="col-span-2 md:col-span-4">
                      <Input
                        label="Item Name"
                        value={item.item_name}
                        onChange={(e) => updateLineItem(index, 'item_name', e.target.value)}
                        placeholder="Item name"
                        required
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <Input
                        label="Qty"
                        type="number"
                        step="0.01"
                        value={item.qty || ''}
                        onChange={(e) => updateLineItem(index, 'qty', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <Input
                        label="Rate (₹)"
                        type="number"
                        step="0.01"
                        value={item.rate || ''}
                        onChange={(e) => updateLineItem(index, 'rate', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <Input
                        label="Amount (₹)"
                        type="number"
                        value={item.amount.toFixed(2)}
                        readOnly
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <Button
                        variant="danger"
                        size="sm"
                        className="max-md:min-h-[44px] max-md:w-full"
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
                <div className="text-right text-lg font-semibold text-gray-900 dark:text-white">
                  Total: {formatCurrency(getTotalAmount())}
                </div>
                {isEditMode && editPaidAmount !== null && editPaidAmount > 0 && (
                  <Alert variant="warning">
                    ₹{formatCurrency(editPaidAmount)} already paid — amount can't go below this
                  </Alert>
                )}
              </div>
            )}

            {/* Entry Notes */}
            <div className="mt-6 pt-6 border-t">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                placeholder="Any notes about this entry..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Multi-file Attachments */}
            <div className="pt-6 border-t">
              {scannedAttachment && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Scanned document
                  </label>
                  <div className="flex items-center gap-3 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                    {scannedAttachment.file_type === 'image' && safeFileUrl(scannedAttachment.preview_url) ? (
                      <img
                        src={safeFileUrl(scannedAttachment.preview_url)!}
                        alt="Scanned document"
                        className="h-16 w-16 object-cover rounded"
                      />
                    ) : (
                      <span className="text-2xl">📄</span>
                    )}
                    <div className="flex-1 text-sm text-gray-600 dark:text-gray-400">
                      Will be attached to this entry
                    </div>
                    <button
                      type="button"
                      onClick={() => setScannedAttachment(null)}
                      className="text-sm text-red-600 dark:text-red-400 hover:underline focus-ring"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
              <MultiFileUpload
                label="Attachments (optional, up to 3 files)"
                maxFiles={3}
                files={attachments}
                onFilesChange={setAttachments}
              />
            </div>

            <div className="mt-6 pt-6 border-t">
                            <Button
                onClick={handleSubmit}
                disabled={loading || !selectedCustomer}
                className="w-full"
                loading={loading}
                progress={saveEntry.status}
                progressLabel={isEditMode ? 'Updating' : 'Saving'}
                progressIcon={<IndianRupee size={16} />}
                size="lg"
              >
                {isEditMode ? 'Update Credit Entry' : 'Save Credit Entry'}
              </Button>
              {!isEditMode && entryMode === 'detailed' && (
                <Button
                  variant="secondary"
                  onClick={handlePrintBill}
                  disabled={loading || !selectedCustomer}
                  className="w-full mt-3"
                  loading={loading}
                  progress={printBillProgress.status}
                  progressLabel="Saving"
                  progressExpectedMs={3000}
                  progressIcon={<Printer size={16} />}
                  size="lg"
                >
                  {!loading && <Printer size={18} className="mr-2" aria-hidden="true" />}
                  Print Bill
                </Button>
              )}
            </div>
          </Card>
        </>
      )}

      <Modal isOpen={!!duplicateBill} onClose={() => setDuplicateBill(null)} title="Possible duplicate bill" size="sm">
        {duplicateBill && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              A bill for {formatCurrency(Number(duplicateBill.total_amount))} ({duplicateBill.entry_code}) was
              saved for this customer {Math.max(1, Math.round((Date.now() - new Date(duplicateBill.created_at).getTime()) / 60000))} min
              ago. Is this a second bill?
            </p>
            <div className="flex space-x-2">
              <Button
                size="sm"
                onClick={() => {
                  const again = duplicateBill.withBill;
                  setDuplicateBill(null);
                  void submitEntry({ preventDefault: () => {} }, again, true);
                }}
              >
                Save anyway
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDuplicateBill(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {billPreview && (
        <BillPreviewDialog
          bill={billPreview.result.bill}
          saveError={billPreview.result.saveError}
          customerName={billPreview.customerName}
          phone={billPreview.phone}
          onClose={() => setBillPreview(null)}
        />
      )}
    </div>
  );
}