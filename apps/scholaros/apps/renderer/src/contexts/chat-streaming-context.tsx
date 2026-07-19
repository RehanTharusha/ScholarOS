/**
 * Streaming context for chat assistant/reasoning tokens.
 *
 * Why this exists: previously, `currentAssistantMessage` and
 * `currentReasoningMessage` were useState in App.tsx, so every token
 * update re-rendered the ENTIRE App tree (header, sidebar, graph,
 * editor, everything). That made streaming feel laggy.
 *
 * Now: those values live in a context that only the streaming message
 * component subscribes to. The conversation list, file tree, header —
 * none of them depend on the streaming text, so they don't re-render
 * on tokens.
 *
 * The context is intentionally narrow: just the two streaming fields
 * and a tick counter for re-render triggering. The conversation list
 * itself is still owned by App.tsx because it changes less frequently
 * (once per message, not once per token).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export interface ChatStreamingValue {
  /** Read the current assistant message text. Stable across tokens. */
  getAssistantMessage: () => string;
  /** Read the current reasoning message text. Stable across tokens. */
  getReasoningMessage: () => string;
  /** Subscribe to token ticks. Re-renders on every token. */
  subscribe: (listener: () => void) => () => void;
  /** Imperative writers used by the run-event handler. */
  appendAssistant: (chunk: string) => void;
  setAssistant: (text: string) => void;
  appendReasoning: (chunk: string) => void;
  setReasoning: (text: string) => void;
  clear: () => void;
}

const ChatStreamingContext = createContext<ChatStreamingValue | null>(null);

export function ChatStreamingProvider({ children }: { children: ReactNode }) {
  const assistantRef = useRef("");
  const reasoningRef = useRef("");
  const listenersRef = useRef(new Set<() => void>());

  const emit = useCallback(() => {
    for (const l of listenersRef.current) l();
  }, []);

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<ChatStreamingValue>(
    () => ({
      getAssistantMessage: () => assistantRef.current,
      getReasoningMessage: () => reasoningRef.current,
      subscribe,
      appendAssistant: (chunk) => {
        if (!chunk) return;
        assistantRef.current += chunk;
        emit();
      },
      setAssistant: (text) => {
        if (assistantRef.current === text) return;
        assistantRef.current = text;
        emit();
      },
      appendReasoning: (chunk) => {
        if (!chunk) return;
        reasoningRef.current += chunk;
        emit();
      },
      setReasoning: (text) => {
        if (reasoningRef.current === text) return;
        reasoningRef.current = text;
        emit();
      },
      clear: () => {
        const hadAssistant = assistantRef.current !== "";
        const hadReasoning = reasoningRef.current !== "";
        assistantRef.current = "";
        reasoningRef.current = "";
        if (hadAssistant || hadReasoning) emit();
      },
    }),
    [subscribe, emit],
  );

  return (
    <ChatStreamingContext.Provider value={value}>
      {children}
    </ChatStreamingContext.Provider>
  );
}

export function useChatStreaming(): ChatStreamingValue {
  const ctx = useContext(ChatStreamingContext);
  if (!ctx) {
    throw new Error(
      "useChatStreaming must be used inside a <ChatStreamingProvider>",
    );
  }
  return ctx;
}

/**
 * Hook that returns the current assistant message text and re-renders
 * only when the text changes. Consumers are isolated from the rest of
 * the App tree — typing in the editor or moving the mouse does not
 * affect them, and vice versa.
 */
export function useAssistantStream(): string {
  const ctx = useChatStreaming();
  return useSyncExternalStore(
    ctx.subscribe,
    ctx.getAssistantMessage,
    ctx.getAssistantMessage,
  );
}

/** Same as useAssistantStream but for the reasoning message. */
export function useReasoningStream(): string {
  const ctx = useChatStreaming();
  return useSyncExternalStore(
    ctx.subscribe,
    ctx.getReasoningMessage,
    ctx.getReasoningMessage,
  );
}
