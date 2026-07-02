"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDownIcon, MessageSquareTextIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps, ReactNode, RefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const BOTTOM_THRESHOLD_PX = 8;
const MAX_ANCHOR_RETRIES = 6;

interface ConversationContextValue {
  contentRef: RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(
  null,
);

export type ConversationProps = ComponentProps<"div"> & {
  anchorMessageId?: string | null;
  anchorRequestKey?: number;
  children?: ReactNode;
};

export const Conversation = ({
  anchorMessageId = null,
  anchorRequestKey,
  children,
  className,
  ...props
}: ConversationProps) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);

  const updateBottomState = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    setIsAtBottom(atBottom);
    isAtBottomRef.current = atBottom;
  }, []);

  const applyAnchorLayout = useCallback(
    (scrollToAnchor: boolean): boolean => {
      const container = scrollRef.current;
      const content = contentRef.current;
      const spacer = spacerRef.current;

      if (!container || !content || !spacer) {
        return false;
      }

      if (!anchorMessageId) {
        spacer.style.height = "0px";
        updateBottomState();
        return true;
      }

      const anchor = content.querySelector<HTMLElement>(
        `[data-message-id="${anchorMessageId}"]`,
      );

      if (!anchor) {
        spacer.style.height = "0px";
        updateBottomState();
        return false;
      }

      spacer.style.height = "0px";

      const contentPaddingTop = Number.parseFloat(
        window.getComputedStyle(content).paddingTop || "0",
      );
      const anchorTop = anchor.offsetTop;
      const targetScrollTop = Math.max(0, anchorTop - contentPaddingTop);
      const requiredSlack = Math.max(
        0,
        targetScrollTop - (content.scrollHeight - container.clientHeight),
      );

      spacer.style.height = `${Math.ceil(requiredSlack)}px`;

      if (scrollToAnchor) {
        container.scrollTop = targetScrollTop;
      }

      updateBottomState();
      return true;
    },
    [anchorMessageId, updateBottomState],
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateBottomState();
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [updateBottomState]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    let rafId: number | null = null;

    const schedule = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        applyAnchorLayout(false);
        if (isAtBottomRef.current) {
          const c = scrollRef.current;
          if (c) {
            c.scrollTop = c.scrollHeight;
          }
        }
      });
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    observer.observe(content);
    schedule();

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [applyAnchorLayout]);

  useLayoutEffect(() => {
    if (anchorRequestKey === undefined) return;

    let attempts = 0;
    let rafId: number | null = null;

    const tryAnchor = () => {
      if (applyAnchorLayout(true)) {
        return;
      }
      if (attempts >= MAX_ANCHOR_RETRIES) {
        return;
      }
      attempts += 1;
      rafId = requestAnimationFrame(tryAnchor);
    };

    tryAnchor();

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [anchorRequestKey, applyAnchorLayout]);

  const scrollToBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    updateBottomState();
  }, [updateBottomState]);

  const contextValue = useMemo<ConversationContextValue>(
    () => ({
      contentRef,
      isAtBottom,
      scrollRef,
      scrollToBottom,
    }),
    [isAtBottom, scrollToBottom],
  );

  return (
    <ConversationContext.Provider value={contextValue}>
      <div
        className={cn("relative flex-1 overflow-hidden", className)}
        role="log"
        {...props}
      >
        <div
          className="h-full w-full overflow-y-auto [scrollbar-gutter:stable]"
          ref={scrollRef}
        >
          {children}
          <div ref={spacerRef} aria-hidden="true" />
        </div>
      </div>
    </ConversationContext.Provider>
  );
};

const useConversationContext = () => {
  const context = useContext(ConversationContext);

  if (!context) {
    throw new Error(
      "Conversation components must be used within a Conversation component.",
    );
  }

  return context;
};

export type ConversationContentProps = ComponentProps<"div">;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => {
  const { contentRef } = useConversationContext();

  return (
    <div
      className={cn("flex flex-col gap-5 p-4", className)}
      ref={contentRef}
      {...props}
    />
  );
};

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  description?: string;
  icon?: ReactNode;
  title?: string;
};

export const ConversationEmptyState = ({
  children,
  className,
  description = "Start a conversation to see messages here",
  icon,
  title = "No messages yet",
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-5 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-4"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border/50 bg-muted/50 text-muted-foreground/40">
          {icon ?? <MessageSquareTextIcon className="size-6" strokeWidth={1.5} />}
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-medium text-foreground/80">{title}</h3>
          {description && (
            <p className="max-w-xs text-sm text-muted-foreground/70">
              {description}
            </p>
          )}
        </div>
      </motion.div>
    )}
  </div>
);

export const ScrollPositionPreserver = () => null;

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useConversationContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    <AnimatePresence>
      {!isAtBottom && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute bottom-6 left-[50%] z-10"
        >
          <Button
            className={cn(
              "h-12 w-12 rounded-full border border-border/70 bg-background/95 text-foreground shadow-lg backdrop-blur-sm transition hover:bg-background active:scale-90",
              className,
            )}
            aria-label="Scroll to latest message"
            onClick={handleScrollToBottom}
            type="button"
            variant="ghost"
            {...props}
          >
            <ArrowDownIcon className="size-6" strokeWidth={1.75} />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
