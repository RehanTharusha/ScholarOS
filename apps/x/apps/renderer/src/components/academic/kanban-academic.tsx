import * as React from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import type { Assignment } from "@x/shared/dist/academic.js";
import { Button } from "@/components/ui/button";
import {
  AcademicCard,
  AcademicEmptyState,
  AcademicPageHeader,
  AcademicPageShell,
  AcademicSectionTitle,
} from "@/components/academic/academic-shell";
import { TaskCard, type KanbanStatus } from "./task-card";

const columnOrder: KanbanStatus[] = ["not-started", "in-progress", "done"];
const columnTitles: Record<KanbanStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  done: "Done",
};

const columnColors: Record<KanbanStatus, string> = {
  "not-started": "border-l-amber-500/40",
  "in-progress": "border-l-blue-500/40",
  done: "border-l-emerald-500/40",
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
  const [showAddDialog, setShowAddDialog] = React.useState(false);
  const [pendingStatus, setPendingStatus] = React.useState<KanbanStatus>("not-started");
  const [dragOverColumn, setDragOverColumn] = React.useState<KanbanStatus | null>(null);

  const loadAssignments = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [legacyResult, upcomingResult] = await Promise.all([
        window.ipc.invoke("academic:assignments:list", {}),
        window.ipc.invoke("upcoming:tasks:list", {}),
      ]);

      const legacyAssignments: Assignment[] = legacyResult.assignments ?? [];
      const upcomingTasks: Assignment[] = (upcomingResult.tasks ?? []).map(
        (t: { id: string; title: string; courseId: string; dueDate: string; status: string; priority?: string; description?: string }) => ({
          id: `upcoming-${t.id}`,
          courseId: t.courseId,
          title: t.title,
          description: t.description,
          dueDate: t.dueDate,
          status: t.status as Assignment["status"],
          priority: t.priority as Assignment["priority"],
        }),
      );

      // Dedup by courseId+title, prefer upcoming tasks
      const seen = new Set<string>();
      const merged: Assignment[] = [];
      for (const t of upcomingTasks) {
        const key = `${t.courseId}:${t.title}`;
        seen.add(key);
        merged.push(t);
      }
      for (const a of legacyAssignments) {
        const key = `${a.courseId}:${a.title}`;
        if (!seen.has(key)) {
          merged.push(a);
        }
      }
      setAssignments(merged);
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
    async (assignmentId: string, newStatus: KanbanStatus) => {
      try {
        const statusMap: Record<string, Assignment["status"]> = {
          "not-started": "not-started",
          "in-progress": "in-progress",
          done: "submitted",
        };
        if (assignmentId.startsWith("upcoming-")) {
          const taskId = assignmentId.slice("upcoming-".length);
          const response = await window.ipc.invoke("upcoming:tasks:update", {
            taskId,
            updates: { status: statusMap[newStatus] },
          });
          if (!response.success) {
            throw new Error(response.error || "Failed to move task");
          }
          setAssignments((current) =>
            current.map((item) =>
              item.id === assignmentId
                ? { ...item, status: statusMap[newStatus] }
                : item,
            ),
          );
        } else {
          const response = await window.ipc.invoke(
            "academic:assignments:updateStatus",
            { assignmentId, status: newStatus },
          );
          if (!response.success || !response.assignment) {
            throw new Error(response.error || "Failed to move assignment");
          }
          const updated = response.assignment;
          setAssignments((current) =>
            current.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to move assignment",
        );
      }
    },
    [],
  );

  const handleOpenAddDialog = React.useCallback((status: KanbanStatus) => {
    setPendingStatus(status);
    setShowAddDialog(true);
  }, []);

  const handleDragStart = React.useCallback(
    (e: React.DragEvent, assignmentId: string) => {
      e.dataTransfer.setData("text/plain", assignmentId);
      e.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const handleDragOver = React.useCallback(
    (e: React.DragEvent, status: KanbanStatus) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(status);
    },
    [],
  );

  const handleDragLeave = React.useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = React.useCallback(
    async (e: React.DragEvent, newStatus: KanbanStatus) => {
      e.preventDefault();
      setDragOverColumn(null);
      const assignmentId = e.dataTransfer.getData("text/plain");
      if (!assignmentId) return;
      const assignment = assignments.find((a) => a.id === assignmentId);
      if (!assignment) return;
      const currentStatus = toKanbanStatus(assignment.status);
      if (currentStatus === newStatus) return;
      await moveAssignment(assignmentId, newStatus);
    },
    [assignments, moveAssignment],
  );

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="ScholarOS Study Mode"
        title="Assignment Board"
        description="Track coursework from first draft to completion."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadAssignments()}
            >
              <RefreshCw className="size-3.5" />
              Refresh
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
            <Button size="sm" onClick={() => handleOpenAddDialog("not-started")}>
              <Plus className="size-3.5" />
              Add task
            </Button>
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
                status={status}
                className={columnColors[status]}
                assignments={filteredAssignments.filter(
                  (item) => toKanbanStatus(item.status) === status,
                )}
                isDragOver={dragOverColumn === status}
                onDragStart={handleDragStart}
                onDragOver={(e) => handleDragOver(e, status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, status)}
                onMove={moveAssignment}
                onClickAdd={() => handleOpenAddDialog(status)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddDialog ? (
        <AddTaskDialog
          defaultStatus={pendingStatus}
          onClose={() => setShowAddDialog(false)}
          onCreated={() => {
            setShowAddDialog(false);
            void loadAssignments();
          }}
        />
      ) : null}
    </AcademicPageShell>
  );
}

