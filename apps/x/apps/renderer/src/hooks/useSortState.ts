import { useState, useCallback } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

interface UseSortStateOptions {
  defaultField?: string;
  defaultDirection?: SortDirection;
  onSortChange?: (config: SortConfig) => void;
}

interface UseSortStateReturn {
  sortConfig: SortConfig;
  setSortConfig: (config: SortConfig) => void;
  toggleDirection: (field?: string) => void;
  getComparator: <T>(getValue: (item: T) => any) => (a: T, b: T) => number;
}

export function useSortState(
  options: UseSortStateOptions = {}
): UseSortStateReturn {
  const {
    defaultField = 'name',
    defaultDirection = 'asc',
    onSortChange,
  } = options;

  const [sortConfig, setSortConfigInternal] = useState<SortConfig>({
    field: defaultField,
    direction: defaultDirection,
  });

  const setSortConfig = useCallback(
    (config: SortConfig) => {
      setSortConfigInternal(config);
      onSortChange?.(config);
    },
    [onSortChange]
  );

  const toggleDirection = useCallback(
    (field?: string) => {
      setSortConfigInternal((prev) => {
        let newDirection: SortDirection;
        let newField = prev.field;

        if (field && field !== prev.field) {
          // Switching to a new field - use a sensible default direction
          newField = field;
          newDirection = field === 'name' ? 'asc' : 'desc';
        } else {
          // Toggle direction on current field
          newDirection = prev.direction === 'asc' ? 'desc' : 'asc';
        }

        const newConfig = { field: newField, direction: newDirection };
        onSortChange?.(newConfig);
        return newConfig;
      });
    },
    [onSortChange]
  );

  const getComparator = useCallback(
    <T,>(getValue: (item: T) => any) =>
      (a: T, b: T): number => {
        const va = getValue(a);
        const vb = getValue(b);

        let cmp: number;

        if (va == null && vb == null) {
          cmp = 0;
        } else if (va == null) {
          cmp = -1;
        } else if (vb == null) {
          cmp = 1;
        } else if (typeof va === 'number' && typeof vb === 'number') {
          cmp = va - vb;
        } else if (typeof va === 'string' && typeof vb === 'string') {
          cmp = va.localeCompare(vb);
        } else {
          cmp = String(va).localeCompare(String(vb));
        }

        return sortConfig.direction === 'asc' ? cmp : -cmp;
      },
    [sortConfig.direction]
  );

  return {
    sortConfig,
    setSortConfig,
    toggleDirection,
    getComparator,
  };
}
