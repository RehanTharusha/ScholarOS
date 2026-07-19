import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Concise, direct title (per design doc). */
  title: string;
  /** One-sentence description of why the state exists and what to do. */
  description?: string;
  /** Single primary action button (avoid multiple competing CTAs). */
  action?: ReactNode;
  /** Optional icon shown above the title. */
  icon?: ReactNode;
  /** Centered vs. left-aligned. Defaults to centered. */
  align?: "center" | "start";
  /** Custom className passthrough for layout positioning. */
  className?: string;
  /** Optional small label (e.g. "Vault" section name) above the title. */
  eyebrow?: string;
}

/**
 * Standard empty state used across views. Renders nothing fancy — a
 * neutral container with title, description, and a single action. Replaces
 * the old "blank sidebar" / "no message" patterns.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  align = "center",
  className,
  eyebrow,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-6 text-muted-foreground",
        align === "center"
          ? "items-center text-center"
          : "items-start text-left",
        className,
      )}
    >
      {icon && (
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      {eyebrow && (
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
