import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { Modal } from '../components/ui/Modal';
import { Skeleton, SkeletonCard, SkeletonListItem } from '../components/ui/Skeleton';
import { ImageLightbox } from '../components/common/ImageLightbox';
import { usePendingPayments, useCustomer, invalidatePaymentQueries } from '../hooks/useApi';
import { useActionProgress } from '../hooks/useActionProgress';
import { useToastStore } from '../store/toastStore';
import { api } from '../lib/api';
import { formatCurrency, formatDate, formatDateTime, safeFileUrl } from '../lib/utils';
import { CreditEntry } from '../types';

/**
 * Approvals: payments staff recorded, waiting for an admin.
 *
 * A staff payment is saved pending with no allocation and counts nowhere.
 * Here the admin either approves it — choosing how it is split over the
 * customer's open bills (oldest first is pre-filled; whatever is left becomes
 * advance) — or rejects it with an optional reason, which keeps it on record
 * as rejected without ever touching a balance.
 */

interface PendingAttachment {
  id: string;
  file_url: string;
  file_type: 'image' | 'pdf' | string;
}

interface PendingPayment {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_code: string | null;
  customer_phone: string | null;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  receipt_number: string | null;
  notes: string | null;
  created_at: string;
  submitted_by_name: string | null;
  attachments: PendingAttachment[];
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  others: 'Others',
};

/** Two-decimal rounding for rupee amounts, so 0.1 + 0.2 sums compare cleanly. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function ApprovalsPage() {
  const pendingQuery = usePendingPayments();
  const payments = (pendingQuery.data?.payments ?? []) as PendingPayment[];
  const [approving, setApproving] = useState<PendingPayment | null>(null);
  const [rejecting, setRejecting] = useState<PendingPayment | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link to="/dashboard" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700">
          <ArrowLeft size={14} className="inline mr-1" /> Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mt-2">Approvals</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Payments recorded by staff. They count towards balances only after you approve them.
        </p>
      </div>

      {pendingQuery.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i}>
              <Skeleton className="h-5 w-1/3 mb-3" />
              <Skeleton className="h-4 w-1/2 mb-2" />
              <Skeleton className="h-4 w-1/4" />
            </SkeletonCard>
          ))}
        </div>
      ) : pendingQuery.error ? (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-500">{(pendingQuery.error as Error).message}</p>
            <Button className="mt-4" onClick={() => pendingQuery.refetch()}>Retry</Button>
          </div>
        </Card>
      ) : payments.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <ClipboardCheck size={36} className="mx-auto text-emerald-500 mb-3" />
            <p className="font-medium text-gray-900 dark:text-white">Nothing waiting for approval</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">New staff payments will show up here.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => {
            const images = p.attachments
              .filter((a) => a.file_type === 'image')
              .map((a) => safeFileUrl(a.file_url))
              .filter((u): u is string => !!u);
            return (
              <Card key={p.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {p.customer_name ?? 'Unknown customer'}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {[p.customer_code, p.customer_phone].filter(Boolean).join(' • ')}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 pt-1">
                      {formatDate(p.payment_date)}
                      {p.payment_method && <> • {METHOD_LABELS[p.payment_method] ?? p.payment_method}</>}
                      {p.receipt_number && <> • Receipt: {p.receipt_number}</>}
                    </div>
                    {p.notes && (
                      <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2 mt-2">
                        {p.notes}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                      Submitted by {p.submitted_by_name ?? 'staff'} on {formatDateTime(p.created_at)}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-2xl font-bold tnum text-gray-900 dark:text-white">{formatCurrency(p.amount)}</div>
                  </div>
                </div>

                {p.attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {p.attachments.map((a) => {
                      const url = safeFileUrl(a.file_url);
                      if (!url) {
                        return (
                          <span key={a.id} className="inline-flex items-center px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-500 dark:text-gray-400">
                            File unavailable
                          </span>
                        );
                      }
                      return a.file_type === 'image' ? (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setLightbox({ images, index: Math.max(0, images.indexOf(url)) })}
                          className="h-20 w-20 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-500 focus-ring"
                          title="View receipt"
                        >
                          <img src={url} alt="Receipt" className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <a
                          key={a.id}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 h-20 px-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-500 text-sm text-gray-700 dark:text-gray-300"
                        >
                          <span className="text-lg">📄</span> PDF
                        </a>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                  <Button className="flex-1" onClick={() => setApproving(p)}>
                    <CheckCircle2 size={16} className="mr-1 inline" /> Approve
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => setRejecting(p)}>
                    <XCircle size={16} className="mr-1 inline" /> Reject
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {approving && <ApproveModal payment={approving} onClose={() => setApproving(null)} />}
      {rejecting && <RejectModal payment={rejecting} onClose={() => setRejecting(null)} />}
      {lightbox && (
        <ImageLightbox images={lightbox.images} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

/** Oldest-first split of `amount` over the open bills, as editable strings. */
function oldestFirstSplit(bills: CreditEntry[], amount: number): Record<string, string> {
  let remaining = amount;
  const out: Record<string, string> = {};
  for (const bill of bills) {
    const take = round2(Math.max(0, Math.min(Number(bill.balance), remaining)));
    remaining = round2(remaining - take);
    out[bill.id] = take > 0 ? take.toFixed(2) : '';
  }
  return out;
}

