import { Button } from './Button';
import { Skeleton } from './Skeleton';

interface PaginationControlsProps {
  /** 1-based current page. */
  page: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /** Number of records per page. */
  pageSize: number;
  /** Total number of records across all pages. */
  total: number;
  /** Called with the new 1-based page when the user navigates. */
  onPageChange: (page: number) => void;
  /** Whether a page transition is in flight (shows a subtle row skeleton). */
  isLoading?: boolean;
  /** Force a specific "Showing A–B of N" range (defaults to the computed one). Handy for skeleton mode. */
  startCountOverride?: number;
  endCountOverride?: number;
}

/**
 * Reusable pagination UI used by Customers, Reports (Summary/Entries/Payments),
 * and the Customer Detail ledger view.
 *
 * - Server-side paging: the parent fetches only the current page; this component
 *   only emits page-change events — it never slices an in-memory array.
 * - Responsive: full footer on desktop, compact `[←] Page 2 of 7 [→]` on mobile.
 * - Lightweight loading: when `isLoading`, the row list above may show a skeleton;
 *   this footer still renders the *previous* "Showing …" range so the layout
 *   doesn't jump while the new page arrives.
 */
export function PaginationControls({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  isLoading,
  startCountOverride,
  endCountOverride,
}: PaginationControlsProps) {
  const hasData = total > 0;
  const startCount = startCountOverride ?? (hasData ? (page - 1) * pageSize + 1 : 0);
  const endCount = endCountOverride ?? (hasData ? Math.min(page * pageSize, total) : 0);

  const goPrev = () => onPageChange(Math.max(1, page - 1));
  const goNext = () => onPageChange(Math.min(totalPages, page + 1));

  if (!hasData) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Showing {startCount}–{endCount} of {total.toLocaleString()} records
      </p>

      <div className="flex items-center justify-between sm:justify-end gap-2">
        <span
          className="hidden sm:inline text-sm text-gray-600 dark:text-gray-300"
          aria-label={`Page ${page} of ${totalPages}`}
        >
          Page {page} of {totalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={goPrev}
          disabled={page <= 1 || !!isLoading}
          aria-label="Previous page"
        >
          ← Previous
        </Button>
        <span
          className="sm:hidden text-sm text-gray-600 dark:text-gray-300"
          aria-label={`Page ${page} of ${totalPages}`}
        >
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={goNext}
          disabled={page >= totalPages || !!isLoading}
          aria-label="Next page"
        >
          Next →
        </Button>
      </div>
    </div>
  );
}

/** Compact skeleton used in the loading state of a paged table/list. */
export function PaginationSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full rounded" />
      ))}
    </div>
  );
}
