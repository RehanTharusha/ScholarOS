import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  initializeIfNeeded,
  loadReviewData,
  saveReviewData,
  getDueCards,
  processReview,
  computeRatingIntervals,
  processReviewSession,
  type Flashcard,
  type ReviewData,
} from "@/lib/spaced-repetition";

interface ReviewSessionProps {
  onClose: () => void;
  course?: string;
}

type Phase = "loading" | "empty" | "reviewing" | "summary";

interface SessionSummary {
  cardsReviewed: number;
  correctCount: number;
  duration: number;
}

function intervalLabel(days: number): string {
  if (days < 1) return "<1 day";
  if (days === 1) return "1 day";
  if (days === 30) return "30 days";
  return `${days} days`;
}

const RATING_BUTTONS = [
  { key: "1", quality: 0, label: "Again", intervalKey: "again" as const },
  { key: "2", quality: 2, label: "Hard", intervalKey: "hard" as const },
  { key: "3", quality: 3, label: "Good", intervalKey: "good" as const },
  { key: "4", quality: 5, label: "Easy", intervalKey: "easy" as const },
] as const;

export function ReviewSession({ onClose, course }: ReviewSessionProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<ReviewData | null>(null);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const ratingsRef = useRef<Map<string, number>>(new Map());
  const correctRef = useRef(0);
  const savedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    initializeIfNeeded().then((loaded) => {
      if (cancelled) return;
      const cards = loaded.cards;
      const filtered = course
        ? cards.filter((c: Flashcard) => c.course === course)
        : cards;
      const due = getDueCards(filtered);
      setData({ cards, sessions: loaded.sessions });
      setDueCards(due);
      if (due.length === 0) {
        setPhase("empty");
      } else {
        setPhase("reviewing");
        sessionStartRef.current = Date.now();
      }
    }).catch(() => {
      if (!cancelled) setPhase("empty");
    });
    return () => { cancelled = true; };
  }, [course]);

  const saveSession = useCallback(async () => {
    if (savedRef.current || !data) return;
    savedRef.current = true;

    const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
    const cardIds = dueCards.map((c) => c.id);
    const correctCount = correctRef.current;

    const session = {
      id: `session-${Date.now()}`,
      date: new Date().toISOString(),
      duration,
      cardsReviewed: dueCards.length,
      correctCount,
      course: course ?? "All",
      cardIds,
    };

    const updatedData = processReviewSession(data, session, ratingsRef.current);
    await saveReviewData(updatedData);
    setData(updatedData);
    setSummary({ cardsReviewed: dueCards.length, correctCount, duration });
  }, [data, dueCards, course]);

  const rateCard = useCallback(
    (quality: number) => {
      const card = dueCards[currentIndex];
      if (!card) return;

      const updated = processReview(card, quality);
      ratingsRef.current.set(card.id, quality);
      if (quality >= 3) correctRef.current += 1;

      if (currentIndex + 1 >= dueCards.length) {
        void saveSession().then(() => setPhase("summary"));
      } else {
        setCurrentIndex((i) => i + 1);
        setIsAnswerRevealed(false);
      }
    },
    [currentIndex, dueCards, saveSession],
  );

  const revealAnswer = useCallback(() => {
    if (!isAnswerRevealed) {
      setIsAnswerRevealed(true);
    }
  }, [isAnswerRevealed]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "reviewing") return;

      if (e.key === " ") {
        e.preventDefault();
        if (isAnswerRevealed) {
          rateCard(3);
        } else {
          revealAnswer();
        }
        return;
      }

      if (!isAnswerRevealed) return;

      if (e.key === "1") { e.preventDefault(); rateCard(0); }
      if (e.key === "2") { e.preventDefault(); rateCard(2); }
      if (e.key === "3") { e.preventDefault(); rateCard(3); }
      if (e.key === "4") { e.preventDefault(); rateCard(5); }
    },
    [phase, isAnswerRevealed, rateCard, revealAnswer],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (phase === "loading") {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading review...</p>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold text-foreground">All caught up!</p>
        <p className="text-sm text-muted-foreground">
          No cards are due for review right now.
        </p>
        <button
          onClick={onClose}
          className="mt-2 rounded-xl px-4 py-2 text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (phase === "summary" && summary) {
    const accuracy =
      summary.cardsReviewed > 0
        ? Math.round((summary.correctCount / summary.cardsReviewed) * 100)
        : 0;
    const minutes = Math.floor(summary.duration / 60);
    const seconds = summary.duration % 60;

    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col items-center justify-center gap-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <h2 className="text-2xl font-semibold text-foreground">
            Review Complete
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {summary.cardsReviewed} cards reviewed &middot; {minutes}m {seconds}s
          </p>

          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-border/60 p-4">
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {summary.cardsReviewed}
              </p>
              <p className="text-xs text-muted-foreground">Reviewed</p>
            </div>
            <div className="rounded-2xl border border-border/60 p-4">
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">
                {summary.correctCount}
              </p>
              <p className="text-xs text-muted-foreground">Correct</p>
            </div>
            <div className="rounded-2xl border border-border/60 p-4">
              <p className={cn(
                "text-2xl font-bold tabular-nums",
                accuracy >= 80 ? "text-emerald-600" : accuracy >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600",
              )}>
                {accuracy}%
              </p>
              <p className="text-xs text-muted-foreground">Accuracy</p>
            </div>
          </div>

          <Button onClick={onClose} className="mt-6">
            Back to Dashboard
          </Button>
        </motion.div>
      </div>
    );
  }

  const currentCard = dueCards[currentIndex];
  if (!currentCard) return null;

  const intervals = computeRatingIntervals(currentCard);
  const progress = dueCards.length > 0 ? ((currentIndex) / dueCards.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-foreground">
            Review Session
            {course ? ` — ${course}` : ""}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {currentIndex + 1} of {dueCards.length}
        </span>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentCard.id}-${isAnswerRevealed ? "back" : "front"}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg"
          >
            {/* Course + topic header */}
            <div className="mb-4 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {currentCard.course}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {currentCard.topic}
              </p>
            </div>

            {/* Card */}
            <div className="rounded-2xl border border-border/60 bg-card p-8">
              {/* Question */}
              <p className="text-lg font-medium text-foreground text-center leading-relaxed">
                {currentCard.question}
              </p>

              {!isAnswerRevealed ? (
                <div className="mt-8 flex justify-center">
                  <Button onClick={revealAnswer}>
                    Show Answer
                  </Button>
                </div>
              ) : (
                <>
                  {/* Divider */}
                  <div className="my-6 border-t border-border/40" />

                  {/* Answer */}
                  <p className="text-base text-foreground/85 text-center leading-relaxed">
                    {currentCard.answer}
                  </p>

                  {/* Rating */}
                  <div className="mt-6 text-center">
                    <p className="mb-3 text-xs font-medium text-muted-foreground">
                      How well did you know this?
                    </p>
                    <div className="flex gap-2 justify-center">
                      {RATING_BUTTONS.map((btn) => (
                        <button
                          key={btn.key}
                          onClick={() => rateCard(btn.quality)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-xl px-4 py-3 min-w-[80px]",
                            "border border-border/60 bg-card hover:bg-muted/50 transition-colors",
                          )}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {btn.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {intervalLabel(intervals[btn.intervalKey])}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="px-6 pb-6">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground tabular-nums">
          {Math.round(progress)}% complete
        </p>
      </div>
    </div>
  );
}