function ApproveModal({ payment, onClose }: { payment: PendingPayment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const customerQuery = useCustomer(payment.customer_id);
  const save = useActionProgress();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // null until the admin edits: the oldest-first split is derived from the bills.
  const [edited, setSplit] = useState<Record<string, string> | null>(null);

  // Open bills, oldest first — the same order the server's automatic split uses.
  const bills = useMemo(() => {
    const entries = (customerQuery.data?.entries ?? []) as CreditEntry[];
    return entries
      .filter((e) => Number(e.balance) > 0.01)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [customerQuery.data]);

  const split = useMemo(
    () => edited ?? (customerQuery.data ? oldestFirstSplit(bills, payment.amount) : null),
    [edited, customerQuery.data, bills, payment.amount],
  );

  const values = split ?? {};
  const amountFor = (id: string) => {
    const n = Number(values[id] || 0);
    return Number.isFinite(n) ? n : NaN;
  };
  const allocated = round2(bills.reduce((sum, b) => sum + (amountFor(b.id) || 0), 0));
  const advanceLeft = round2(payment.amount - allocated);

  // Line-level problems, shown under each input; any of them blocks approval.
  const lineErrors: Record<string, string> = {};
  for (const b of bills) {
    const v = amountFor(b.id);
    if (Number.isNaN(v) || v < 0) lineErrors[b.id] = 'Enter a positive amount';
    else if (v > Number(b.balance) + 0.001) lineErrors[b.id] = `More than the balance (${formatCurrency(Number(b.balance))})`;
  }
  const overAllocated = allocated > payment.amount + 0.001;
  const canApprove = !!split && Object.keys(lineErrors).length === 0 && !overAllocated;

  const handleApprove = async () => {
    if (!canApprove || submitting) return;
    setSubmitting(true);
    setError('');
    save.start();
    try {
      const allocations = bills
        .map((b) => ({ credit_entry_id: b.id, allocated_amount: round2(amountFor(b.id) || 0) }))
        .filter((a) => a.allocated_amount > 0);
      const res = await api.approvePayment({
        payment_id: payment.id,
        // An explicit (possibly empty) list: empty means "all of it as advance".
        allocations,
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to approve the payment');
      }
      const data = await res.json();
      save.succeed();
      invalidatePaymentQueries(queryClient, payment.customer_id);
      const leftover = Number(data.advance_remaining ?? advanceLeft);
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Payment approved',
        description:
          `${formatCurrency(payment.amount)} from ${payment.customer_name ?? 'customer'}` +
          (leftover > 0.01 ? ` • ${formatCurrency(leftover)} kept as advance` : ''),
      });
      onClose();
    } catch (err) {
      save.fail();
      setError(err instanceof Error ? err.message : 'Failed to approve the payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={submitting ? () => {} : onClose} title="Approve Payment" size="lg">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 dark:text-white truncate">{payment.customer_name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {payment.customer_code} • {formatDate(payment.payment_date)}
            </div>
          </div>
          <div className="text-xl font-bold tnum text-gray-900 dark:text-white">{formatCurrency(payment.amount)}</div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {customerQuery.isLoading ? (
          <div className="space-y-2">
            <SkeletonListItem />
            <SkeletonListItem />
          </div>
        ) : customerQuery.error ? (
          <Alert variant="error">Could not load this customer's bills. {(customerQuery.error as Error).message}</Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Split over open bills {bills.length > 0 && <span className="font-normal text-gray-500">(oldest first)</span>}
              </h4>
              {bills.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setSplit(oldestFirstSplit(bills, payment.amount))} disabled={submitting}>
                    Oldest first
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setSplit({})} disabled={submitting}>
                    All as advance
                  </Button>
                </div>
              )}
            </div>

            {bills.length === 0 ? (
              <Alert variant="info">This customer has no open bills. The whole amount will be kept as advance.</Alert>
            ) : (
              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {bills.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-white">{b.entry_code}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(b.created_at)} • Balance {formatCurrency(Number(b.balance))}
                      </div>
                      {b.description && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{b.description}</div>
                      )}
                    </div>
                    <div className="w-32 shrink-0">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        max={Number(b.balance)}
                        value={values[b.id] ?? ''}
                        onChange={(e) => setSplit({ ...values, [b.id]: e.target.value })}
                        placeholder="0.00"
                        aria-label={`Amount for ${b.entry_code}`}
                        error={lineErrors[b.id]}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-1">
              <div className="flex justify-between">
                <span className="text-sm text-blue-900 dark:text-blue-200">Allocated to bills</span>
                <span className={`font-semibold tnum ${overAllocated ? 'text-red-600 dark:text-red-400' : 'text-blue-900 dark:text-blue-200'}`}>
                  {formatCurrency(allocated)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-emerald-800 dark:text-emerald-300">Advance left</span>
                <span className="font-semibold tnum text-emerald-800 dark:text-emerald-300">
                  {formatCurrency(Math.max(0, advanceLeft))}
                </span>
              </div>
              {overAllocated && (
                <p className="text-sm text-red-600 dark:text-red-400 pt-1">
                  The split is {formatCurrency(round2(allocated - payment.amount))} more than the payment.
                </p>
              )}
            </div>
          </>
        )}

        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g., Checked against bank statement"
          maxLength={1000}
          disabled={submitting}
        />

        <div className="flex gap-3 pt-2">
          <Button
            className="flex-1"
            size="lg"
            onClick={handleApprove}
            disabled={!canApprove || submitting || customerQuery.isLoading || !!customerQuery.error}
            loading={submitting}
            progress={save.status}
            progressLabel="Approving"
            progressIcon={<CheckCircle2 size={16} />}
          >
            Approve
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RejectModal({ payment, onClose }: { payment: PendingPayment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const save = useActionProgress();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');

  const handleReject = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    save.start();
    try {
      const res = await api.rejectPayment({ payment_id: payment.id, note: reason.trim() || undefined });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reject the payment');
      }
      save.succeed();
      invalidatePaymentQueries(queryClient, payment.customer_id);
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Payment rejected',
        description: `${formatCurrency(payment.amount)} from ${payment.customer_name ?? 'customer'}`,
      });
      onClose();
    } catch (err) {
      save.fail();
      setError(err instanceof Error ? err.message : 'Failed to reject the payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={submitting ? () => {} : onClose} title="Reject Payment" size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Reject <span className="font-semibold">{formatCurrency(payment.amount)}</span> from{' '}
          <span className="font-semibold">{payment.customer_name}</span>? It stays in the records as rejected and
          never counts towards any balance. This cannot be undone.
        </p>
        {error && <Alert variant="error">{error}</Alert>}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g., Amount does not match the receipt"
            disabled={submitting}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-3">
          <Button
            variant="danger"
            className="flex-1"
            onClick={handleReject}
            disabled={submitting}
            loading={submitting}
            progress={save.status}
            progressLabel="Rejecting"
            progressIcon={<XCircle size={16} />}
          >
            Reject Payment
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
