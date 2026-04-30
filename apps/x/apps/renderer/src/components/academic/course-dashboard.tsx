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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AcademicCard,
  AcademicEmptyState,
  AcademicMetricCard,
  AcademicPageHeader,
  AcademicPageShell,
  AcademicSectionTitle,
} from "@/components/academic/academic-shell";

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
    },
    {
      label: "Due this week",
      value: summary.dueThisWeek,
      icon: CalendarDays,
    },
    {
      label: "Cards due",
      value: summary.dueFlashcards,
      icon: Sparkles,
    },
    {
      label: "Assignment completion",
      value: completionRatio,
      suffix: "%",
      icon: CheckSquare2,
    },
  ];

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="ScholarOS Study Mode"
        title="Course Dashboard"
        description="Live semester signals pulled from assignment and flashcard data."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {error ? (
          <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {widgets.map((widget) => (
            <AcademicMetricCard
              key={widget.label}
              label={widget.label}
              value={loading ? "..." : widget.value}
              suffix={widget.suffix}
              icon={widget.icon}
            />
          ))}
        </div>

        <AcademicCard className="mt-5">
          <AcademicSectionTitle
            eyebrow="Assignments"
            title="Upcoming deadlines"
            count={upcoming.length}
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {upcoming.map((assignment) => (
              <article
                key={assignment.id}
                className="rounded-2xl border border-border bg-muted/30 p-3"
              >
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
                <p className="mt-3 text-xs text-muted-foreground">
                  Due {new Date(assignment.dueDate).toLocaleDateString()}
                </p>
              </article>
            ))}
            {upcoming.length === 0 ? (
              <AcademicEmptyState
                title="No upcoming assignments found"
                description="Nothing is currently due in the near term."
              />
            ) : null}
          </div>
        </AcademicCard>
      </div>
    </AcademicPageShell>
  );
}
