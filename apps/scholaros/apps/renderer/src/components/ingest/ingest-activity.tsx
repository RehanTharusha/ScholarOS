import { Loader2, AlertCircle } from "lucide-react";
import {
  AcademicCard,
  AcademicSectionTitle,
  AcademicEmptyState,
} from "@/components/academic/academic-shell";
import { Button } from "@/components/ui/button";
import { IngestStepper } from "./ingest-stepper";
import { IngestActivityRow } from "./ingest-activity-row";
import type { IngestFileActivity } from "@/hooks/use-ingest-activity";

interface IngestActivityProps {
  activities: IngestFileActivity[];
  phase: "idle" | "ingesting" | "paused" | "done";
  error?: string;
  onOpenPage?: (path: string) => void;
  onRetry?: () => void;
  onIngestMore?: () => void;
}

export function IngestActivity({
  activities,
  phase,
  error,
  onOpenPage,
  onRetry,
  onIngestMore,
}: IngestActivityProps) {
  const parsing = activities.filter((a) => a.status === "parsing").length;
  const writing = activities.filter((a) => a.status === "writing").length;
  const done = activities.filter((a) => a.status === "done").length;
  const failed = activities.filter((a) => a.status === "error").length;
  const total = activities.length;
  const hasActivities = total > 0;

  return (
    <div className="space-y-3">
      {/* Aggregate counts */}
      {hasActivities && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IngestStepper phase={phase} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {parsing > 0 && <span>{parsing} parsing</span>}
            {writing > 0 && <span>{writing} writing</span>}
            <span className="text-emerald-600">{done} done</span>
            {failed > 0 && <span className="text-destructive">{failed} failed</span>}
            <span className="text-muted-foreground/50">· {total} total</span>
          </div>
        </div>
      )}

      {hasActivities ? (
        <AcademicCard>
          <AcademicSectionTitle
            eyebrow="Activity"
            title="File processing"
            count={activities.length}
          />
          <div className="mt-4 space-y-2">
            {activities.map((act) => (
              <IngestActivityRow
                key={act.id}
                activity={act}
                onOpenPage={onOpenPage}
              />
            ))}
          </div>
        </AcademicCard>
      ) : phase === "ingesting" || phase === "paused" ? (
        <AcademicCard>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Processing files...
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The AI is extracting and analyzing content
              </p>
            </div>
          </div>
        </AcademicCard>
      ) : phase === "done" && total === 0 ? (
        <AcademicCard>
          <AcademicEmptyState
            title="Ingest complete"
            description="No files were processed in this run."
          />
        </AcademicCard>
      ) : null}

      {/* Error callout */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">
              Processing error
            </p>
            <p className="mt-1 text-sm text-destructive/80">{error}</p>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="shrink-0"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Done state */}
      {phase === "done" && hasActivities && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onIngestMore}>
            Ingest more files
          </Button>
        </div>
      )}
    </div>
  );
}
