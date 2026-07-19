/**
 * Shared constants and small components used by every conversation renderer
 * (App.tsx main-pane chat AND chat-sidebar.tsx). Kept in one module so the
 * two rendering paths cannot drift.
 *
 * NOTE: heavy conversation rendering logic still lives in App.tsx and
 * chat-sidebar.tsx as `renderConversationItem` — extracting that into a
 * shared component is tracked as a follow-up (see Plan 05).
 */
import { useEffect, useState } from "react";
import { defaultRemarkPlugins } from "streamdown";
import remarkBreaks from "remark-breaks";
import { MessageResponse } from "@/components/ai-elements/message";
import { MarkdownPreOverride } from "@/components/ai-elements/markdown-code-override";
import { useSmoothedText } from "@/hooks/useSmoothedText";

/** Custom streamdown components used for every markdown message. */
export const streamdownComponents = { pre: MarkdownPreOverride };

/**
 * Remark plugins applied to user-authored messages. `remarkBreaks` turns
 * single newlines into `<br>` so typed line breaks survive the round-trip
 * from the input textarea.
 */
export const userMessageRemarkPlugins = [
  ...Object.values(defaultRemarkPlugins),
  remarkBreaks,
];

/**
 * Smooths the displayed text of a streaming message so rapid token updates
 * don't cause jarring character-by-character shifts. The render is driven by
 * `useSmoothedText` which animates a fraction of the gap per frame.
 */
export function SmoothStreamingMessage({
  text,
  components,
}: {
  text: string;
  components: typeof streamdownComponents;
}) {
  const smoothText = useSmoothedText(text);
  return (
    <MessageResponse components={components}>{smoothText}</MessageResponse>
  );
}

/* ─── Billing error helpers ─────────────────────────────────────────────── */

const BILLING_ERROR_PATTERNS = [
  {
    pattern: /upgrade required/i,
    title: "A subscription is required",
    subtitle: "Get started with a plan to access AI features in ScholarOS.",
    cta: "Subscribe",
  },
  {
    pattern: /not enough credits/i,
    title: "You've run out of credits",
    subtitle:
      "Upgrade your plan for more credits, or wait for your billing cycle to reset.",
    cta: "Upgrade plan",
  },
  {
    pattern: /subscription not active/i,
    title: "Your subscription is inactive",
    subtitle: "Reactivate your subscription to continue using AI features.",
    cta: "Reactivate",
  },
] as const;

export type BillingError = (typeof BILLING_ERROR_PATTERNS)[number];

export function matchBillingError(message: string): BillingError | null {
  return (
    BILLING_ERROR_PATTERNS.find(({ pattern }) => pattern.test(message)) ?? null
  );
}

/**
 * CTA button used in the billing-error message. Resolves the app's upgrade
 * URL on mount and opens it in a new tab.
 */
export function BillingErrorCTA({ label }: { label: string }) {
  const [appUrl, setAppUrl] = useState<string | null>(null);

  useEffect(() => {
    window.ipc
      .invoke("account:getAccount", null)
      .then((account) => setAppUrl(account.config?.appUrl ?? null))
      .catch(() => {});
  }, []);

  if (!appUrl) return null;

  return (
    <button
      onClick={() => window.open(`${appUrl}?intent=upgrade`)}
      className="mt-1 rounded-md bg-amber-500/20 dark:bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-100 dark:text-amber-200 transition-colors hover:bg-amber-500/30 dark:hover:bg-amber-400/25"
    >
      {label}
    </button>
  );
}
