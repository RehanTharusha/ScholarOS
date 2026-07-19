/**
 * Undo manager for destructive app-level operations.
 *
 * Wraps operations like file rename/delete/move and chat-message
 * send in a toast-confirmed undo flow. Each operation registers an
 * undo handler; the toast surfaces it for 5 seconds, during which
 * the user can press Ctrl/Cmd+Z (or click "Undo" in the toast) to
 * reverse the operation.
 *
 * Per-operation history (not a single global stack): each operation
 * is independent. The latest operation's toast replaces any prior
 * toast.
 *
 * Usage:
 *   const { record, undoLatest } = useUndo();
 *   record({
 *     id: "rename-note-x",
 *     label: "Renamed 'foo.md' to 'bar.md'",
 *     undo: async () => { /* restore */ },
 *   });
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";

export interface UndoableOperation {
  /** Stable id; the latest operation with the same id replaces. */
  id: string;
  /** Short human-readable description shown in the toast. */
  label: string;
  /** Reverses the operation. */
  undo: () => void | Promise<void>;
  /** Optional redo (rarely used; we keep simple for now). */
  redo?: () => void | Promise<void>;
  /** Override the default 5s TTL. */
  ttlMs?: number;
  /** Optional kind for analytics. */
  kind?: "file" | "chat" | "graph" | "other";
}

const DEFAULT_TTL_MS = 5000;

interface RecordedOperation extends UndoableOperation {
  ts: number;
  /** Toast id from sonner so we can dismiss it. */
  toastId: string | number;
}

/**
 * Standalone function (no React) for places that need to record
 * an undoable op without a component. The toast is shown globally.
 */
export function recordUndoable(op: UndoableOperation): void {
  const toastId = toast(op.label, {
    description: "Press Ctrl+Z or click Undo to reverse.",
    duration: op.ttlMs ?? DEFAULT_TTL_MS,
    action: {
      label: (
        <span className="inline-flex items-center gap-1">
          <Undo2 className="size-3" />
          Undo
        </span>
      ),
      onClick: () => {
        void op.undo();
      },
    },
  });
}

/**
 * Hook: returns `record` and `undoLatest` for use in components.
 * `undoLatest` is useful for the global Ctrl/Cmd+Z hotkey.
 */
export function useUndo() {
  const latestRef = useRef<RecordedOperation | null>(null);
  // Bumping this state forces consumers (e.g. the global hotkey) to
  // re-read `latestRef.current` on every record.
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  const record = useCallback(
    (op: UndoableOperation) => {
      // Dismiss the prior toast so we don't have two stacked.
      if (latestRef.current) {
        toast.dismiss(latestRef.current.toastId);
      }
      const id = op.id;
      const toastId = toast(op.label, {
        description: "Press Ctrl+Z or click Undo to reverse.",
        duration: op.ttlMs ?? DEFAULT_TTL_MS,
        action: {
          label: (
            <span className="inline-flex items-center gap-1">
              <Undo2 className="size-3" />
              Undo
            </span>
          ),
          onClick: () => {
            void op.undo();
          },
        },
      });
      latestRef.current = {
        ...op,
        ts: Date.now(),
        toastId,
      };
      bump();
      // Garbage-collect after TTL so the ref doesn't grow.
      const ttl = op.ttlMs ?? DEFAULT_TTL_MS;
      setTimeout(() => {
        if (latestRef.current?.id === id) {
          latestRef.current = null;
          bump();
        }
      }, ttl);
    },
    [bump],
  );

  const undoLatest = useCallback(async () => {
    const op = latestRef.current;
    if (!op) return false;
    latestRef.current = null;
    toast.dismiss(op.toastId);
    await op.undo();
    bump();
    return true;
  }, [bump]);

  // Bind Ctrl/Cmd+Z to undoLatest. Only one instance should mount
  // this hook; multiple would race. (Mount it in App.tsx.)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        // Don't intercept editor-level undo: if the user is focused
        // inside a contenteditable (TipTap) or input, let the
        // browser's native undo win.
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.isContentEditable ||
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA")
        ) {
          return;
        }
        e.preventDefault();
        void undoLatest();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoLatest]);

  return { record, undoLatest };
}
