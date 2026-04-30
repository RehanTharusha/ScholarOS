import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  RefreshCw,
  Scale,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EssayFeedback, CitationError } from "@x/shared/dist/academic.js";
import {
  AcademicCard,
  AcademicEmptyState,
  AcademicPageHeader,
  AcademicPageShell,
  AcademicSectionTitle,
} from "@/components/academic/academic-shell";

type EssayGradeResponse = {
  draft: {
    title: string;
    content: string;
    feedback: EssayFeedback;
    citationErrors: CitationError[];
  };
  feedback: EssayFeedback;
  citationErrors: CitationError[];
};

const DEFAULT_RUBRIC = `# Essay Rubric
- Thesis and argument clarity (10 points)
- Evidence and citations (10 points)
- Organization and flow (5 points)
- Style and academic tone (5 points)`;

const DEFAULT_ESSAY = `Photosynthesis is the process by which plants convert light energy into chemical energy. This matters because it powers most of the food chain and explains why ecosystems depend on sunlight. In the lecture notes, the light reactions and Calvin cycle work together to store energy efficiently. A strong understanding of this topic helps explain later material about cellular respiration and energy transfer.`;

export function EssayFeedbackPanel() {
  const [title, setTitle] = React.useState("Biology Essay Draft");
  const [essayText, setEssayText] = React.useState(DEFAULT_ESSAY);
  const [rubricMarkdown, setRubricMarkdown] = React.useState(DEFAULT_RUBRIC);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<EssayGradeResponse | null>(null);

  const gradeEssay = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = (await window.ipc.invoke("academic:essay:grade", {
        title,
        essayText,
        rubricMarkdown,
        sourceNames: ["lecture-notes.md", "campbell-biology-textbook.pdf"],
        wordGoal: 300,
      })) as EssayGradeResponse;
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade essay");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    void gradeEssay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const feedback = result?.feedback;
  const citationErrors = result?.citationErrors ?? [];

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="ScholarOS Study Mode"
        title="Essay Feedback"
        description="Grade a draft against a rubric and surface unsupported claims before you submit the assignment."
        actions={
          <Button variant="outline" size="sm" onClick={() => void gradeEssay()}>
            <RefreshCw className="size-3.5" />
            Regrade draft
          </Button>
        }
      />

      <div className="grid flex-1 min-h-0 gap-5 overflow-hidden px-6 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AcademicCard className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Edit3 className="size-3.5" />
                Draft title
              </span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <Scale className="size-3.5" />
                Rubric
              </span>
              <Textarea
                value={rubricMarkdown}
                onChange={(event) => setRubricMarkdown(event.target.value)}
                rows={6}
              />
            </label>
          </div>

          <label className="flex min-h-0 flex-1 flex-col gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Sparkles className="size-3.5" />
              Essay draft
            </span>
            <Textarea
              value={essayText}
              onChange={(event) => setEssayText(event.target.value)}
              className="min-h-[280px] flex-1"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="text-xs text-muted-foreground">
              Feedback is grounded in the rubric and the sources you provide.
            </div>
            <Button onClick={() => void gradeEssay()} disabled={loading}>
              <CheckCircle2 className="size-4" />
              {loading ? "Grading..." : "Grade essay"}
            </Button>
          </div>
        </AcademicCard>

        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-sm">
          <AcademicSectionTitle eyebrow="Overall" title="Feedback summary" />
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Score
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-semibold text-foreground">
                {feedback?.overallScore ?? 0}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {feedback?.suggestions?.[0] ??
                "Run the grader to see rubric feedback and citation checks."}
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Criterion scores
            </p>
            {feedback ? (
              Array.from(feedback.criteriaScores.values()).map((criterion) => (
                <div
                  key={criterion.criterion}
                  className="rounded-2xl border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {criterion.criterion}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {criterion.feedback}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full px-2.5 py-1"
                    >
                      {criterion.score}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <AcademicEmptyState
                title="No rubric feedback yet"
                description="Run the grader to populate criterion scores."
              />
            )}
          </div>

          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <AlertTriangle className="size-3.5" />
              Citation check
            </p>
            {citationErrors.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-100">
                No unsupported claims flagged in the current draft.
              </div>
            ) : (
              citationErrors.map((errorItem) => (
                <div
                  key={errorItem.claim}
                  className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-50"
                >
                  {errorItem.claim}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </AcademicPageShell>
  );
}
