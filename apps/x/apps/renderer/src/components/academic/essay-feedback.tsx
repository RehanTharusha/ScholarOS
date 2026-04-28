import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  RefreshCw,
  Scale,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EssayFeedback, CitationError } from "@x/shared/academic.js";

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_36%),linear-gradient(180deg,_rgba(2,6,23,0.96),_rgba(15,23,42,0.98))] text-slate-50">
      <div className="border-b border-white/10 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/70">
              ScholarOS Study Mode
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Essay Feedback
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Grade a draft against a rubric and surface unsupported claims
              before you submit the assignment.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void gradeEssay()}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-100 transition hover:bg-white/10"
          >
            <RefreshCw className="size-3.5" />
            Regrade draft
          </button>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 gap-5 overflow-hidden px-6 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col gap-4 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-emerald-950/20">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-200">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                <Edit3 className="size-3.5" />
                Draft title
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-50 outline-none transition focus:border-emerald-400/50 focus:bg-white/10"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-200">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                <Scale className="size-3.5" />
                Rubric
              </span>
              <textarea
                value={rubricMarkdown}
                onChange={(event) => setRubricMarkdown(event.target.value)}
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-50 outline-none transition focus:border-emerald-400/50 focus:bg-white/10"
              />
            </label>
          </div>

          <label className="flex min-h-0 flex-1 flex-col gap-2 text-sm text-slate-200">
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
              <Sparkles className="size-3.5" />
              Essay draft
            </span>
            <textarea
              value={essayText}
              onChange={(event) => setEssayText(event.target.value)}
              className="min-h-[280px] flex-1 rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-50 outline-none transition focus:border-emerald-400/50 focus:bg-white/10"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              Feedback is grounded in the rubric and the sources you provide.
            </div>
            <Button
              onClick={() => void gradeEssay()}
              disabled={loading}
              className="gap-2 bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            >
              <CheckCircle2 className="size-4" />
              {loading ? "Grading..." : "Grade essay"}
            </Button>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Overall
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-semibold text-emerald-300">
                {feedback?.overallScore ?? 0}
              </span>
              <span className="pb-1 text-sm text-slate-300">/ 100</span>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {feedback?.suggestions?.[0] ??
                "Run the grader to see rubric feedback and citation checks."}
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Criterion scores
            </p>
            {feedback
              ? Array.from(feedback.criteriaScores.values()).map(
                  (criterion) => (
                    <div
                      key={criterion.criterion}
                      className="rounded-2xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-100">
                            {criterion.criterion}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {criterion.feedback}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-100">
                          {criterion.score}
                        </span>
                      </div>
                    </div>
                  ),
                )
              : null}
          </div>

          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
              <AlertTriangle className="size-3.5" />
              Citation check
            </p>
            {citationErrors.length === 0 ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                No unsupported claims flagged in the current draft.
              </div>
            ) : (
              citationErrors.map((errorItem) => (
                <div
                  key={errorItem.claim}
                  className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-50"
                >
                  {errorItem.claim}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
