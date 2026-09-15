import { Button } from '../ui/Button';
import { SkeletonTable } from '../ui/Skeleton';

/** Loading state shared by every report tab. Sits where the table will be, so the filters stay put. */
export function ReportLoading({ columns }: { columns: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <SkeletonTable rows={6} columns={columns} />
    </div>
  );
}

/** Error state shared by every report tab, with a retry that refetches without a page reload. */
export function ReportError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : 'Failed to load this report.';
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-6 text-center"
    >
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
