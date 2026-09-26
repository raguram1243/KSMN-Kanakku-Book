import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { updateFollowUp } from '../../lib/followUps';
import type { FollowUp } from '../../lib/followUps';
import { formatCurrency } from '../../lib/utils';

export function FollowUpRow({ item, isDue, onChanged, onEdit, onRemind, onDone, onRemove }: {
  item: FollowUp;
  isDue: boolean;
  onChanged: () => void;
  onEdit: () => void;
  onRemind: () => void;
  onDone: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 p-3 rounded-lg border ${isDue ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex-1 min-w-[180px]">
        <Link to={`/customers/${item.customer_id}`} className="font-medium text-gray-900 dark:text-white hover:underline">
          {item.customer_name}
        </Link>
        <div className="text-xs text-gray-500 dark:text-gray-400">{item.customer_code}{item.promised_date ? ` • promised ${item.promised_date}` : ''}</div>
        {item.note && <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{item.note}</div>}
      </div>
      <div className="text-right">
        <div className="font-semibold text-gray-900 dark:text-white">{formatCurrency(item.amount)}</div>
        <div className="mt-1 flex gap-1 justify-end">
          {item.status === 'open' ? (isDue ? <Badge variant="danger">Due</Badge> : <Badge variant="warning">Open</Badge>) : <Badge variant="success">Done</Badge>}
        </div>
      </div>
      <div className="flex gap-1.5">
        {item.status === 'open' && (
          <>
            <Button size="sm" variant="secondary" onClick={onRemind}>Remind</Button>
            <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>
            <Button size="sm" onClick={() => onDone(item.id)}>Done</Button>
          </>
        )}
        {item.status !== 'open' && (
          <Button size="sm" variant="secondary" onClick={() => { updateFollowUp(item.id, { status: 'open' }); onChanged(); }}>Reopen</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onRemove(item.id)}>✕</Button>
      </div>
    </div>
  );
}
