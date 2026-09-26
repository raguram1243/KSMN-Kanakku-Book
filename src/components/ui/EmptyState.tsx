import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Shared empty-state used across Dashboard / Follow-ups / Customers /
 * Reports / Day-book so "no data" looks the same everywhere (B3).
 */
export function EmptyState({
  title = 'Nothing here yet',
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-8 text-center ${className}`}>
      <div className="mb-3 text-gray-300 dark:text-gray-600">
        {icon ?? <Inbox size={36} strokeWidth={1.5} />}
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
