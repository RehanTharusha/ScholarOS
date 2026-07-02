import * as React from "react";
import { useState, useEffect } from "react";
import { Clock, Layers, Flame, Target, LayoutDashboard, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReviewButton } from "@/components/review-button";
import { loadReviewData, getDueCards, getCardStats, type Flashcard, type ReviewSession } from "@/lib/spaced-repetition";

// ---------------------------------------------------------------------------
// Display item types
// ---------------------------------------------------------------------------

interface ReviewItem {
  id: string;
  status: "overdue" | "due-soon" | "on-track";
  topic: string;
  source: string;
  timeEstimate: string;
}

interface MasteryItem {
  id: string;
  course: string;
  percentage: number;
}

interface UpcomingItem {
  id: string;
  topic: string;
  course: string;
  nextReview: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): { greeting: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { greeting: "Good morning", emoji: "\u2600\uFE0F" };
  if (h < 17) return { greeting: "Good afternoon", emoji: "\uD83C\uDF3F" };
  return { greeting: "Good evening", emoji: "\uD83C\uDF19" };
}

function statusDot(status: ReviewItem["status"]) {
  switch (status) {
    case "overdue": return "bg-[#DC2626]";
    case "due-soon": return "bg-[#D97706]";
    case "on-track": return "bg-[#16A34A]";
  }
}

function masteryBarColor(pct: number) {
  if (pct >= 75) return "bg-[#16A34A]";
  if (pct >= 50) return "bg-[#D97706]";
  return "bg-[#DC2626]";
}

function masteryTextColor(pct: number) {
  if (pct >= 75) return "text-[#16A34A]";
  if (pct >= 50) return "text-[#D97706]";
  return "text-[#DC2626]";
}

// ---------------------------------------------------------------------------
// Data computation helpers
// ---------------------------------------------------------------------------

function computeStreak(sessions: ReviewSession[]): number {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const hasSession = sessions.some(s => s.date.startsWith(dateStr));
    if (hasSession) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

function computeWeeklyHours(sessions: ReviewSession[]): number {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  return sessions
    .filter(s => new Date(s.date) >= weekAgo)
    .reduce((sum, s) => sum + s.duration / 3600, 0);
}

function computeAccuracy(sessions: ReviewSession[]): number {
  const recent = sessions.slice(-20);
  if (recent.length === 0) return 0;
  const total = recent.reduce((sum, s) => sum + s.cardsReviewed, 0);
  const correct = recent.reduce((sum, s) => sum + s.correctCount, 0);
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

function computeMasteryByCourse(cards: Flashcard[]) {
  const courses = [...new Set(cards.map(c => c.course))];
  return courses.map(course => {
    const courseCards = cards.filter(c => c.course === course);
    const mastered = courseCards.filter(c => c.interval >= 7).length;
    return {
      course,
      percentage: courseCards.length > 0 ? Math.round((mastered / courseCards.length) * 100) : 0,
    };
  });
}

function computeWeeklyActivity(sessions: ReviewSession[]): number[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split("T")[0];
    return sessions
      .filter(s => s.date.startsWith(dateStr))
      .reduce((sum, s) => sum + s.duration / 3600, 0);
  });
}

function mapDueCardsToReviews(cards: Flashcard[]): ReviewItem[] {
  return cards.slice(0, 4).map(card => {
    const nextDate = new Date(card.nextReview);
    const now = new Date();
    const daysDiff = (now.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24);
    const status: ReviewItem["status"] = daysDiff > 1 ? "overdue" : "due-soon";
    return {
      id: card.id,
      status,
      topic: card.topic,
      source: card.noteSource,
      timeEstimate: "5 min",
    };
  });
}

function mapMasteryToItems(cards: Flashcard[]): MasteryItem[] {
  return computeMasteryByCourse(cards).map((item, i) => ({
    id: `m-${i}`,
    course: item.course,
    percentage: item.percentage,
  }));
}

