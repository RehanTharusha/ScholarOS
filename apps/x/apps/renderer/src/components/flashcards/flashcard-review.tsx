import * as React from "react";
import {
  ArrowLeftRight,
  FlipHorizontal2,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FlashcardStats } from "./flashcard-stats";
import type { FlashCard } from "@x/shared/dist/academic.js";

const COURSE_ID = "scholaros-demo";

type Grade = 1 | 2 | 3 | 4;

type FlashcardListResponse = {
  cards: FlashCard[];
  dueCount: number;
  totalCount: number;
};

function isFlippedCard(card: FlashCard): boolean {
  return (card.reviewed?.length ?? 0) > 0;
}

export function FlashcardReview() {
  const [cards, setCards] = React.useState<FlashCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [busyGrade, setBusyGrade] = React.useState<Grade | null>(null);

  const loadCards = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = (await window.ipc.invoke("academic:flashcards:list", {
        courseId: COURSE_ID,
      })) as FlashcardListResponse;
      setCards(result.cards ?? []);
      setActiveIndex((current) =>
        Math.min(current, Math.max((result.cards?.length ?? 1) - 1, 0)),
      );
      setFlipped(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load flashcards",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const activeCard = cards[activeIndex];
  const masteredCount = cards.filter(
    (card) =>
      card.nextReview &&
      new Date(card.nextReview).getTime() >
        Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).length;
  const dueCount = cards.filter(
    (card) =>
      !card.nextReview || new Date(card.nextReview).getTime() <= Date.now(),
  ).length;

  const gradeCard = async (grade: Grade) => {
    if (!activeCard) return;
    setBusyGrade(grade);
    try {
      const result = (await window.ipc.invoke("academic:flashcards:grade", {
        courseId: COURSE_ID,
        cardId: activeCard.id,
        grade,
      })) as { success: boolean; cards?: FlashCard[]; error?: string };

      if (!result.success) {
        throw new Error(result.error || "Failed to grade flashcard");
      }

      setCards(result.cards ?? []);
      setActiveIndex(0);
      setFlipped(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to grade flashcard",
      );
    } finally {
      setBusyGrade(null);
    }
  };

  const nextCard = () => {
    if (cards.length === 0) return;
    setActiveIndex((current) => (current + 1) % cards.length);
    setFlipped(false);
  };

  const previousCard = () => {
    if (cards.length === 0) return;
    setActiveIndex((current) => (current - 1 + cards.length) % cards.length);
    setFlipped(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(120,119,198,0.12),_transparent_40%),linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.98))] text-slate-50">
      <div className="border-b border-white/10 px-6 py-5 backdrop-blur-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">
              ScholarOS Study Mode
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Flashcards
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Review high-yield concepts with spaced repetition and keep the
              session focused on recall, not rereading.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Course: General Studies
            </span>
            <button
              type="button"
              onClick={() => void loadCards()}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-100 transition hover:bg-white/10"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        <FlashcardStats
          totalCount={cards.length}
          dueCount={dueCount}
          masteredCount={masteredCount}
          className="mb-5"
        />

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[380px] items-center justify-center rounded-[2rem] border border-white/10 bg-white/5 text-sm text-slate-300">
            Loading flashcards...
          </div>
        ) : cards.length === 0 ? (
          <div className="flex min-h-[380px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/15 bg-white/5 px-6 text-center text-slate-300">
            <p className="text-lg font-medium text-slate-100">No cards yet</p>
            <p className="mt-2 max-w-md text-sm">
              The backend seeds sample cards automatically. If you see this
              state, reload the tab.
            </p>
            <Button className="mt-4" onClick={() => void loadCards()}>
              Reload cards
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-cyan-950/20">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-2 pb-3">
                <div className="text-sm text-slate-300">
                  Card <span className="text-slate-50">{activeIndex + 1}</span>{" "}
                  of <span className="text-slate-50">{cards.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFlipped((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-100 transition hover:bg-white/10"
                >
                  <FlipHorizontal2 className="size-3.5" />
                  {flipped || isFlippedCard(activeCard)
                    ? "Show front"
                    : "Show answer"}
                </button>
              </div>

              <div
                className={cn(
                  "mt-4 min-h-[280px] rounded-[1.5rem] border border-white/10 p-6 transition-all duration-300",
                  flipped ? "bg-cyan-500/10" : "bg-white/[0.03]",
                )}
              >
                <div className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
                  {flipped ? "Answer" : "Prompt"}
                </div>
                <div className="mt-4 text-2xl font-medium leading-tight text-slate-50">
                  {flipped ? activeCard.back : activeCard.front}
                </div>
                <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300">
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    Difficulty: {activeCard.difficulty}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    Concept: {activeCard.conceptId}
                  </span>
                  {activeCard.nextReview ? (
                    <span className="rounded-full border border-white/10 px-3 py-1">
                      Next review:{" "}
                      {new Date(activeCard.nextReview).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  className="text-slate-200 hover:bg-white/10 hover:text-white"
                  onClick={previousCard}
                >
                  Previous
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    className="gap-2"
                    onClick={() => void gradeCard(1)}
                    disabled={busyGrade !== null}
                  >
                    <XCircle className="size-4" />
                    Again
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white"
                    onClick={() => void gradeCard(2)}
                    disabled={busyGrade !== null}
                  >
                    <ThumbsDown className="size-4" />
                    Hard
                  </Button>
                  <Button
                    className="gap-2 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    onClick={() => void gradeCard(3)}
                    disabled={busyGrade !== null}
                  >
                    <ArrowLeftRight className="size-4" />
                    Good
                  </Button>
                  <Button
                    className="gap-2 bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    onClick={() => void gradeCard(4)}
                    disabled={busyGrade !== null}
                  >
                    <ThumbsUp className="size-4" />
                    Easy
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="text-slate-200 hover:bg-white/10 hover:text-white"
                  onClick={nextCard}
                >
                  Next
                </Button>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                Session notes
              </p>
              <ul className="mt-3 space-y-3">
                <li className="rounded-xl border border-white/10 bg-white/5 p-3">
                  Grade from memory first, then check the answer.
                </li>
                <li className="rounded-xl border border-white/10 bg-white/5 p-3">
                  Use Hard only when you partially recalled the answer.
                </li>
                <li className="rounded-xl border border-white/10 bg-white/5 p-3">
                  Easy should mean instant recall with confidence.
                </li>
              </ul>
              <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-cyan-100">
                Flashcards here are backed by JSON storage in the main process
                and scheduled with FSRS.
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
