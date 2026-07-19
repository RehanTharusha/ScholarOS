/**
 * Per-file editor content store.
 *
 * Replaces the `editorContent` (state) + `editorContentRef` (ref) +
 * `editorContentByPath` (state) + `editorContentByPathRef` (Map) quadruple
 * that used to live in App.tsx. The same data was tracked in four
 * places; now there is a single Map ref keyed by file path, with a
 * version counter that triggers a render on changes.
 *
 * The active file's content is read from `getActive()` and updates go
 * to `set()`. A render is triggered by either the active path
 * changing or the version counter advancing.
 */
import { useCallback, useMemo, useRef, useState } from "react";

interface Store {
  /** Underlying map of path -> markdown body. */
  readonly map: Map<string, string>;
  /** Monotonic counter incremented on every set(). */
  readonly version: { current: number };
  /** Read the content for a path, falling back to "". */
  get(path: string): string;
  /** Set the content for a path. Triggers a re-render. */
  set(path: string, content: string): void;
  /** Remove a path's content. Triggers a re-render. */
  delete(path: string): void;
  /** Clear all stored content. Triggers a re-render. */
  clear(): void;
}

function createStore(): Store {
  const map = new Map<string, string>();
  const version = { current: 0 };
  return {
    map,
    version,
    get(path) {
      return map.get(path) ?? "";
    },
    set(path, content) {
      const prev = map.get(path);
      if (prev === content) return;
      map.set(path, content);
      version.current += 1;
    },
    delete(path) {
      if (!map.has(path)) return;
      map.delete(path);
      version.current += 1;
    },
    clear() {
      if (map.size === 0) return;
      map.clear();
      version.current += 1;
    },
  };
}

/**
 * Returns a content store plus a counter that triggers a re-render
 * whenever the underlying map is mutated. Components that need to read
 * the active content can subscribe to the active path; the hook
 * re-renders them whenever that path's content changes.
 */
export function useEditorContentStore() {
  const storeRef = useRef<Store | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createStore();
  }
  // Bump a React state counter so consumers re-render on store changes.
  const [, setRenderTick] = useState(0);
  const bump = useCallback(() => setRenderTick((n) => n + 1), []);

  // Wrap each mutator to also bump the render tick.
  const api = useMemo<Store>(
    () => ({
      map: storeRef.current!.map,
      version: storeRef.current!.version,
      get: storeRef.current!.get.bind(storeRef.current!),
      set: (path, content) => {
        storeRef.current!.set(path, content);
        bump();
      },
      delete: (path) => {
        storeRef.current!.delete(path);
        bump();
      },
      clear: () => {
        storeRef.current!.clear();
        bump();
      },
    }),
    [bump],
  );

  return api;
}
