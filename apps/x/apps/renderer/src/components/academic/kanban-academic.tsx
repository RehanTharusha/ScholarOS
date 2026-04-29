import * as React from "react";
import { RefreshCw } from "lucide-react";
import type { Assignment } from "@x/shared/dist/academic.js";
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_bottom_left,_rgba(20,184,166,0.14),_transparent_35%),linear-gradient(180deg,_rgba(2,6,23,0.96),_rgba(15,23,42,0.98))] text-slate-50">
      <div className="border-b border-white/10 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-teal-200/70">
              ScholarOS Study Mode
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Assignment Board
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Track coursework from first draft to completion, with course
              context and wiki links.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAssignments()}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-100 transition hover:bg-white/10"
          >
            <RefreshCw className="size-3.5" />
            Refresh board
          </button>
          <select
            value={courseFilter}
            onChange={(event) => setCourseFilter(event.target.value)}
            className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-slate-100 outline-none"
          >
            <option value="all">All courses</option>
            {courses.map((courseId) => (
              <option key={courseId} value={courseId}>
                {courseId}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-6 py-5">
        {error ? (
          <div className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-full items-center justify-center rounded-[2rem] border border-white/10 bg-white/5 text-sm text-slate-300">
            Loading assignments...
          </div>
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
    </div>
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
    <section className="flex min-h-0 flex-col rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/20">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-100">
          {assignments.length}
        </span>
      </div>

      {assignments.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-slate-400">
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
    </section>
  );
}
