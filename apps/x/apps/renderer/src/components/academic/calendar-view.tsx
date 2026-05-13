import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  AcademicCard,
  AcademicEmptyState,
  AcademicMetricCard,
  AcademicPageHeader,
  AcademicPageShell,
  AcademicSectionTitle,
} from "@/components/academic/academic-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CalendarViewMode = "month" | "week" | "day";

type CalendarEvent = {
  id: string;
  title: string;
  courseId?: string;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  taskMdPath?: string;
};

type CalendarStore = {
  version: 1;
  events: CalendarEvent[];
};

type CalendarEventDraft = {
  title: string;
  courseId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
  notes: string;
};

const CALENDAR_FILE_PATH = "knowledge/calendar.json";

const emptyStore: CalendarStore = { version: 1, events: [] };

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function toLocalDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeInput(value: Date) {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    23,
    59,
    59,
    999,
  );
}

function startOfWeek(value: Date) {
  const day = value.getDay();
  const result = startOfDay(value);
  result.setDate(result.getDate() - day);
  return result;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventStart(event: CalendarEvent) {
  return parseDate(event.startAt) ?? new Date(event.startAt);
}

function eventEnd(event: CalendarEvent) {
  return (
    parseDate(event.endAt || event.startAt) ??
    new Date(event.endAt || event.startAt)
  );
}

function formatEventTime(event: CalendarEvent) {
  const start = eventStart(event);
  if (event.allDay) return "All day";
  return start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatRangeLabel(mode: CalendarViewMode, anchor: Date) {
  if (mode === "month") {
    return anchor.toLocaleDateString([], { month: "long", year: "numeric" });
  }

  if (mode === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  }

  return anchor.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeStore(raw: unknown): CalendarStore {
  if (!raw || typeof raw !== "object") return emptyStore;
  if (Array.isArray(raw)) {
    return { version: 1, events: raw as CalendarEvent[] };
  }

  const maybeStore = raw as Partial<CalendarStore> & { events?: unknown };
  if (Array.isArray(maybeStore.events)) {
    return { version: 1, events: maybeStore.events as CalendarEvent[] };
  }

  return emptyStore;
}

function mergeDraft(event: CalendarEvent | null): CalendarEventDraft {
  if (!event) {
    const now = new Date();
    const startDate = toLocalDateInput(now);
    const startTime = toLocalTimeInput(
      new Date(now.getTime() + 60 * 60 * 1000),
    );
    const endTime = toLocalTimeInput(
      new Date(now.getTime() + 2 * 60 * 60 * 1000),
    );
    return {
      title: "",
      courseId: "",
      startDate,
      startTime,
      endDate: startDate,
      endTime,
      allDay: false,
      location: "",
      notes: "",
    };
  }

  const start = eventStart(event);
  const end = eventEnd(event);
  return {
    title: event.title,
    courseId: event.courseId ?? "",
    startDate: toLocalDateInput(start),
    startTime: toLocalTimeInput(start),
    endDate: toLocalDateInput(end),
    endTime: toLocalTimeInput(end),
    allDay: Boolean(event.allDay),
    location: event.location ?? "",
    notes: event.notes ?? "",
  };
}

function draftToEvent(
  draft: CalendarEventDraft,
  existing?: CalendarEvent | null,
): CalendarEvent {
  const startAt = draft.allDay
    ? new Date(`${draft.startDate}T00:00:00`).toISOString()
    : new Date(
        `${draft.startDate}T${draft.startTime || "00:00"}:00`,
      ).toISOString();
  const endAt = draft.allDay
    ? new Date(`${draft.endDate}T23:59:59`).toISOString()
    : new Date(
        `${draft.endDate}T${draft.endTime || draft.startTime || "00:00"}:00`,
      ).toISOString();

  return {
    id: existing?.id ?? makeId(),
    title: draft.title.trim(),
    courseId: draft.courseId.trim() || undefined,
    startAt,
    endAt,
    allDay: draft.allDay,
    location: draft.location.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort(
    (a, b) => eventStart(a).getTime() - eventStart(b).getTime(),
  );
}

function getCalendarEventTone(event: CalendarEvent) {
  const source = event.courseId ?? event.title;
  let hash = 0;
  for (const char of source) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hues = [210, 256, 180, 28, 120, 330];
  return hues[hash % hues.length];
}

export function AcademicCalendar({
  onNavigateToTask,
}: {
  onNavigateToTask?: (path: string) => void;
}) {
  const [viewMode, setViewMode] = React.useState<CalendarViewMode>("month");
  const [anchorDate, setAnchorDate] = React.useState(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState(() =>
    startOfDay(new Date()),
  );
  const [store, setStore] = React.useState<CalendarStore>(emptyStore);
  const [upcomingEvents, setUpcomingEvents] = React.useState<CalendarEvent[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingEventId, setEditingEventId] = React.useState<string | null>(
    null,
  );
  const [draft, setDraft] = React.useState<CalendarEventDraft>(() =>
    mergeDraft(null),
  );

  const loadStore = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calResult, upcomingResult] = await Promise.all([
        window.ipc.invoke("workspace:readFile", {
          path: CALENDAR_FILE_PATH,
          encoding: "utf8",
        }),
        window.ipc.invoke("upcoming:tasks:list", {}),
      ]);

      // Load calendar events
      const raw = typeof calResult?.data === "string" ? calResult.data : calResult;
      const parsed = normalizeStore(JSON.parse(String(raw)));
      setStore({ version: 1, events: sortEvents(parsed.events) });

      // Convert upcoming tasks to calendar events
      const taskEvents: CalendarEvent[] = (
        upcomingResult?.tasks ?? []
      ).map((task: { id: string; title: string; courseId: string; dueDate: string; mdPath: string }) => ({
        id: `upcoming-${task.id}`,
        title: task.title,
        courseId: task.courseId,
        startAt: new Date(task.dueDate).toISOString(),
        allDay: true,
        notes: "Upcoming task — click to open details",
        createdAt: "",
        updatedAt: "",
        taskMdPath: task.mdPath,
      }));
      setUpcomingEvents(taskEvents);
    } catch (err) {
      setStore(emptyStore);
      if (
        err instanceof Error &&
        !/ENOENT|not found|does not exist/i.test(err.message)
      ) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadStore();
  }, [loadStore]);

  const saveStore = React.useCallback(async (next: CalendarStore) => {
    setSaving(true);
    try {
      await window.ipc.invoke("workspace:writeFile", {
        path: CALENDAR_FILE_PATH,
        data: `${JSON.stringify(next, null, 2)}\n`,
      });
      setStore({ version: 1, events: sortEvents(next.events) });
    } finally {
      setSaving(false);
    }
  }, []);

  const events = React.useMemo(
    () => sortEvents([...store.events, ...upcomingEvents]),
    [store.events, upcomingEvents],
  );

  const range = React.useMemo(() => {
    if (viewMode === "month") {
      return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
    }
    if (viewMode === "week") {
      const start = startOfWeek(anchorDate);
      return { start, end: addDays(start, 6) };
    }
    return { start: startOfDay(anchorDate), end: endOfDay(anchorDate) };
  }, [anchorDate, viewMode]);

  const visibleEvents = React.useMemo(() => {
    return events.filter((event) => {
      const start = eventStart(event);
      const end = eventEnd(event);
      return start <= range.end && end >= range.start;
    });
  }, [events, range]);

  const selectedDayEvents = React.useMemo(() => {
    return events
      .filter((event) => {
        const start = eventStart(event);
        const end = eventEnd(event);
        return (
          startOfDay(start) <= selectedDate && endOfDay(end) >= selectedDate
        );
      })
      .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
  }, [events, selectedDate]);

  const monthCells = React.useMemo(() => {
    const first = startOfMonth(anchorDate);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [anchorDate]);

  const openCreate = React.useCallback(
    (date?: Date) => {
      const base = date ? startOfDay(date) : selectedDate;
      setEditingEventId(null);
      setDraft((current) => {
        const next = mergeDraft(null);
        next.startDate = toLocalDateInput(base);
        next.endDate = toLocalDateInput(base);
        next.startTime = current.startTime;
        next.endTime = current.endTime;
        return next;
      });
      setEditorOpen(true);
    },
    [selectedDate],
  );

  const openEdit = React.useCallback((event: CalendarEvent) => {
    if (event.taskMdPath && onNavigateToTask) {
      onNavigateToTask(event.taskMdPath);
      return;
    }
    setEditingEventId(event.id);
    setDraft(mergeDraft(event));
    setEditorOpen(true);
  }, [onNavigateToTask]);

  const editingEvent = React.useMemo(
    () => events.find((event) => event.id === editingEventId) ?? null,
    [editingEventId, events],
  );

  const submitEvent = React.useCallback(async () => {
    if (!draft.title.trim()) return;
    const nextEvent = draftToEvent(draft, editingEvent);
    if (Number.isNaN(new Date(nextEvent.startAt).getTime())) return;
    if (Number.isNaN(new Date(nextEvent.endAt || nextEvent.startAt).getTime()))
      return;

    const nextEvents = editingEvent
      ? events.map((event) =>
          event.id === editingEvent.id ? nextEvent : event,
        )
      : [...events, nextEvent];

    setEditorOpen(false);
    setEditingEventId(null);
    await saveStore({ version: 1, events: sortEvents(nextEvents) });
  }, [draft, editingEvent, events, saveStore]);

  const deleteEvent = React.useCallback(
    async (eventId: string) => {
      const nextEvents = events.filter((event) => event.id !== eventId);
      await saveStore({ version: 1, events: nextEvents });
      if (editingEventId === eventId) {
        setEditorOpen(false);
        setEditingEventId(null);
      }
    },
    [editingEventId, events, saveStore],
  );

  const jump = React.useCallback(
    (delta: number) => {
      setAnchorDate((current) => {
        if (viewMode === "month")
          return new Date(current.getFullYear(), current.getMonth() + delta, 1);
        if (viewMode === "week") return addDays(current, delta * 7);
        return addDays(current, delta);
      });
    },
    [viewMode],
  );

  const summary = React.useMemo(() => {
    const today = startOfDay(new Date());
    const weekStart = startOfWeek(today);
    const weekEnd = addDays(weekStart, 6);
    const todayEvents = events.filter((event) => {
      const start = eventStart(event);
      const end = eventEnd(event);
      return startOfDay(start) <= today && endOfDay(end) >= today;
    });
    const weekEvents = events.filter((event) => {
      const start = eventStart(event);
      const end = eventEnd(event);
      return start <= weekEnd && end >= weekStart;
    });
    return {
      total: events.length,
      today: todayEvents.length,
      week: weekEvents.length,
      courses: new Set(events.map((event) => event.courseId).filter(Boolean))
        .size,
    };
  }, [events]);

  const viewTitle = formatRangeLabel(viewMode, anchorDate);

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="ScholarOS Study Mode"
        title="Calendar"
        description="One JSON-backed calendar for classes, assignments, appointments, and reminders."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadStore()}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="size-3.5" />
              New event
            </Button>
          </>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {error ? (
          <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AcademicMetricCard
            label="Events"
            value={loading ? "..." : summary.total}
            icon={CalendarDays}
          />
          <AcademicMetricCard
            label="Today"
            value={loading ? "..." : summary.today}
            icon={CalendarDays}
          />
          <AcademicMetricCard
            label="This week"
            value={loading ? "..." : summary.week}
            icon={CalendarDays}
          />
          <AcademicMetricCard
            label="Courses"
            value={loading ? "..." : summary.courses}
            icon={CalendarDays}
          />
        </div>

        <AcademicCard className="mt-5 flex min-h-0 flex-col gap-5">
          <div className="flex flex-col gap-4 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {viewMode}
              </p>
              <h3 className="text-lg font-semibold text-foreground">
                {viewTitle}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border bg-muted p-1">
                {(["month", "week", "day"] as CalendarViewMode[]).map(
                  (mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm transition-colors",
                        viewMode === mode
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {mode}
                    </button>
                  ),
                )}
              </div>

              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => jump(-1)}
                  className="h-8 rounded-full px-3"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAnchorDate(new Date());
                    setSelectedDate(startOfDay(new Date()));
                  }}
                  className="h-8 rounded-full px-3"
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => jump(1)}
                  className="h-8 rounded-full px-3"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-0 space-y-4">
              {viewMode === "month" ? (
                <MonthGrid
                  cells={monthCells}
                  anchorDate={anchorDate}
                  events={visibleEvents}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  onEditEvent={openEdit}
                  onAddEvent={openCreate}
                />
              ) : viewMode === "week" ? (
                <WeekGrid
                  anchorDate={anchorDate}
                  events={visibleEvents}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  onEditEvent={openEdit}
                  onAddEvent={openCreate}
                />
              ) : (
                <DayAgenda
                  day={selectedDate}
                  events={selectedDayEvents}
                  onEditEvent={openEdit}
                  onAddEvent={openCreate}
                />
              )}
            </div>

            <AcademicCard className="min-h-0">
              <AcademicSectionTitle
                eyebrow="Agenda"
                title="Selected day"
                count={selectedDayEvents.length}
              />

              <div className="mt-4 flex flex-col gap-3">
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">
                    {selectedDate.toLocaleDateString([], {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Click a day in the calendar to change the agenda panel.
                  </p>
                </div>

                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {selectedDayEvents.length === 0 ? (
                    <AcademicEmptyState
                      title="No events on this day"
                      description="Add a class, deadline, or appointment for the selected date."
                      action={
                        <Button onClick={() => openCreate(selectedDate)}>
                          Add event
                        </Button>
                      }
                    />
                  ) : (
                    selectedDayEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => openEdit(event)}
                        className="w-full rounded-2xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {event.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatEventTime(event)}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.18em]"
                          >
                            {event.courseId ?? "Personal"}
                          </Badge>
                        </div>
                        {event.location ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {event.location}
                          </p>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </AcademicCard>
          </div>
        </AcademicCard>
      </div>

      <EventEditorDialog
        open={editorOpen}
        title={editingEvent ? "Edit event" : "New event"}
        description="Store event details in calendar.json and reuse them across month, week, and day views."
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={() => {
          setEditorOpen(false);
          setEditingEventId(null);
        }}
        onSubmit={() => void submitEvent()}
        onDelete={
          editingEvent ? () => void deleteEvent(editingEvent.id) : undefined
        }
      />
    </AcademicPageShell>
  );
}

function MonthGrid({
  cells,
  anchorDate,
  events,
  selectedDate,
  onSelectDate,
  onEditEvent,
  onAddEvent,
}: {
  cells: Date[];
  anchorDate: Date;
  events: CalendarEvent[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onAddEvent: (date: Date) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="grid grid-cols-7 gap-2 px-1 pb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {weekdayLabels.map((label) => (
          <div key={label} className="px-1 py-1 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell) => {
          const dayEvents = events.filter((event) =>
            isSameDay(eventStart(event), cell),
          );
          const inMonth = cell.getMonth() === anchorDate.getMonth();
          const isSelected = isSameDay(cell, selectedDate);
          return (
            <button
              key={cell.toISOString()}
              type="button"
              onClick={() => onSelectDate(cell)}
              onDoubleClick={() => onAddEvent(cell)}
              className={cn(
                "min-h-[110px] rounded-2xl border p-2 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/40",
                inMonth ? "opacity-100" : "opacity-45",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isSelected ? "text-primary" : "text-foreground",
                  )}
                >
                  {cell.getDate()}
                </span>
                {dayEvents.length > 0 ? (
                  <Badge
                    variant="outline"
                    className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]"
                  >
                    {dayEvents.length}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventPill
                    key={event.id}
                    event={event}
                    onClick={() => onEditEvent(event)}
                  />
                ))}
                {dayEvents.length > 3 ? (
                  <p className="text-[11px] text-muted-foreground">
                    +{dayEvents.length - 3} more
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  anchorDate,
  events,
  selectedDate,
  onSelectDate,
  onEditEvent,
  onAddEvent,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onAddEvent: (date: Date) => void;
}) {
  const weekStart = startOfWeek(anchorDate);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );

  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayEvents = events.filter((event) => {
            const start = eventStart(event);
            const end = eventEnd(event);
            return startOfDay(start) <= day && endOfDay(end) >= day;
          });
          const isSelected = isSameDay(day, selectedDate);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[280px] rounded-2xl border p-2",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDate(day)}
                onDoubleClick={() => onAddEvent(day)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-left hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {weekdayLabels[day.getDay()]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {day.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                {isSelected ? (
                  <Badge variant="secondary">Selected</Badge>
                ) : null}
              </button>

              <div className="mt-2 space-y-2">
                {dayEvents.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">
                    No events
                  </p>
                ) : (
                  dayEvents.map((event) => (
                    <EventPill
                      key={event.id}
                      event={event}
                      onClick={() => onEditEvent(event)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayAgenda({
  day,
  events,
  onEditEvent,
  onAddEvent,
}: {
  day: Date;
  events: CalendarEvent[];
  onEditEvent: (event: CalendarEvent) => void;
  onAddEvent: (date: Date) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Day view
          </p>
          <h4 className="mt-1 text-lg font-semibold text-foreground">
            {day.toLocaleDateString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h4>
        </div>
        <Button variant="outline" size="sm" onClick={() => onAddEvent(day)}>
          <Plus className="size-3.5" />
          Add event
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {events.length === 0 ? (
          <AcademicEmptyState
            title="No events on this day"
            description="Use the add button to create a new appointment or assignment reminder."
          />
        ) : (
          events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              onClick={() => onEditEvent(event)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EventPill({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  const hue = getCalendarEventTone(event);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-2 py-1 text-left text-xs transition-colors hover:bg-muted/50"
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: `hsl(${hue} 80% 55%)` }}
      />
      <span className="min-w-0 flex-1 truncate text-foreground">
        {event.title}
      </span>
      <span className="shrink-0 text-muted-foreground">
        {formatEventTime(event)}
      </span>
    </button>
  );
}

function EventRow({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  const hue = getCalendarEventTone(event);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/50"
    >
      <span
        className="mt-1 size-2.5 rounded-full"
        style={{ backgroundColor: `hsl(${hue} 80% 55%)` }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{event.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatEventTime(event)}
            </p>
          </div>
          <Badge
            variant="outline"
            className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.18em]"
          >
            {event.courseId ?? "Personal"}
          </Badge>
        </div>
        {event.location ? (
          <p className="mt-2 text-xs text-muted-foreground">{event.location}</p>
        ) : null}
      </div>
    </button>
  );
}

function EventEditorDialog({
  open,
  title,
  description,
  draft,
  saving,
  onChange,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  title: string;
  description: string;
  draft: CalendarEventDraft;
  saving: boolean;
  onChange: (draft: CalendarEventDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium text-foreground">Title</span>
            <Input
              value={draft.title}
              onChange={(event) =>
                onChange({ ...draft, title: event.target.value })
              }
              placeholder="Study group"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Course</span>
            <Input
              value={draft.courseId}
              onChange={(event) =>
                onChange({ ...draft, courseId: event.target.value })
              }
              placeholder="CS 101"
            />
          </label>

          <label className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 sm:items-end">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(event) =>
                onChange({ ...draft, allDay: event.target.checked })
              }
            />
            <span className="text-sm font-medium text-foreground">All day</span>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Start date
            </span>
            <Input
              type="date"
              value={draft.startDate}
              onChange={(event) =>
                onChange({ ...draft, startDate: event.target.value })
              }
            />
          </label>

          {!draft.allDay ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Start time
              </span>
              <Input
                type="time"
                value={draft.startTime}
                onChange={(event) =>
                  onChange({ ...draft, startTime: event.target.value })
                }
              />
            </label>
          ) : null}

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              End date
            </span>
            <Input
              type="date"
              value={draft.endDate}
              onChange={(event) =>
                onChange({ ...draft, endDate: event.target.value })
              }
            />
          </label>

          {!draft.allDay ? (
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                End time
              </span>
              <Input
                type="time"
                value={draft.endTime}
                onChange={(event) =>
                  onChange({ ...draft, endTime: event.target.value })
                }
              />
            </label>
          ) : null}

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium text-foreground">
              Location
            </span>
            <Input
              value={draft.location}
              onChange={(event) =>
                onChange({ ...draft, location: event.target.value })
              }
              placeholder="Library room / Zoom / Classroom"
            />
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium text-foreground">Notes</span>
            <Textarea
              value={draft.notes}
              onChange={(event) =>
                onChange({ ...draft, notes: event.target.value })
              }
              placeholder="Reading list, prep notes, or reminders"
              rows={4}
            />
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {onDelete ? (
            <Button variant="destructive" onClick={onDelete} disabled={saving}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          ) : null}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={saving || !draft.title.trim()}>
              <Pencil className="size-3.5" />
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
