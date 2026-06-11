import { useState, useCallback, useMemo } from 'react';

interface UseMultiSelectReturn {
  /** Set of currently selected IDs */
  selectedIds: Set<string>;
  /** Check if a specific ID is selected */
  isSelected: (id: string) => boolean;
  /** Toggle selection for a single ID */
  toggle: (id: string) => void;
  /** Select a single ID */
  select: (id: string) => void;
  /** Deselect a single ID */
  deselect: (id: string) => void;
  /** Select all provided IDs */
  selectAll: (ids: string[]) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Number of currently selected items */
  selectedCount: number;
  /** Whether any items are selected */
  hasSelection: boolean;
}

export function useMultiSelect(): UseMultiSelectReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const select = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const deselect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);
  const hasSelection = selectedCount > 0;

  return {
    selectedIds,
    isSelected,
    toggle,
    select,
    deselect,
    selectAll,
    clearSelection,
    selectedCount,
    hasSelection,
  };
}
