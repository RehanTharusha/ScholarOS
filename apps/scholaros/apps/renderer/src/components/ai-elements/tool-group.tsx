"use client";

import { useState, useEffect, type ReactNode } from "react";
import type { ToolCall, ToolCallGroup as ToolCallGroupType } from "@/lib/chat-conversation";
import {
  normalizeToolInput,
  normalizeToolOutput,
} from "@/lib/chat-conversation";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";

/* ── Format helpers ────────────────────────────────────────────────── */

const formatToolValue = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value ?? null, null, 2);
    return json ?? "";
  } catch {
    return String(value);
  }
};

/* ── Icon components ───────────────────────────────────────────────── */

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M3 8.5L6.5 12L13 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle
      cx="8"
      cy="8"
      r="6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="4 2"
    >
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="0 8 8;360 8 8"
        dur="2s"
        repeatCount="indefinite"
      />
    </circle>
  </svg>
);

const WarningIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M8 5V9M8 11V11.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/* ── Status dot (running / completed / error) ──────────────────────── */

type ItemStatus = "running" | "completed" | "error" | "pending";

const StatusDot = ({ status }: { status: ItemStatus }) => (
  <span
    className={cn(
      "inline-block size-2 shrink-0 rounded-full",
      status === "completed" && "bg-green-600",
      status === "running" && "bg-amber-500 dark:bg-amber-400 animate-pulse",
      status === "error" && "bg-red-600",
      status === "pending" && "bg-muted-foreground/40",
    )}
  />
);

/* ── Group-level status helpers ────────────────────────────────────── */

const groupStatus = (items: ToolCall[]): "completed" | "running" | "error" => {
  if (items.some((t) => t.status === "error")) return "error";
  if (items.some((t) => t.status === "running" || t.status === "pending"))
    return "running";
  return "completed";
};

const completedCount = (items: ToolCall[]) =>
  items.filter((t) => t.status === "completed").length;

/* ── Sub-components ────────────────────────────────────────────────── */

interface ToolGroupHeaderProps {
  label: string;
  items: ToolCall[];
}

const ToolGroupHeader = ({ label, items }: ToolGroupHeaderProps) => {
  const total = items.length;
  const done = completedCount(items);
  const status = groupStatus(items);

  const iconClass =
    status === "completed"
      ? "bg-green-600/10 text-green-600"
      : status === "running"
        ? "bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400"
        : "bg-red-600/10 text-red-600";

  const icon =
    status === "completed" ? (
      <CheckIcon />
    ) : status === "running" ? (
      <SpinnerIcon />
    ) : (
      <WarningIcon />
    );

  const statusLabel = status === "completed" ? "Done" : status === "running" ? "Running" : "Error";

  const statusIcon =
    status === "completed" ? (
      <CheckIcon />
    ) : status === "running" ? (
      <span className="inline-block size-2 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
    ) : (
      <XCircleIcon className="size-3.5" />
    );

  const statusClass =
    status === "completed"
      ? "bg-green-600/10 text-green-600 border-green-600/20"
      : status === "running"
        ? "bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-400/20"
        : "bg-red-600/10 text-red-600 border-red-600/20";

  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = done === total;

  // Check if all items have the same display name
  const displayNames = items.map((t) => {
    if (t.name === "web-search") {
      const input = normalizeToolInput(t.input) as Record<string, unknown> | undefined;
      return (input?.query as string) || t.name;
    }
    const input = normalizeToolInput(t.input) as Record<string, unknown> | undefined;
    return (input?.path as string) || (input?.target as string) || t.name;
  });
  const allSame = displayNames.every((n) => n === displayNames[0]);

  // Title + subtitle
  let title: string;
  let subtitle: string;

  if (allSame) {
    // All same name: "Writing files" / "1 loadCapability completed"
    const name = label;
    title = allDone
      ? `${total} ${name.toLowerCase()} completed`
      : name;
    subtitle = allDone
      ? `${total} completed`
      : `${done} of ${total} completed`;
  } else {
    // Mixed names: "X operations completed" / "X operations"
    title = allDone
      ? `${total} operations completed`
      : `${total} operations`;
    // Show unique tool names as subtitle
    const uniqueNames = [...new Set(displayNames)];
    const namesStr = uniqueNames.slice(0, 3).join(", ");
    subtitle = allDone
      ? `${total} completed`
      : `${done} of ${total} completed — ${namesStr}${uniqueNames.length > 3 ? ` +${uniqueNames.length - 3}` : ""}`;
  }

  return (
    <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-3.5 py-2.5 hover:bg-muted/50 transition-colors">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          iconClass,
        )}
      >
        {icon}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-left text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="truncate text-left text-xs text-muted-foreground">
          {subtitle}
        </span>
      </div>

      <div className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-400 ease-out",
            status === "completed" && "bg-green-600",
            status === "running" && "bg-amber-500 dark:bg-amber-400",
            status === "error" && "bg-red-600",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
          statusClass,
        )}
      >
        {statusIcon}
        {statusLabel}
      </span>

      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

/* ── Detail panel (Parameters / Result tabs) ───────────────────────── */

interface ToolGroupDetailProps {
  input: unknown;
  output: unknown;
  errorText?: string;
}