function KanbanColumn({
  title,
  status,
  className = "",
  assignments,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onMove,
  onClickAdd,
}: {
  title: string;
  status: KanbanStatus;
  className?: string;
  assignments: Assignment[];
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, assignmentId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onMove: (assignmentId: string, newStatus: KanbanStatus) => void;
  onClickAdd: () => void;
}) {
  return (
    <AcademicCard
      className={`flex min-h-0 flex-col border-l-2 ${className}`}
    >
      <AcademicSectionTitle
        eyebrow="Status"
        title={title}
        count={assignments.length}
      />

      <div
        className={`mt-4 min-h-0 flex-1 overflow-y-auto pr-1 space-y-3 transition-colors ${
          isDragOver ? "bg-accent/30 rounded-2xl -mx-1 px-1 py-2" : ""
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={(e) => { if (e.target === e.currentTarget) onClickAdd(); }}
      >
        {assignments.length === 0 ? (
          <button
            type="button"
            onClick={onClickAdd}
            className="w-full rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground cursor-pointer"
          >
            {isDragOver ? "Drop here" : "Click to add a task"}
          </button>
        ) : (
          assignments.map((assignment) => (
            <div
              key={assignment.id}
              draggable
              onDragStart={(e) => onDragStart(e, assignment.id)}
              className="cursor-grab active:cursor-grabbing"
            >
              <TaskCard
                assignment={assignment}
                onMove={(id, dir) => {
                  const idx = columnOrder.indexOf(status);
                  const next = columnOrder[Math.max(0, Math.min(columnOrder.length - 1, idx + dir))];
                  if (next !== status) onMove(id, next);
                }}
              />
            </div>
          ))
        )}
      </div>
    </AcademicCard>
  );
}

function AddTaskDialog({
  onClose,
  onCreated,
  defaultStatus,
}: {
  onClose: () => void;
  onCreated: () => void;
  defaultStatus?: KanbanStatus;
}) {
  const [title, setTitle] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [status, setStatus] = React.useState<KanbanStatus>(defaultStatus ?? "not-started");
  const [priority, setPriority] = React.useState<"low" | "medium" | "high">("medium");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !courseId.trim() || !dueDate) {
      setError("Title, course, and due date required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const createStatus = status === "done" ? "submitted" : status;
      const result = await window.ipc.invoke("upcoming:tasks:create", {
        title: title.trim(),
        courseId: courseId.trim(),
        dueDate: new Date(dueDate).toISOString(),
        status: createStatus as "not-started" | "in-progress" | "submitted" | "graded",
        priority,
        description: description.trim(),
        source: "manual",
      });
      if (!result.success) throw new Error(result.error || "Failed to create");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">New task</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              placeholder="Problem Set 5"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Course</label>
              <input
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                placeholder="PHYS220"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as KanbanStatus)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            >
              <option value="not-started">Not started</option>
              <option value="in-progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring resize-none"
              placeholder="Mechanics and conservation laws"
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
