import * as React from "react";
import { BookOpen, Check, ChevronsUpDown, Eye, EyeOff, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FlashCard } from "@x/shared/dist/academic.js";
import {
  AcademicEmptyState,
  AcademicPageHeader,
  AcademicPageShell,
} from "@/components/academic/academic-shell";

type FlashcardListResponse = {
  cards: FlashCard[];
  totalCount: number;
};

type CourseOption = {
  id: string;
  name: string;
};

export function FlashcardReview() {
  const [cards, setCards] = React.useState<FlashCard[]>([]);
  const [courses, setCourses] = React.useState<CourseOption[]>([]);
  const [selectedCourses, setSelectedCourses] = React.useState<string[]>([
    "scholaros-demo",
  ]);
  const [loading, setLoading] = React.useState(true);
  const [coursesLoading, setCoursesLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [courseSelectorOpen, setCourseSelectorOpen] = React.useState(false);
  const [results, setResults] = React.useState<Map<string, "correct" | "wrong">>(new Map());
  const [showAllQuestions, setShowAllQuestions] = React.useState(false);
  const [revealedAnswers, setRevealedAnswers] = React.useState<Set<string>>(new Set());

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
    setResults(new Map());
    setRevealedAnswers(new Set());
    setShowAllQuestions(false);
    try {
      const result = (await window.ipc.invoke("academic:flashcards:list", {
        courseIds: selectedCourses,
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
  }, [selectedCourses]);

  React.useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  React.useEffect(() => {
    if (selectedCourses.length > 0) {
      void loadCards();
    }
  }, [selectedCourses, loadCards]);

  const activeCard = cards[activeIndex];

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

  const markCorrect = () => {
    if (activeCard) {
      setResults((prev) => new Map(prev).set(activeCard.id, "correct"));
    }
    nextCard();
  };

  const markWrong = () => {
    if (activeCard) {
      setResults((prev) => new Map(prev).set(activeCard.id, "wrong"));
    }
    if (!flipped) {
      setFlipped(true);
    } else {
      nextCard();
    }
  };

  const toggleAnswerReveal = (cardId: string) => {
    setRevealedAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const toggleCourse = (courseId: string) => {
    setSelectedCourses((prev) => {
      if (prev.includes(courseId)) {
        return prev.filter((id) => id !== courseId);
      } else {
        return [...prev, courseId];
      }
    });
  };

  const selectAllCourses = () => {
    setSelectedCourses(courses.map((c) => c.id));
  };

  const clearCourseSelection = () => {
    setSelectedCourses([]);
  };

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="Study Mode"
        title="Flashcards"
        description="Review concepts. Flip to see the answer, then mark correct or wrong."
        actions={
          <>
            <Popover
              open={courseSelectorOpen}
              onOpenChange={setCourseSelectorOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={courseSelectorOpen}
                  className="w-[250px] justify-between rounded-full"
                  disabled={coursesLoading}
                >
                  <div className="flex items-center gap-2 truncate">
                    <BookOpen className="size-4 shrink-0" />
                    {selectedCourses.length === 0 ? (
                      <span className="text-muted-foreground">
                        Select courses...
                      </span>
                    ) : selectedCourses.length === 1 ? (
                      <span className="truncate">
                        {courses.find((c) => c.id === selectedCourses[0])
                          ?.name || selectedCourses[0]}
                      </span>
                    ) : (
                      <span>{selectedCourses.length} courses selected</span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[250px] p-0">
                <Command>
                  <CommandInput
                    placeholder="Search courses..."
                    className="h-9"
                  />
                  <CommandList>
                    <CommandEmpty>No courses found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={selectAllCourses}
                        className="cursor-pointer"
                      >
                        <Check
                          className={`mr-2 size-4 ${
                            selectedCourses.length === courses.length &&
                            courses.length > 0
                              ? "opacity-100"
                              : "opacity-0"
                          }`}
                        />
                        Select All
                      </CommandItem>
                      <CommandItem
                        onSelect={clearCourseSelection}
                        className="cursor-pointer"
                      >
                        <X className="mr-2 size-4" />
                        Clear Selection
                      </CommandItem>
                      {courses.map((course) => (
                        <CommandItem
                          key={course.id}
                          onSelect={() => toggleCourse(course.id)}
                          className="cursor-pointer"
                        >
                          <Check
                            className={`mr-2 size-4 ${
                              selectedCourses.includes(course.id)
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                          />
                          {course.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
        {selectedCourses.length > 1 ? (
          <div className="mb-5 flex flex-wrap gap-2">
            {selectedCourses.map((courseId) => {
              const course = courses.find((c) => c.id === courseId);
              const courseCards = cards.filter((c) => c.courseId === courseId);
              return (
                <Badge
                  key={courseId}
                  variant="secondary"
                  className="rounded-full px-3 py-1.5"
                >
                  {course?.name || courseId}: {courseCards.length} cards
                </Badge>
              );
            })}
          </div>
        ) : null}

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
            description="Fetching cards from selected courses."
          />
        ) : cards.length === 0 ? (
          <AcademicEmptyState
            title={
              selectedCourses.length === 0
                ? "No courses selected"
                : "No flashcards found"
            }
            description={
              selectedCourses.length === 0
                ? "Select one or more courses above to start reviewing."
                : "Ingest course materials to generate flashcards automatically."
            }
            action={
              <Button variant="outline" onClick={() => void loadCards()}>
                Reload cards
              </Button>
            }
          />
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Card {activeIndex + 1} of {cards.length}
              </span>
              {selectedCourses.length > 1 && activeCard ? (
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {activeCard.courseName || activeCard.courseId}
                </Badge>
              ) : null}
            </div>

            <div
              className="relative mx-auto h-[300px] w-full cursor-pointer perspective-[1000px]"
              onClick={() => setFlipped((value) => !value)}
            >
              <div
                className={`relative h-full w-full transition-transform duration-500 transform-style-preserve-3d ${
                  flipped ? "rotate-y-180" : ""
                }`}
              >
                <div className="absolute inset-0 flex flex-col justify-center rounded-2xl border border-border bg-card p-8 backface-hidden">
                  <div className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground mb-4">
                    Question
                  </div>
                  <p className="text-2xl font-medium leading-relaxed text-foreground">
                    {activeCard.front}
                  </p>
                  <p className="mt-6 text-sm text-muted-foreground">
                    Click to flip
                  </p>
                </div>

                <div className="absolute inset-0 flex flex-col justify-center rounded-2xl border border-border bg-card p-8 backface-hidden rotate-y-180">
                  <div className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground mb-4">
                    Answer
                  </div>
                  <p className="text-2xl font-medium leading-relaxed text-foreground">
                    {activeCard.back}
                  </p>
                  <p className="mt-6 text-sm text-muted-foreground">
                    Click to flip back
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={previousCard}>
                Previous
              </Button>
              <div className="flex gap-3">
                <Button variant="destructive" onClick={() => void markWrong()}>
                  Wrong
                </Button>
                <Button onClick={() => void markCorrect()}>Correct</Button>
              </div>
              <Button variant="ghost" onClick={nextCard}>
                Next
              </Button>
            </div>

            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={() => setShowAllQuestions((v) => !v)}
                className="gap-2"
              >
                {showAllQuestions ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
                {showAllQuestions ? "Hide all questions" : "View all questions"}
              </Button>
            </div>

            {showAllQuestions ? (
              <div className="mt-4 max-h-[400px] overflow-y-auto space-y-3 rounded-2xl border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
                {cards.map((card) => {
                  const result = results.get(card.id);
                  const revealed = revealedAnswers.has(card.id);
                  return (
                    <div
                      key={card.id}
                      className="rounded-xl border border-border bg-muted/20 p-4"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {card.front}
                      </p>
                      {result ? (
                        <span
                          className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                            result === "correct"
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {result === "correct" ? "✓ Correct" : "✗ Wrong"}
                        </span>
                      ) : null}
                      <div
                        className="mt-2 cursor-pointer select-none"
                        onClick={() => toggleAnswerReveal(card.id)}
                      >
                        {revealed ? (
                          <p className="text-sm text-muted-foreground transition-all duration-300">
                            {card.back}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-0.5 overflow-hidden">
                            {card.back
                              .split("")
                              .map((_, i) => (
                                <span
                                  key={i}
                                  className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/20 transition-all duration-200 hover:bg-muted-foreground/40"
                                />
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </AcademicPageShell>
  );
}
