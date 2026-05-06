import { ArrowRightLeft } from "lucide-react";
import type { Assignment } from "@x/shared/dist/academic.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type KanbanStatus = "not-started" | "in-progress" | "done";

function mapAssignmentStatus(status: Assignment["status"]): KanbanStatus {
  if (status === "not-started") return "not-started";
  if (status === "in-progress") return "in-progress";
  return "done";
}

export function TaskCard({
  assignment,
  onMove,
}: {
  assignment: Assignment;
  onMove: (assignmentId: string, direction: -1 | 1) => void;
}) {
  const status = mapAssignmentStatus(assignment.status);

  return (
    <article className="rounded-2xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {assignment.title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {assignment.courseId}
          </p>
        </div>
        <Badge
          variant="outline"
          className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.18em]"
        >
          {assignment.priority ?? "medium"}
        </Badge>
      </div>

      {assignment.description ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {assignment.description}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Due {new Date(assignment.dueDate).toLocaleDateString()}</span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onMove(assignment.id, -1)}
            disabled={status === "not-started"}
            title="Move left"
          >
            <ArrowRightLeft className="size-3.5 rotate-180" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onMove(assignment.id, 1)}
            disabled={status === "done"}
            title="Move right"
          >
            <ArrowRightLeft className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
