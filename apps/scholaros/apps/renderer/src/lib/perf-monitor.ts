import { useEffect, useRef } from "react";

/**
 * Dev-only render counter. Drops a debug message into the console on every
 * render so you can see which components are firing on every keystroke or
 * token. Gated on `import.meta.env.DEV` so production builds have zero cost.
 *
 * Usage:
 *   useRenderCount("App");
 */
export function useRenderCount(name: string): void {
  const count = useRef(0);
  count.current += 1;

  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[perf] ${name} rendered ${count.current} times`);
    }
  });
}

/**
 * Dev-only mount counter. Logs once per mount/unmount pair.
 */
export function useMountCount(name: string): void {
  const ref = useRef({ mounts: 0 });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    ref.current.mounts += 1;
    // eslint-disable-next-line no-console
    console.debug(`[perf] ${name} mounted (count=${ref.current.mounts})`);
    return () => {
      // eslint-disable-next-line no-console
      console.debug(`[perf] ${name} unmounted`);
    };
  }, [name]);
}

/**
 * Track how long a value is stable. Useful for measuring debounce
 * effectiveness, idle periods, etc.
 */
export function useStableDuration(value: unknown, name: string): void {
  const since = useRef<number>(Date.now());
  const prev = useRef<unknown>(value);

  if (prev.current !== value) {
    if (import.meta.env.DEV) {
      const duration = Date.now() - since.current;
      // eslint-disable-next-line no-console
      console.debug(
        `[perf] ${name} stable for ${duration}ms before change`,
      );
    }
    since.current = Date.now();
    prev.current = value;
  }
}
