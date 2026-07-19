/**
 * External store for chat streaming text. Designed so the conversation
 * list does NOT re-render on every token, only the streaming message
 * component itself.
 *
 * Pattern: a version counter (`tick`) lives in React state so consumers
 * can subscribe to it. The actual streaming text lives in a ref so
 * reads are cheap and free of intermediate renders. To consume:
 *
 *   const { textRef, tick } = useStreamingText("assistant");
 *   // ...
 *   useEffect(() => { ... }, [tick]); // re-reads textRef.current
 *
 * The hook `useStreamingText` is a thin wrapper that does this for you.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

interface StreamSlot {
  text: string;
  tick: number;
}

type SlotKey = "assistant" | "reasoning";

const slots: Record<SlotKey, StreamSlot> = {
  assistant: { text: "", tick: 0 },
  reasoning: { text: "", tick: 0 },
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/**
 * Append a chunk to the named streaming slot. Cheap (no React work) and
 * safe to call from IPC handlers, run-event callbacks, etc.
 */
export function appendStreamingChunk(slot: SlotKey, chunk: string): void {
  if (!chunk) return;
  slots[slot].text += chunk;
  slots[slot].tick += 1;
  emit();
}

/**
 * Set the streaming text absolutely (replaces, doesn't append). Use when
 * you want to overwrite rather than concatenate — e.g., when a subflow
 * restarts or when the renderer state is rebuilt from an IPC event.
 */
export function setStreamingText(slot: SlotKey, text: string): void {
  if (slots[slot].text === text) return;
  slots[slot].text = text;
  slots[slot].tick += 1;
  emit();
}

/** Reset a slot to empty. Call when a run finishes or a tab is closed. */
export function clearStreamingText(slot: SlotKey): void {
  if (slots[slot].text === "") return;
  slots[slot].text = "";
  slots[slot].tick += 1;
  emit();
}

/** Read the current text synchronously. */
export function getStreamingText(slot: SlotKey): string {
  return slots[slot].text;
}

/** Internal: subscribe to all slot changes (any slot triggers a re-render). */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Get a snapshot of the current tick for a slot. */
function getSnapshot(slot: SlotKey): number {
  return slots[slot].tick;
}

/**
 * React hook for reading streaming text. Subscribes to a single slot's
 * tick and re-reads the text from the ref on every change.
 *
 *   const text = useStreamingText("assistant");
 *
 * Only components that call this hook re-render on token updates. The
 * conversation list and every other component in the tree are
 * unaffected. This is the single biggest performance win for chat
 * streaming: a 500-message conversation no longer re-renders on every
 * token.
 */
export function useStreamingText(slot: SlotKey): string {
  const tick = useSyncExternalStore(subscribe, () => getSnapshot(slot), () => 0);
  // The returned value is only used to trigger React's reconciler;
  // callers must read slots[slot].text fresh, since the snapshot we
  // returned is a number not a string.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, setForce] = useState(0);
  useEffect(() => {
    setForce((n) => n + 1);
  }, [tick]);
  return slots[slot].text;
}

/**
 * Return only the tick number (for components that want to depend on
 * changes without re-rendering the text). Useful when the consumer
 * already has the text in its own ref.
 */
export function useStreamingTick(slot: SlotKey): number {
  return useSyncExternalStore(subscribe, () => getSnapshot(slot), () => 0);
}
