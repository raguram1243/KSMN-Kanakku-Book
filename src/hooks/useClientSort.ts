import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export function useClientSort<T>(
  rows: T[],
  initialKey: string,
  initialDirection: SortDirection = 'asc',
) {
  const [sortKey, setSortKey] = useState<string>(initialKey);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);

  const sorted = useMemo(() => {
    const dir = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const aVal = (a as any)?.[sortKey];
      const bVal = (b as any)?.[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * dir;
      }
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return (aNum - bNum) * dir;
    });
  }, [rows, sortKey, direction]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('asc');
    }
  };

  return { sorted, sortKey, direction, toggleSort };
}