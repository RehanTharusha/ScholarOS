import { useState, useEffect, useCallback, useRef } from "react";

const getIpc = () =>
  typeof window !== "undefined" ? (window as any).ipc : undefined;

const COURSE_COLORS = [
  "#3B82F6",
  "#16A34A",
  "#8B5CF6",
  "#D97706",
  "#DC2626",
  "#0891B2",
  "#7C3AED",
  "#059669",
];

const COURSE_MARKERS = new Set(["concepts", "lectures", "index.md"]);

export type QuickAccessType = "course" | "manual" | "detected";

export interface QuickAccessItem {
  id: string;
  type: QuickAccessType;
  name: string;
  path: string;
  customName: string | null;
  color: string | null;
  createdAt: string;
  order: number;
}

const QUICK_ACCESS_PATH = ".scholar/quick-access.json";

/**
 * Scan the vault for directories containing concepts/, lectures/, index.md
 */
async function findCourseFoldersByMarkers(): Promise<
  { name: string; path: string }[]
> {
  const ipc = getIpc();
  if (!ipc) return [];
  try {
    const entries: { path: string; name: string; kind: string }[] =
      await ipc.invoke("workspace:readdir", {
        path: "",
        opts: { recursive: true, includeHidden: false },
      });
    const parentContents = new Map<string, Set<string>>();
    for (const entry of entries) {
      const parts = entry.path.split("/");
      if (parts.length <= 1) continue;
      const parentPath = parts.slice(0, -1).join("/");
      if (!parentContents.has(parentPath)) {
        parentContents.set(parentPath, new Set());
      }
      parentContents.get(parentPath)!.add(entry.name.toLowerCase());
    }
    const results: { name: string; path: string }[] = [];
    for (const [dirPath, children] of parentContents) {
      let hasAll = true;
      for (const marker of COURSE_MARKERS) {
        if (!children.has(marker)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) {
        const name = dirPath.split("/").pop() || dirPath;
        results.push({ name, path: dirPath });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function useQuickAccess() {
  const [items, setItems] = useState<QuickAccessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  const normalize = useCallback(
    (raw: QuickAccessItem[]): QuickAccessItem[] =>
      raw
        .filter((i) => i && i.id)
        .sort((a, b) => a.order - b.order),
    [],
  );

  const persist = useCallback(async (next: QuickAccessItem[]) => {
    const ipc = getIpc();
    if (!ipc) return;
    await ipc.invoke("workspace:mkdir", {
      path: ".scholar",
      recursive: true,
    });
    await ipc.invoke("workspace:writeFile", {
      path: QUICK_ACCESS_PATH,
      data: JSON.stringify({
        items: next,
        dismissed: Array.from(dismissedRef.current),
      }, null, 2),
    });
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const ipc = getIpc();
      if (!ipc) return;

      const existsResult = await ipc.invoke("workspace:exists", {
        path: QUICK_ACCESS_PATH,
      });

      let loaded: QuickAccessItem[] = [];

      if (existsResult.exists) {
        const result = await ipc.invoke("workspace:readFile", {
          path: QUICK_ACCESS_PATH,
          encoding: "utf8",
        });
        const data = JSON.parse(result.data);
        loaded = data.items || [];
        if (Array.isArray(data.dismissed)) {
          dismissedRef.current = new Set(data.dismissed);
        }
      }

      // Detect marker-verified course folders
      const markerFolders = await findCourseFoldersByMarkers();

      // Merge: add any missing detected courses (skip dismissed paths)
      for (const mf of markerFolders) {
        const lowerPath = mf.path.toLowerCase();
        if (dismissedRef.current.has(lowerPath)) continue;
        const existing = loaded.find(
          (i) => i.path.toLowerCase() === lowerPath,
        );
        if (!existing) {
          loaded.push({
            id: `detected-${mf.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
            type: "detected",
            name: mf.name,
            path: mf.path,
            customName: null,
            color:
              COURSE_COLORS[
                loaded.filter((i) => i.type !== "manual").length %
                  COURSE_COLORS.length
              ],
            createdAt: new Date().toISOString(),
            order: loaded.length,
          });
        }
      }

      // Prune dismissed paths that no longer correspond to any marker folder
      const markerPathSet = new Set(markerFolders.map((mf) => mf.path.toLowerCase()));
      dismissedRef.current = new Set(
        Array.from(dismissedRef.current).filter((p) => markerPathSet.has(p)),
      );

      loaded = normalize(loaded);
      setItems(loaded);
      await persist(loaded);
    } catch (err) {
      console.error("Failed to load quick access items:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [normalize, persist]);

  const addItem = useCallback(
    async (path: string, name?: string) => {
      // Re-adding: remove from dismissed so markers pick it up on next load
      dismissedRef.current.delete(path.toLowerCase());

      const existing = items.find(
        (i) => i.path.toLowerCase() === path.toLowerCase(),
      );
      if (existing) return;

      const displayName = name || path.split("/").pop() || path;
      const nextOrder =
        items.length > 0 ? Math.max(...items.map((i) => i.order)) + 1 : 0;

      const newItem: QuickAccessItem = {
        id: `manual-${crypto.randomUUID()}`,
        type: "manual",
        name: displayName,
        path,
        customName: null,
        color: null,
        createdAt: new Date().toISOString(),
        order: nextOrder,
      };

      const next = [...items, newItem];
      setItems(normalize(next));
      await persist(next);
    },
    [items, normalize, persist],
  );

  const removeItem = useCallback(
    async (id: string) => {
      const target = items.find((i) => i.id === id);
      if (target) {
        dismissedRef.current.add(target.path.toLowerCase());
      }
      const next = items.filter((i) => i.id !== id);
      setItems(normalize(next));
      await persist(next);
    },
    [items, normalize, persist],
  );

  const renameItem = useCallback(
    async (id: string, customName: string | null) => {
      const next = items.map((i) =>
        i.id === id ? { ...i, customName } : i,
      );
      setItems(normalize(next));
      await persist(next);
    },
    [items, normalize, persist],
  );

  const reorderItems = useCallback(
    async (reordered: QuickAccessItem[]) => {
      const next = reordered.map((item, idx) => ({
        ...item,
        order: idx,
      }));
      setItems(next);
      await persist(next);
    },
    [persist],
  );

  const ensureItem = useCallback(async (item: QuickAccessItem): Promise<boolean> => {
    const ipc = getIpc();
    if (!ipc) return false;
    try {
      const result = await ipc.invoke("workspace:exists", { path: item.path });
      if (result.exists) return true;
      const { toast } = await import("sonner");
      toast.error(`"${item.customName || item.name}" no longer exists`);
      await removeItem(item.id);
      return false;
    } catch {
      return false;
    }
  }, [removeItem]);

  const isInQuickAccess = useCallback(
    (path: string): boolean =>
      items.some((i) => i.path.toLowerCase() === path.toLowerCase()),
    [items],
  );

  // Load on mount
  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // Re-fetch when workspace changes (debounced to batch rapid changes)
  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;
    const cleanup = ipc.on("workspace:didChange", () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void loadItems();
      }, 300);
    });
    return () => {
      cleanup();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadItems]);

  // Re-fetch on vault switch
  useEffect(() => {
    const ipc = getIpc();
    if (!ipc) return;
    const cleanup = ipc.on("vault:changed", () => {
      setLoading(true);
      void loadItems();
    });
    return cleanup;
  }, [loadItems]);

  return {
    items,
    loading,
    addItem,
    removeItem,
    renameItem,
    reorderItems,
    isInQuickAccess,
    ensureItem,
    refresh: loadItems,
  };
}
