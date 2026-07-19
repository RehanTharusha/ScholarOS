/**
 * Status bar — a small persistent strip at the bottom of the main pane
 * that shows what the app is doing right now. Designed to be told
 * rather than polled: any component can push a status update via the
 * `useStatusBar` hook and it shows up in the bar within a render.
 *
 *   const { push, clear, group } = useStatusBar();
 *   push("saving", "Saving note.md...");
 *   ...
 *   clear("saving");
 *
 * The bar collapses multiple non-conflicting items into a single line
 * and drops ones that have expired. Each item is keyed by a string id
 * (e.g. "saving", "graph", "recording") so calling `push` with the
 * same id replaces the previous one.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { LoaderIcon, CheckIcon, AlertCircle, Mic, Network, Save } from "lucide-react";

export type StatusKind = "info" | "saving" | "error" | "success" | "progress";

export interface StatusItem {
  id: string;
  kind: StatusKind;
  text: string;
  /** Optional progress 0-1, shown as a tiny inline bar. */
  progress?: number;
  /** Expire after this many ms (undefined = sticky until cleared). */
  ttlMs?: number;
  /** Set true to mark this as a long-running indicator with a spinner. */
  busy?: boolean;
  /** ISO timestamp when the item was created. */
  ts: number;
}

interface StatusBarContextValue {
  /** Push a status item. Replaces any existing item with the same id. */
  push: (item: Omit<StatusItem, "ts">) => void;
  /** Clear the status item with this id. */
  clear: (id: string) => void;
  /** Group multiple ids so a single `clear(groupId)` clears them all. */
  group: (...ids: string[]) => string;
}

const StatusBarContext = createContext<StatusBarContextValue | null>(null);

export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StatusItem[]>([]);
  const timersRef = useRef(new Map<string, number>());

  const push = useCallback((item: Omit<StatusItem, "ts">) => {
    const next: StatusItem = { ...item, ts: Date.now() };
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === next.id);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      }
      return [...prev, next];
    });
    // Reset TTL timer if needed.
    if (item.ttlMs !== undefined) {
      const existing = timersRef.current.get(item.id);
      if (existing) window.clearTimeout(existing);
      const handle = window.setTimeout(() => {
        setItems((prev) => prev.filter((p) => p.id !== item.id));
        timersRef.current.delete(item.id);
      }, item.ttlMs);
      timersRef.current.set(item.id, handle);
    }
  }, []);

  const clear = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    const handle = timersRef.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const group = useCallback((...ids: string[]) => ids.join(","), []);

  // Cleanup all timers on unmount.
  useEffect(() => {
    return () => {
      for (const h of timersRef.current.values()) window.clearTimeout(h);
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, clear, group }), [push, clear, group]);

  return (
    <StatusBarContext.Provider value={value}>
      {children}
      <StatusBar items={items} />
    </StatusBarContext.Provider>
  );
}

export function useStatusBar(): StatusBarContextValue {
  const ctx = useContext(StatusBarContext);
  if (!ctx) {
    throw new Error("useStatusBar must be used inside <StatusBarProvider>");
  }
  return ctx;
}

function StatusBar({ items }: { items: StatusItem[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-1"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-background/95 px-3 py-1 text-xs shadow-sm backdrop-blur">
        {items.map((item) => (
          <StatusChip key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function StatusChip({ item }: { item: StatusItem }) {
  const icon = (() => {
    switch (item.kind) {
      case "saving":
      case "progress":
        return <LoaderIcon className="size-3 animate-spin text-muted-foreground" />;
      case "success":
        return <CheckIcon className="size-3 text-emerald-500" />;
      case "error":
        return <AlertCircle className="size-3 text-destructive" />;
      case "info":
      default:
        if (item.id === "recording") return <Mic className="size-3 text-red-500" />;
        if (item.id === "graph") return <Network className="size-3 text-muted-foreground" />;
        if (item.id === "saving") return <Save className="size-3 text-muted-foreground" />;
        return null;
    }
  })();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        item.kind === "error" && "text-destructive",
        item.kind === "success" && "text-emerald-600 dark:text-emerald-400",
      )}
    >
      {icon}
      <span>{item.text}</span>
      {typeof item.progress === "number" && (
        <span className="ml-1 inline-block h-1 w-12 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.max(0, Math.min(100, item.progress * 100))}%` }}
          />
        </span>
      )}
    </span>
  );
}
