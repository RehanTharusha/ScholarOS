import { useCallback, useMemo, useRef, useState } from "react";
import { LRUMap } from "@/lib/lru-map";

/**
 * React-friendly wrapper around {@link LRUMap} that triggers a re-render
 * when entries are added, removed, or evicted.
 *
 * Returns:
 *   - `cache` – the underlying LRUMap (stable identity)
 *   - `set(key, value)` – write that triggers a render
 *   - `remove(key)` – delete that triggers a render
 *   - `clear()` – clear that triggers a render
 *   - `tick` – monotonic counter; can be used as a dependency to force memoized
 *     children to recompute without storing the value in props
 */
export function useLRUMap<K, V>(maxSize: number) {
  const cache = useRef(new LRUMap<K, V>(maxSize)).current;
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  const set = useCallback(
    (key: K, value: V) => {
      cache.set(key, value);
      bump();
    },
    [cache, bump],
  );

  const remove = useCallback(
    (key: K) => {
      if (cache.delete(key)) bump();
    },
    [cache, bump],
  );

  const clear = useCallback(() => {
    cache.clear();
    bump();
  }, [cache, bump]);

  return useMemo(
    () => ({ cache, set, remove, clear, tick }),
    [cache, set, remove, clear, tick],
  );
}
