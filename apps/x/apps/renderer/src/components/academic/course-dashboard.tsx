import * as React from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  CheckSquare2,
  Layers3,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TaskStatus = "not-started" | "in-progress" | "done";

type AcademicTask = {
  id: string;
  title: string;
  course: string;
  due: string;
  status: TaskStatus;
  priority: "high" | "medium" | "low";
};

const initialTasks: AcademicTask[] = [
  {
    id: "task-1",
    title: "Read Chapter 3: Cell Energy",
    course: "Biology 101",
    due: "Today",
    status: "in-progress",
    priority: "high",
  },
  {
    id: "task-2",
    title: "Problem Set 4",
    course: "Physics 220",
    due: "Tomorrow",
    status: "not-started",
    priority: "high",
  },
  {
    id: "task-3",
    title: "Essay outline",
    course: "History 140",
    due: "Friday",
    status: "not-started",
    priority: "medium",
  },
  {
    id: "task-4",
    title: "Flashcard review",
    course: "Biology 101",
    due: "Daily",
    status: "done",
    priority: "low",
  },
];

const widgets = [
  {
    label: "Courses",
    value: 4,
    icon: Layers3,
    accent: "from-sky-500/20 to-cyan-500/10",
  },
  {
    label: "Due this week",
    value: 8,
    icon: CalendarDays,
    accent: "from-amber-500/20 to-orange-500/10",
  },
  {
    label: "Cards mastered",
    value: 72,
    suffix: "%",
    icon: Sparkles,
    accent: "from-emerald-500/20 to-lime-500/10",
  },
  {
    label: "Assignment health",
    value: 5,
    suffix: "/ 5",
    icon: CheckSquare2,
    accent: "from-violet-500/20 to-fuchsia-500/10",
  },
];

const columnOrder: TaskStatus[] = ["not-started", "in-progress", "done"];
const columnTitles: Record<TaskStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  done: "Done",
};

export function CourseDashboard() {
  const [tasks, setTasks] = React.useState(initialTasks);

  const moveTask = (taskId: string, direction: 1 | -1) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task;
        const nextIndex = Math.max(
          0,
          Math.min(
            columnOrder.length - 1,
            columnOrder.indexOf(task.status) + direction,
          ),
        );
        return { ...task, status: columnOrder[nextIndex] };
      }),
    );
  };

  const resetTasks = () => setTasks(initialTasks);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.13),_transparent_36%),linear-gradient(180deg,_rgba(2,6,23,0.96),_rgba(15,23,42,0.98))] text-slate-50">
      <div className="border-b border-white/10 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-sky-200/70">
              ScholarOS Study Mode
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Course Dashboard
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Keep an eye on course load, flashcard progress, and assignment
              movement from one place.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={resetTasks}
            className="gap-2 text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-4" />
            Reset demo data
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {widgets.map((widget) => {
            const Icon = widget.icon;
            return (
              <div
                key={widget.label}
                className={cn(
                  "rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm bg-gradient-to-br",
                  widget.accent,
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-300/80">
                      {widget.label}
                    </p>
                    <div className="mt-1 flex items-end gap-1">
                      <span className="text-2xl font-semibold text-white">
                        {widget.value}
                      </span>
                      {widget.suffix ? (
                        <span className="pb-1 text-sm text-slate-300">
                          {widget.suffix}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-background/80 text-foreground shadow-inner">
                    <Icon className="size-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {columnOrder.map((status) => {
            const columnTasks = tasks.filter((task) => task.status === status);
            return (
              <section
                key={status}
                className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/20"
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Assignments
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-50">
                      {columnTitles[status]}
                    </h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-100">
                    {columnTasks.length}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {columnTasks.map((task) => (
                    <article
                      key={task.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {task.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {task.course}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-200">
                          {task.priority}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300">
                        <span>Due {task.due}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveTask(task.id, -1)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10"
                          >
                            <ArrowRightLeft className="size-3.5 rotate-180" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTask(task.id, 1)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10"
                          >
                            <ArrowRightLeft className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {columnTasks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-slate-400">
                      No tasks in this column.
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
