import { useState } from "react";
import { FileText, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IngestFileActivity } from "@/hooks/use-ingest-activity";

const STATUS_ICONS: Record<string, typeof Loader2> = {
  queued: Loader2,
  parsing: Loader2,
  classifying: Loader2,
  writing: Loader2,
  done: CheckCircle2,
  error: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  queued: "text-muted-foreground",
  parsing: "text-blue-500",
  classifying: "text-violet-500",
  writing: "text-amber-500",
  done: "text-emerald-500",
  error: "text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  parsing: "Parsing",
  classifying: "Classifying",
  writing: "Writing pages",
  done: "Done",
  error: "Failed",
};

interface IngestActivityRowProps {
  activity: IngestFileActivity;
  onOpenPage?: (path: string) => void;
}

export function IngestActivityRow({ activity, onOpenPage }: IngestActivityRowProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STATUS_ICONS[activity.status] || Loader2;
  const isSpinning = activity.status === "queued" || activity.status === "parsing" || activity.status === "classifying" || activity.status === "writing";
  const hasPages = activity.pagesCreated.length > 0;
  const hasError = activity.status === "error" && activity.error;

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon
          className={cn(
            "size-4 shrink-0",
            STATUS_COLORS[activity.status],
            isSpinning && "animate-spin",
          )}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {activity.fileName}
          </p>
          {activity.parserUsed && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activity.parserUsed}
            </p>
          )}
        </div>

        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            activity.status === "done"
              ? "bg-emerald-500/10 text-emerald-600"
              : activity.status === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
          )}
        >
          {STATUS_LABELS[activity.status]}
        </span>

        {hasPages && (
          <button
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        )}
      </div>

      {/* Expanded page list */}
      {expanded && hasPages && (
        <div className="mt-3 space-y-1 border-t border-border/50 pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Created pages
          </p>
          {activity.pagesCreated.map((pagePath) => (
            <button
              key={pagePath}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
              onClick={() => onOpenPage?.(pagePath)}
            >
              <FileText className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {pagePath.split("/").pop()}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Error detail */}
      {hasError && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2">
          <AlertCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">{activity.error}</p>
        </div>
      )}
    </div>
  );
}