function getUpcomingReviews(cards: Flashcard[]): UpcomingItem[] {
  const now = new Date();
  return cards
    .filter(c => new Date(c.nextReview) > now)
    .sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime())
    .slice(0, 3)
    .map(c => ({
      id: c.id,
      topic: c.topic,
      course: c.course,
      nextReview: c.nextReview,
    }));
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  value,
  label,
  circleBg,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  circleBg: string;
  iconColor: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", circleBg)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function WeeklyActivity({ hours }: { hours: number[] }) {
  const max = Math.max(...hours, 0.1);
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Weekly Activity</p>
      <div className="flex items-end gap-1.5 h-14">
        {hours.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full flex-1 flex flex-col justify-end">
              <div
                className="w-full rounded-sm bg-[#8B5CF6]/75 transition-all"
                style={{ height: `${Math.round((h / max) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ item }: { item: ReviewItem }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className={cn("h-2.5 w-2.5 shrink-0 rounded-full", statusDot(item.status))} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.topic}</p>
        <p className="text-xs text-muted-foreground">{item.source}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.timeEstimate}</span>
    </div>
  );
}

function MasteryRow({ item }: { item: MasteryItem }) {
  const pct = item.percentage;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-sm font-medium text-foreground">{item.course}</span>
      <div className="flex-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", masteryBarColor(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("w-9 shrink-0 text-right text-sm font-semibold tabular-nums", masteryTextColor(pct))}>
        {pct}%
      </span>
    </div>
  );
}

function UpcomingRow({ item }: { item: UpcomingItem }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.topic}</p>
        <p className="text-xs text-muted-foreground">{item.course}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatRelativeDate(item.nextReview)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimal view
// ---------------------------------------------------------------------------

function MinimalView({ onToggle }: { onToggle: () => void }) {
  const { greeting, emoji } = getGreeting();
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center gap-4 px-6">
      <button
        onClick={onToggle}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        title="Show dashboard"
      >
        <LayoutDashboard className="h-4 w-4" />
      </button>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground/80 sm:text-3xl md:text-4xl">
        {greeting}, Scholar <span aria-hidden>{emoji}</span>
      </h1>
      <p className="text-sm text-muted-foreground">What are we working on?</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard view
// ---------------------------------------------------------------------------

function DashboardView({
  onStartReview,
  onToggle,
}: {
  onStartReview?: () => void;
  onToggle: () => void;
}) {
  const { greeting, emoji } = getGreeting();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await loadReviewData();
        setCards(data.cards);
        setSessions(data.sessions);
      } catch {
        // IPC not available — use empty arrays
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const dueCards = getDueCards(cards);

  const weeklyHoursValue = computeWeeklyHours(sessions);
  const totalReviewed = sessions.reduce((sum, s) => sum + s.cardsReviewed, 0);
  const streakValue = computeStreak(sessions);
  const accuracyValue = computeAccuracy(sessions);
  const activityData = computeWeeklyActivity(sessions);

  const reviewItems = mapDueCardsToReviews(dueCards);
  const masteryItems = mapMasteryToItems(cards);
  const upcomingItems = getUpcomingReviews(cards);

  const studyTimeLabel = sessions.length > 0 ? `${weeklyHoursValue.toFixed(1)}h` : "0h";
  const reviewedLabel = sessions.length > 0 ? String(totalReviewed) : "0";
  const streakLabel = sessions.length > 0 ? `${streakValue}d` : "0d";
  const accuracyLabel = sessions.length > 0 ? `${accuracyValue}%` : "\u2014";

  return (
    <div className="relative mx-auto w-full max-w-4xl overflow-hidden py-4 flex flex-col gap-4">
      {/* Toggle */}
      <button
        onClick={onToggle}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        title="Switch to minimal view"
      >
        <MessageSquare className="h-4 w-4" />
      </button>

      {/* Greeting */}
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {greeting}, Scholar{" "}
        <span aria-hidden>{emoji}</span>
      </h1>

      {/* Row 1 */}
      <div className="grid grid-cols-2 gap-4">
        {/* Study Overview */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-foreground">Study Overview</h2>
            {loading && (
              <span className="text-xs text-muted-foreground animate-pulse">Syncing...</span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3 mb-5">
            <StatCard
              icon={Clock}
              value={studyTimeLabel}
              label="This Week"
              circleBg="bg-yellow-100"
              iconColor="text-yellow-600"
            />
            <StatCard
              icon={Layers}
              value={reviewedLabel}
              label="Reviewed"
              circleBg="bg-blue-100"
              iconColor="text-blue-600"
            />
            <StatCard
              icon={Flame}
              value={streakLabel}
              label="Streak"
              circleBg="bg-pink-100"
              iconColor="text-pink-600"
            />
            <StatCard
              icon={Target}
              value={accuracyLabel}
              label="Accuracy"
              circleBg="bg-green-100"
              iconColor="text-green-600"
            />
          </div>

          <WeeklyActivity hours={activityData} />
        </div>

        {/* Today's Review */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Today&apos;s Review</h2>

          <div className="flex-1 space-y-0.5">
            {reviewItems.length > 0 ? (
              reviewItems.map((item) => (
                <ReviewRow key={item.id} item={item} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No cards due. Use the AI to generate flashcards from your notes!
              </p>
            )}
          </div>

          <div className="mt-3">
            <ReviewButton onClick={onStartReview ?? (() => {})} />
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 gap-4">
        {/* Mastery */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Mastery</h2>

          <div className="space-y-4">
            {masteryItems.length > 0 ? (
              masteryItems.map((item) => (
                <MasteryRow key={item.id} item={item} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No mastery data yet. Start reviewing to track your progress.
              </p>
            )}
          </div>
        </div>

        {/* Upcoming Reviews */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Upcoming Reviews</h2>

          <div className="space-y-0.5">
            {upcomingItems.length > 0 ? (
              upcomingItems.map((item) => (
                <UpcomingRow key={item.id} item={item} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No upcoming reviews. Generate flashcards to get started.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function StudyDashboard({ onStartReview }: { onStartReview?: () => void }) {
  const [minimalMode, setMinimalMode] = useState(false);

  // Load preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("scholaros-dashboard-mode");
    if (saved === "minimal") setMinimalMode(true);
  }, []);

  const toggleMode = () => {
    const next = !minimalMode;
    setMinimalMode(next);
    localStorage.setItem("scholaros-dashboard-mode", next ? "minimal" : "dashboard");
  };

  if (minimalMode) {
    return <MinimalView onToggle={toggleMode} />;
  }

  return <DashboardView onStartReview={onStartReview} onToggle={toggleMode} />;
}
