import * as React from "react";
import {
  CalendarDays,
  CheckSquare2,
  Layers3,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type {
  AcademicDashboardSummary,
  Assignment,
} from "@x/shared/dist/academic.js";
import { cn } from "@/lib/utils";

type AssignmentListResponse = { assignments: Assignment[] };

const emptySummary: AcademicDashboardSummary = {
  coursesCount: 0,
  dueToday: 0,
  dueThisWeek: 0,
  completedAssignments: 0,
  totalAssignments: 0,
  dueFlashcards: 0,
};

export function CourseDashboard() {
  const [summary, setSummary] =
    React.useState<AcademicDashboardSummary>(emptySummary);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, assignmentsResponse] = await Promise.all([
        window.ipc.invoke("academic:dashboard:summary", {}),
        window.ipc.invoke("academic:assignments:list", {}),
      ]);

      setSummary(summaryResponse);
      setAssignments(
        (assignmentsResponse as AssignmentListResponse).assignments ?? [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const upcoming = React.useMemo(
    () =>
      [...assignments]
        .filter(
          (assignment) => new Date(assignment.dueDate).getTime() >= Date.now(),
        )
        .sort(
          (a, b) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        )
        .slice(0, 6),
    [assignments],
  );

  const completionRatio =
    summary.totalAssignments > 0
      ? Math.round(
          (summary.completedAssignments / summary.totalAssignments) * 100,
        )
      : 0;

  const widgets = [
    {
      label: "Courses",
      value: summary.coursesCount,
      icon: Layers3,
      accent: "from-sky-500/20 to-cyan-500/10",
    },
    {
      label: "Due this week",
      value: summary.dueThisWeek,
      icon: CalendarDays,
      accent: "from-amber-500/20 to-orange-500/10",
    },
    {
      label: "Cards due",
      value: summary.dueFlashcards,
      icon: Sparkles,
      accent: "from-emerald-500/20 to-lime-500/10",
    },
    {
      label: "Assignment completion",
      value: completionRatio,
      suffix: "%",
      icon: CheckSquare2,
      accent: "from-violet-500/20 to-fuchsia-500/10",
    },
  ];

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
              Live semester signals pulled from assignment and flashcard data.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-100 transition hover:bg-white/10"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

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
                        {loading ? "..." : widget.value}
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

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-slate-950/20">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Assignments
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-50">
                Upcoming deadlines
              </h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-100">
              {upcoming.length}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {upcoming.map((assignment) => (
              <article
                key={assignment.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {assignment.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {assignment.courseId}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-200">
                    {assignment.priority ?? "medium"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-300">
                  Due {new Date(assignment.dueDate).toLocaleDateString()}
                </p>
              </article>
            ))}
            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-slate-400">
                No upcoming assignments found.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
