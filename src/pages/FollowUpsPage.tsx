import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { PaginationControls } from '../components/ui/PaginationControls';
import { useFollowUps } from '../hooks/useFollowUps';
import { useWhatsAppCustomer } from '../hooks/useWhatsAppCustomer';
import { useToastStore } from '../store/toastStore';
import { deleteFollowUp, dueFollowUps, FollowUp, updateFollowUp } from '../lib/followUps';
import { FollowUpEditModal } from '../components/followups/FollowUpEditModal';
import { FollowUpRow } from '../components/followups/FollowUpRow';

type Filter = 'all' | 'due' | 'open' | 'done';
const PAGE_SIZE = 15;

/**
 * A1 — Collection worklist. Frontend-first on localStorage (lib/followUps);
 * after migration 019 + follow-ups edge functions are deployed this page
 * can switch to the server without UI changes.
 */
export function FollowUpsPage() {
  const { followUps, refresh } = useFollowUps();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const { openWhatsAppAggregate } = useWhatsAppCustomer();

  useEffect(() => { setPage(1); }, [filter, search]);

  const dueIds = new Set(dueFollowUps(followUps).map((f) => f.id));
  const rows = followUps.filter((f) => {
    if (filter === 'due' && !dueIds.has(f.id)) return false;
    if (filter === 'open' && f.status !== 'open') return false;
    if (filter === 'done' && !(f.status === 'done' || f.status === 'dismissed')) return false;
    const q = search.trim().toLowerCase();
    if (q && !(f.customer_name.toLowerCase().includes(q) || f.customer_code.toLowerCase().includes(q) || (f.note || '').toLowerCase().includes(q))) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const dueCount = dueIds.size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Follow-ups</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Who promised to pay, and when. {dueCount > 0 ? `${dueCount} due today or earlier.` : 'Nothing due right now.'}
          </p>
        </div>
        <Link to="/customers">
          <Button variant="secondary" size="sm">+ Add from customers</Button>
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          {(['all', 'due', 'open', 'done'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'} focus-ring`}
            >
              {f === 'all' ? 'All' : f === 'due' ? `Due (${dueCount})` : f === 'open' ? 'Open' : 'Done'}
            </button>
          ))}
          <div className="flex-1 min-w-[180px]">
            <Input placeholder="Search name, code, note..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {pageRows.length === 0 ? (
          <EmptyState
            title="No follow-ups"
            description="Create one from a customer page or the dashboard overdue list."
            action={<Link to="/dashboard"><Button size="sm" variant="secondary">Open dashboard</Button></Link>}
          />
        ) : (
          <div className="space-y-2">
            {pageRows.map((f) => (
              <FollowUpRow
                key={f.id}
                item={f}
                isDue={dueIds.has(f.id)}
                onChanged={refresh}
                onEdit={() => setEditing(f)}
                onRemind={() => {
                  if (!f.customer_phone) {
                    addToast({ type: 'warning', title: 'No phone number for this customer' });
                    return;
                  }
                  openWhatsAppAggregate({ name: f.customer_name, phone: f.customer_phone, balance: f.amount }, 'en');
                }}
                onDone={(id) => { updateFollowUp(id, { status: 'done' }); refresh(); addToast({ type: 'success', title: 'Marked collected' }); }}
                onRemove={(id) => { if (window.confirm(`Remove follow-up for ${f.customer_name}?`)) { deleteFollowUp(id); refresh(); } }}
              />
            ))}
          </div>
        )}

        <PaginationControls page={page} totalPages={totalPages} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
      </Card>

      {editing && (
        <FollowUpEditModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
    </div>
  );
}

