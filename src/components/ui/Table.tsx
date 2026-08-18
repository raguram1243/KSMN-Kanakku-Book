import { HTMLAttributes, ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

/*
 * Shared Table primitives for consistent presentation across the app
 * (Customers, Reports, ledgers, etc.). They do NOT encapsulate data/querying
 * logic — only styling & interactions.
 */

export function Table({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-gray-200 bg-white ${className}`.trim()} {...props}>
      <table className="min-w-full text-sm text-gray-600">{children}</table>
    </div>
  );
}

export function TableHead({ children, className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-gray-50 ${className}`.trim()} {...props}>
      {children}
    </thead>
  );
}

export function TableHeadRow({ children, className = '', ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${className}`.trim()} {...props}>
      {children}
    </tr>
  );
}

export interface SortableHeaderProps extends HTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  currentSortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort: (key: string) => void;
  label: string;
}

export function SortableHeader({
  sortKey, currentSortKey, sortDirection, onSort, label, className = '', ...props
}: SortableHeaderProps) {
  const isActive = sortKey === currentSortKey;
  const Icon = sortDirection === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none transition-opacity ${className}`.trim()}
      onClick={() => onSort(sortKey)}
      {...props}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <Icon size={13} style={{ opacity: isActive ? 1 : 0.3 }} />
      </div>
    </th>
  );
}

export function TableBody({ children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-gray-100" {...props}>{children}</tbody>;
}

export function TableRow({ children, clickable = false, onClick, className = '', ...props }: HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean }) {
  return (
    <tr
      className={`transition-colors ${clickable ? 'cursor-pointer hover:bg-gray-50' : 'hover:bg-gray-50/60'} ${className}`.trim()}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className = '', right = false, ...props }: HTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return (
    <td className={`px-4 py-2.5 align-top ${right ? 'text-right font-variant-numeric tabular-nums' : ''} ${className}`.trim()} {...props}>
      {children}
    </td>
  );
}

export function TableHeaderCell({ children, className = '', right = false, ...props }: HTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return (
    <th className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${right ? 'text-right' : ''} ${className}`.trim()} {...props}>
      {children}
    </th>
  );
}

// Compact money cells: right-aligned, tabular numbers, muted when zero.
export function MoneyCell({ value, prefix = '₹', zeroClass = 'text-gray-400', ...props }: { value: number | string | null | undefined; prefix?: string; zeroClass?: string } & HTMLAttributes<HTMLTableCellElement>) {
  const num = Number(value);
  const formatted = isNaN(num) ? '—' : `${prefix}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const isZero = num === 0;
  return (
    <td
      className={`px-4 py-2.5 text-right font-variant-numeric tabular-nums ${isZero ? zeroClass : 'text-gray-900 font-medium'} ${props.className || ''}`.trim()}
      {...props}
    >
      {formatted}
    </td>
  );
}

interface StatusBadgeProps {
  status: 'paid' | 'partial' | 'pending' | 'overdue';
  label?: string;
  dot?: boolean;
}

const statusConfig = {
  paid: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  partial: { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' },
  pending: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  overdue: { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
};

export function StatusBadge({ status, label, dot = true }: StatusBadgeProps) {
  const cfg = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}></span>}
      {label ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title = 'No data', description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {icon && <div className="mb-3 text-gray-300">{icon}</div>}
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SkeletonRow({ columns = 4, ...props }: { columns?: number } & HTMLAttributes<HTMLDivElement>) {
  return (
    <tr {...props}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-2.5">
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 last:w-1/2"></div>
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <>
      <TableHead>
        <TableHeadRow>
          {Array.from({ length: columns }).map((_, i) => (
            <TableHeaderCell key={i}>{''}</TableHeaderCell>
          ))}
        </TableHeadRow>
      </TableHead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} columns={columns} />
        ))}
      </tbody>
    </>
  );
}