const ToolGroupDetail = ({ input, output, errorText }: ToolGroupDetailProps) => {
  const [activeTab, setActiveTab] = useState<"parameters" | "result">("parameters");
  const hasOutput = output != null || !!errorText;

  let OutputNode: ReactNode = null;
  if (errorText) {
    OutputNode = (
      <pre className="whitespace-pre-wrap break-all font-mono text-xs text-destructive">
        {errorText}
      </pre>
    );
  } else if (output != null) {
    OutputNode = (
      <pre className="whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
        {formatToolValue(output) || "(empty)"}
      </pre>
    );
  }

  return (
    <div className="border-t border-border/50 bg-muted/30 px-3.5 pb-3 pt-2.5">
      <div className="mb-2 flex gap-0">
        <button
          type="button"
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium transition-colors",
            activeTab === "parameters"
              ? "border-b-2 border-foreground text-foreground"
              : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("parameters")}
        >
          Parameters
        </button>
        <button
          type="button"
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium transition-colors",
            activeTab === "result"
              ? "border-b-2 border-foreground text-foreground"
              : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("result")}
        >
          Result
        </button>
      </div>

      <div className="max-h-44 overflow-auto rounded-md border bg-card p-2.5">
        {activeTab === "parameters" && (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
            {formatToolValue(input ?? {}) || "(empty)"}
          </pre>
        )}
        {activeTab === "result" && (
          hasOutput ? (
            <div className={cn(errorText && "text-destructive")}>
              {OutputNode}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">(pending...)</span>
          )
        )}
      </div>
    </div>
  );
};

/* ── Individual tool-call row within a group ───────────────────────── */

interface ToolGroupItemRowProps {
  item: ToolCall;
  isOpen: boolean;
  onToggle: () => void;
  showToolName?: boolean;
}

const ToolGroupItemRow = ({ item, isOpen, onToggle, showToolName }: ToolGroupItemRowProps) => {
  const displayPath = (() => {
    if (item.name === "web-search") {
      const input = normalizeToolInput(item.input) as Record<string, unknown> | undefined;
      return (input?.query as string) || item.name;
    }
    const input = normalizeToolInput(item.input) as Record<string, unknown> | undefined;
    return (input?.path as string) || (input?.target as string) || item.name;
  })();

  const timeDisplay = (() => {
    if (item.status === "running" || item.status === "pending") return "...";
    return undefined;
  })();

  const rowStatus: ItemStatus =
    item.status === "completed"
      ? "completed"
      : item.status === "error"
        ? "error"
        : "running";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-muted/50",
          isOpen && "bg-muted/30",
        )}
      >
        <StatusDot status={rowStatus} />
        {showToolName && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {item.name}
          </span>
        )}
        <code className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {displayPath}
        </code>
        {timeDisplay && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {timeDisplay}
          </span>
        )}
      </button>

      <Collapsible open={isOpen}>
        <CollapsibleContent>
          <ToolGroupDetail
            input={normalizeToolInput(item.input)}
            output={normalizeToolOutput(item.result, item.status)}
            errorText={item.status === "error" ? "Tool error" : undefined}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

/* ── Group status summary line ─────────────────────────────────────── */

const GroupDetailSummary = ({ items }: { items: ToolCall[] }) => {
  const total = items.length;
  const done = completedCount(items);
  const status = groupStatus(items);

  if (status === "completed") return null;

  return (
    <div className="border-t border-border/50 px-3.5 py-2 text-xs text-muted-foreground">
      {status === "running"
        ? `${done} of ${total} complete`
        : `${done} of ${total} succeeded`}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   EXPORTED — ToolCallGroupView
   Renders a group of tool calls (consecutive, same display name)
   ══════════════════════════════════════════════════════════════════════ */

export interface ToolCallGroupViewProps {
  group: ToolCallGroupType;
  defaultOpen?: boolean;
}

export const ToolCallGroupView = ({
  group,
  defaultOpen,
}: ToolCallGroupViewProps) => {
  const [openDetailIds, setOpenDetailIds] = useState<Set<string>>(new Set());
  const status = groupStatus(group.items);
  const isCompleted = status === "completed";

  // Controlled open state: start open if still running, closed if already done
  const [groupOpen, setGroupOpen] = useState(
    defaultOpen ?? !isCompleted,
  );

  // Auto-collapse when the group transitions to completed
  useEffect(() => {
    if (isCompleted) setGroupOpen(false);
  }, [isCompleted]);

  const toggleDetail = (id: string) => {
    setOpenDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Check if items have mixed display names
  const displayNames = group.items.map((t) => {
    if (t.name === "web-search") {
      const input = normalizeToolInput(t.input) as Record<string, unknown> | undefined;
      return (input?.query as string) || t.name;
    }
    const input = normalizeToolInput(t.input) as Record<string, unknown> | undefined;
    return (input?.path as string) || (input?.target as string) || t.name;
  });
  const showToolName = !displayNames.every((n) => n === displayNames[0]);

  return (
    <Collapsible
      open={groupOpen}
      onOpenChange={setGroupOpen}
      className="group not-prose w-full rounded-lg border border-border"
    >
      <ToolGroupHeader label={group.label} items={group.items} />

      <CollapsibleContent>
        <div className="border-t border-border/50">
          {group.items.map((item, idx) => (
            <div key={item.id}>
              <ToolGroupItemRow
                item={item}
                isOpen={openDetailIds.has(item.id)}
                onToggle={() => toggleDetail(item.id)}
                showToolName={showToolName}
              />
              {/* Render reasoning item after this tool call if present */}
              {group.reasoningItems[idx] && (
                <div className="border-t border-border/50 px-3.5 py-2.5">
                  <Reasoning isStreaming={false} defaultOpen={false}>
                    <ReasoningTrigger />
                    <ReasoningContent>
                      {group.reasoningItems[idx]!.reasoning!}
                    </ReasoningContent>
                  </Reasoning>
                </div>
              )}
            </div>
          ))}
        </div>
        <GroupDetailSummary items={group.items} />
      </CollapsibleContent>
    </Collapsible>
  );
};
