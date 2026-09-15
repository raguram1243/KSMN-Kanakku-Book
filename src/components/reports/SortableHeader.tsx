import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import type { SortDirection } from '../../hooks/useClientSort';

interface SortableHeaderProps {
  label: string;
  /** Row field this column sorts by. */
  column: string;
  activeColumn: string;
  direction: SortDirection;
  onSort: (column: string) => void;
  align?: 'left' | 'right';
}

/**
 * One sortable column header, shared by every report tab.
 *
 * The whole label is a real <button>, so it is reachable by keyboard and the
 * click target is the full header rather than a tiny icon, and the <th> carries
 * aria-sort so screen readers announce the current order.
 */
export function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = 'left',
}: SortableHeaderProps) {
  const active = column === activeColumn;
  const ariaSort = active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th scope="col" aria-sort={ariaSort} className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-gray-900 dark:text-white' : ''}`}
      >
        <span>{label}</span>
        {active ? (
          direction === 'asc' ? (
            <ChevronUp size={13} className="text-primary-600 dark:text-primary-400" />
          ) : (
            <ChevronDown size={13} className="text-primary-600 dark:text-primary-400" />
          )
        ) : (
          <ArrowUpDown size={13} className="text-gray-400" />
        )}
      </button>
    </th>
  );
}

/** A non-sortable header styled to match SortableHeader. */
export function PlainHeader({ label, align = 'left' }: { label: string; align?: 'left' | 'right' }) {
  return (
    <th scope="col" className={`px-3 py-2 uppercase tracking-wider ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {label}
    </th>
  );
}
