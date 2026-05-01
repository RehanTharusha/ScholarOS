import * as React from "react";
import {
  ArrowLeftRight,
  BookOpen,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlashcardStats } from "./flashcard-stats";
import type { FlashCard } from "@x/shared/dist/academic.js";
import {
  AcademicCard,
  AcademicEmptyState,
  AcademicPageHeader,
  AcademicPageShell,
  AcademicSectionTitle,
} from "@/components/academic/academic-shell";

type Grade = 1 | 2 | 3 | 4;

type FlashcardListResponse = {
  cards: FlashCard[];
  dueCount: number;
  totalCount: number;
};

type CourseOption = {
  id: string;
  name: string;
};

export function FlashcardReview() {
  const [cards, setCards] = React.useState<FlashCard[]>([]);
  const [courses, setCourses] = React.useState<CourseOption[]>([]);
  const [selectedCourse, setSelectedCourse] =
    React.useState<string>("scholaros-demo");
  const [loading, setLoading] = React.useState(true);
  const [coursesLoading, setCoursesLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [busyGrade, setBusyGrade] = React.useState<Grade | null>(null);

  const loadCourses = React.useCallback(async () => {
    setCoursesLoading(true);
    try {
      const result = (await window.ipc.invoke(
        "academic:flashcards:courses",
        {},
      )) as { courses: string[] };
      const courseList = (result.courses || []).map((c) => ({
        id: c,
        name: c,
      }));
      setCourses(courseList);
    } catch (err) {
      console.error("Failed to load courses:", err);
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  const loadCards = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = (await window.ipc.invoke("academic:flashcards:list", {
        courseId: selectedCourse,
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
  }, [selectedCourse]);

  React.useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  React.useEffect(() => {
    if (selectedCourse) {
      void loadCards();
    }
  }, [selectedCourse, loadCards]);

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
        courseId: selectedCourse,
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
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="ScholarOS Study Mode"
        title="Flashcards"
        description="Review high-yield concepts with spaced repetition and keep the session focused on recall, not rereading."
        actions={
          <>
            <Select
              value={selectedCourse}
              onValueChange={(value) => setSelectedCourse(value)}
              disabled={coursesLoading}
            >
              <SelectTrigger className="w-[200px] rounded-full">
                <BookOpen className="mr-2 size-4" />
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadCards()}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        <FlashcardStats
          totalCount={cards.length}
          dueCount={dueCount}
          masteredCount={masteredCount}
          className="mb-5"
        />

        {error ? (
          <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {coursesLoading ? (
          <AcademicEmptyState
            title="Loading courses..."
            description="Fetching available courses with flashcards."
          />
        ) : loading ? (
          <AcademicEmptyState
            title="Loading flashcards..."
            description="Fetching the current review queue."
          />
        ) : cards.length === 0 ? (
          <AcademicEmptyState
            title={
              selectedCourse === "scholaros-demo"
                ? "No cards yet"
                : "No flashcards for this course"
            }
            description={
              selectedCourse === "scholaros-demo"
                ? "The backend seeds sample cards automatically. If you see this state, reload the tab."
                : "Ingest course materials to automatically generate flashcards for review."
            }
            action={
              <Button variant="outline" onClick={() => void loadCards()}>
                Reload cards
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <AcademicCard className="flex min-h-0 flex-col">
              <AcademicSectionTitle
                eyebrow="Review"
                title={`Card ${activeIndex + 1} of ${cards.length}`}
              />

              <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-6 transition-colors duration-200">
                <div className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                  {flipped ? "Answer" : "Prompt"}
                </div>
                <button
                  type="button"
                  onClick={() => setFlipped((value) => !value)}
                  className="mt-4 block w-full text-left text-2xl font-medium leading-tight text-foreground"
                >
                  {flipped ? activeCard.back : activeCard.front}
                </button>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    Difficulty: {activeCard.difficulty}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    Concept: {activeCard.conceptTitle || activeCard.conceptId}
                  </Badge>
                  {activeCard.tags && activeCard.tags.length > 0
                    ? activeCard.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="rounded-full px-3 py-1"
                        >
                          {tag}
                        </Badge>
                      ))
                    : null}
                  {activeCard.nextReview ? (
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      Next review:{" "}
                      {new Date(activeCard.nextReview).toLocaleDateString()}
                    </Badge>
                  ) : null}
                </div>
              </div>

              {activeCard.sourceReferences &&
              activeCard.sourceReferences.length > 0 ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                    Sources
                  </div>
                  <ul className="mt-2 space-y-1">
                    {activeCard.sourceReferences.map((src, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground">
                        📄 {src}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {activeCard.notes ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                    Notes
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    {activeCard.notes}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={previousCard}>
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
                    className="gap-2"
                    onClick={() => void gradeCard(2)}
                    disabled={busyGrade !== null}
                  >
                    <ThumbsDown className="size-4" />
                    Hard
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={() => void gradeCard(3)}
                    disabled={busyGrade !== null}
                  >
                    <ArrowLeftRight className="size-4" />
                    Good
                  </Button>
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => void gradeCard(4)}
                    disabled={busyGrade !== null}
                  >
                    <ThumbsUp className="size-4" />
                    Easy
                  </Button>
                </div>
                <Button variant="ghost" onClick={nextCard}>
                  Next
                </Button>
              </div>
            </AcademicCard>

            <aside className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
              <AcademicSectionTitle
                eyebrow="Session notes"
                title="Review rules"
              />
              <ul className="mt-3 space-y-3">
                <li className="rounded-xl border border-border bg-muted/30 p-3">
                  Grade from memory first, then check the answer.
                </li>
                <li className="rounded-xl border border-border bg-muted/30 p-3">
                  Use Hard only when you partially recalled the answer.
                </li>
                <li className="rounded-xl border border-border bg-muted/30 p-3">
                  Easy should mean instant recall with confidence.
                </li>
              </ul>
              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground">
                Flashcards are backed by JSON storage in the main process and
                scheduled with FSRS.
              </div>
            </aside>
          </div>
        )}
      </div>
    </AcademicPageShell>
  );
}
