import { useMemo, useState } from 'react';

/**
 * Pages an in-memory list. The report endpoints return every matching row, so
 * paging happens here; totals and exports keep using the full list.
 *
 * `resetKey` should change whenever the filters or sort change, which sends the
 * user back to page 1 instead of leaving them on a page that no longer exists.
 */
export function useClientPagination<T>(rows: T[], pageSize: number, resetKey: string) {
  const [page, setPage] = useState(1);
  const [lastResetKey, setLastResetKey] = useState(resetKey);

  // Adjusting state while rendering (rather than in an effect) avoids painting
  // one frame of the stale page first. This is React's documented pattern.
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage, pageSize]
  );

  return { page: currentPage, setPage, totalPages, pageRows, pageSize, total: rows.length };
}
