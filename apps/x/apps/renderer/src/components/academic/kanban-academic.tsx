import * as React from "react";
import { RefreshCw } from "lucide-react";
import type { Assignment } from "@x/shared/dist/academic.js";
import { Button } from "@/components/ui/button";
import {
  AcademicCard,
  AcademicEmptyState,
  AcademicPageHeader,
  AcademicPageShell,
  AcademicSectionTitle,
} from "@/components/academic/academic-shell";
import { useVirtualScroll } from "@/hooks/use-virtual-scroll";
import { TaskCard, type KanbanStatus } from "./task-card";

const columnOrder: KanbanStatus[] = ["not-started", "in-progress", "done"];
const columnTitles: Record<KanbanStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  done: "Done",
};

function toKanbanStatus(status: Assignment["status"]): KanbanStatus {
  if (status === "not-started") return "not-started";
  if (status === "in-progress") return "in-progress";
  return "done";
}

export function KanbanAcademic() {
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [courseFilter, setCourseFilter] = React.useState<string>("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadAssignments = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.ipc.invoke("academic:assignments:list", {});
      setAssignments(result.assignments ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load assignments",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const courses = React.useMemo(
    () => [...new Set(assignments.map((item) => item.courseId))].sort(),
    [assignments],
  );

  const filteredAssignments = React.useMemo(() => {
    if (courseFilter === "all") return assignments;
    return assignments.filter((item) => item.courseId === courseFilter);
  }, [assignments, courseFilter]);

  const moveAssignment = React.useCallback(
    async (assignmentId: string, direction: -1 | 1) => {
      const assignment = assignments.find((item) => item.id === assignmentId);
      if (!assignment) return;

      const currentIndex = columnOrder.indexOf(
        toKanbanStatus(assignment.status),
      );
      const nextIndex = Math.max(
        0,
        Math.min(columnOrder.length - 1, currentIndex + direction),
      );
      const nextStatus = columnOrder[nextIndex];

      try {
        const response = await window.ipc.invoke(
          "academic:assignments:updateStatus",
          {
            assignmentId,
            status: nextStatus,
          },
        );

        if (!response.success || !response.assignment) {
          throw new Error(
            response.error || "Failed to update assignment status",
          );
        }

        setAssignments((current) =>
          current.map((item) =>
            item.id === response.assignment.id ? response.assignment : item,
          ),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to move assignment",
        );
      }
    },
    [assignments],
  );

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="ScholarOS Study Mode"
        title="Assignment Board"
        description="Track coursework from first draft to completion, with course context and wiki links."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadAssignments()}
            >
              <RefreshCw className="size-3.5" />
              Refresh board
            </Button>
            <select
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none"
            >
              <option value="all">All courses</option>
              {courses.map((courseId) => (
                <option key={courseId} value={courseId}>
                  {courseId}
                </option>
              ))}
            </select>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-hidden px-6 py-5">
        {error ? (
          <div className="mb-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading ? (
          <AcademicEmptyState
            title="Loading assignments..."
            description="Fetching the current board state."
          />
        ) : (
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-3">
            {columnOrder.map((status) => (
              <KanbanColumn
                key={status}
                title={columnTitles[status]}
                assignments={filteredAssignments.filter(
                  (item) => toKanbanStatus(item.status) === status,
                )}
                onMove={moveAssignment}
              />
            ))}
          </div>
        )}
      </div>
    </AcademicPageShell>
  );
}

function KanbanColumn({
  title,
  assignments,
  onMove,
}: {
  title: string;
  assignments: Assignment[];
  onMove: (assignmentId: string, direction: -1 | 1) => void;
}) {
  const itemHeight = 160;
  const { containerRef, startIndex, endIndex, offsetTop, totalHeight } =
    useVirtualScroll({
      itemCount: assignments.length,
      itemHeight,
    });

  const visibleItems = assignments.slice(startIndex, endIndex);

  return (
    <AcademicCard className="flex min-h-0 flex-col">
      <AcademicSectionTitle
        eyebrow="Status"
        title={title}
        count={assignments.length}
      />

      {assignments.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No tasks in this column.
        </div>
      ) : (
        <div
          ref={containerRef}
          className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <div style={{ height: totalHeight }}>
            <div
              style={{ transform: `translateY(${offsetTop}px)` }}
              className="space-y-3"
            >
              {visibleItems.map((assignment) => (
                <TaskCard
                  key={assignment.id}
                  assignment={assignment}
                  onMove={onMove}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </AcademicCard>
  );
}
