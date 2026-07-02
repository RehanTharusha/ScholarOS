import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  ExternalLink,
  Check,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AcademicPageShell,
  AcademicPageHeader,
  AcademicEmptyState,
} from "@/components/academic/academic-shell";

type Task = {
  id: string;
  title: string;
  due: string;
  dueTime?: string;
  type: "manual" | "assignment" | "lecture" | "deadline" | "custom";
  status: "pending" | "done";
  source?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const TYPE_COLORS: Record<Task["type"], string> = {
  manual: "bg-green-500",
  assignment: "bg-red-500",
  lecture: "bg-blue-500",
  deadline: "bg-orange-500",
  custom: "bg-purple-500",
};

const TYPE_LABELS: Record<Task["type"], string> = {
  manual: "Manual",
  assignment: "Assignment",
  lecture: "Lecture",
  deadline: "Deadline",
  custom: "Custom",
};

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type CalendarViewProps = {
  onSelectFile?: (path: string) => void;
};

export function CalendarView({ onSelectFile }: CalendarViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    due: "",
    dueTime: "",
    type: "manual" as Task["type"],
    description: "",
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.ipc.invoke("calendar:list", null);
      const taskList = Array.isArray(result.tasks) ? result.tasks : [];
      setTasks(taskList);
    } catch (err) {
      console.error("Failed to load tasks:", err);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const existing = map.get(task.due) || [];
      existing.push(task);
      map.set(task.due, existing);
    }
    return map;
  }, [tasks]);

  const selectedTasks = selectedDate ? tasksByDate.get(selectedDate) || [] : [];

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [firstDay, daysInMonth]);

  const today = new Date();
  const todayKey = formatDateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.due) return;
    try {
      await window.ipc.invoke("calendar:create", {
        title: newTask.title,
        due: newTask.due,
        dueTime: newTask.dueTime || undefined,
        type: newTask.type,
        description: newTask.description || undefined,
      });
      setIsCreateOpen(false);
      setNewTask({
        title: "",
        due: "",
        dueTime: "",
        type: "manual",
        description: "",
      });
      await loadTasks();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      await window.ipc.invoke("calendar:complete", { id });
      await loadTasks();
    } catch (err) {
      console.error("Failed to complete task:", err);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await window.ipc.invoke("calendar:delete", { id });
      await loadTasks();
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const openCreateForDate = (dateStr: string) => {
    setNewTask((prev) => ({ ...prev, due: dateStr }));
    setIsCreateOpen(true);
  };

  const upcomingTasks = useMemo(() => {
    const now = todayKey;
    return tasks
      .filter((t) => t.due >= now && t.status === "pending")
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 8);
  }, [tasks, todayKey]);

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="Calendar"
        title={`${MONTHS[month]} ${year}`}
        description={`${pendingCount} pending · ${doneCount} done`}
        actions={
          <Button
            size="sm"
            onClick={() => openCreateForDate(todayKey)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add Task
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Calendar Grid */}
        <div className="flex flex-1 flex-col overflow-auto p-4 lg:border-r lg:border-border/70">
          {/* Month Navigation */}
          <div className="mb-4 flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-medium text-foreground">
              {MONTHS[month]} {year}
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Day Headers */}
          <div className="mb-1 grid grid-cols-7 gap-px">
            {DAYS_SHORT.map((day) => (
              <div
                key={day}
                className="py-1 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border/50 overflow-hidden">
            {calendarDays.map((day, i) => {
              if (day === null) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="bg-background min-h-[72px]"
                  />
                );
              }

              const dateStr = formatDateKey(year, month, day);
              const dayTasks = tasksByDate.get(dateStr) || [];
              const pendingDayTasks = dayTasks.filter(
                (t) => t.status === "pending",
              );
              const isToday = dateStr === todayKey;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={cn(
                    "relative min-h-[72px] bg-background p-1 text-left transition-colors hover:bg-accent/50",
                    isSelected && "bg-accent ring-2 ring-primary/30",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday && "bg-primary text-primary-foreground",
                      !isToday && "text-foreground",
                    )}
                  >
                    {day}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {pendingDayTasks.slice(0, 3).map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[10px] font-medium text-white",
                          TYPE_COLORS[task.type],
                        )}
                      >
                        {task.title}
                      </div>
                    ))}
                    {pendingDayTasks.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{pendingDayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar: Selected Date Tasks + Upcoming */}
        <div className="w-full overflow-auto p-4 lg:w-80">
          {selectedDate ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {new Date(selectedDate + "T00:00:00").toLocaleDateString(
                    "en-US",
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    },
                  )}
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => openCreateForDate(selectedDate)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              {selectedTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tasks on this day.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={handleCompleteTask}
                      onDelete={handleDeleteTask}
                      onSelectFile={onSelectFile}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                Upcoming
              </h3>
              {upcomingTasks.length === 0 ? (
                <AcademicEmptyState
                  title="No upcoming tasks"
                  description="Add deadlines, assignments, or lectures to track them here."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCreateForDate(todayKey)}
                    >
                      <Plus className="mr-1 size-3.5" />
                      Add Task
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {upcomingTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={handleCompleteTask}
                      onDelete={handleDeleteTask}
                      onSelectFile={onSelectFile}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Task Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>
              Create a new task to track on your calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Title
              </label>
              <Input
                placeholder="Assignment, exam, lecture..."
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Due date
                </label>
                <Input
                  type="date"
                  value={newTask.due}
                  onChange={(e) =>
                    setNewTask((prev) => ({ ...prev, due: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Time (optional)
                </label>
                <Input
                  type="time"
                  value={newTask.dueTime}
                  onChange={(e) =>
                    setNewTask((prev) => ({ ...prev, dueTime: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Type
              </label>
              <Select
                value={newTask.type}
                onValueChange={(val) =>
                  setNewTask((prev) => ({
                    ...prev,
                    type: val as Task["type"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            TYPE_COLORS[key as Task["type"]],
                          )}
                        />
                        {label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Description (optional)
              </label>
              <Input
                placeholder="Additional details..."
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={!newTask.title || !newTask.due}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AcademicPageShell>
  );
}

function TaskCard({
  task,
  onComplete,
  onDelete,
  onSelectFile,
}: {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onSelectFile?: (path: string) => void;
}) {
  const isDone = task.status === "done";
  const daysUntil = Math.ceil(
    (new Date(task.due).getTime() - Date.now()) / 86400000,
  );

  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-accent/30",
        isDone && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => !isDone && onComplete(task.id)}
              className="shrink-0"
            >
              {isDone ? (
                <Check className="size-4 text-green-500" />
              ) : (
                <Circle className="size-4 text-muted-foreground/50 hover:text-primary" />
              )}
            </button>
            <span
              className={cn(
                "truncate text-sm font-medium",
                isDone
                  ? "text-muted-foreground line-through"
                  : "text-foreground",
              )}
            >
              {task.title}
            </span>
          </div>
          <div className="mt-1 ml-6 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {new Date(task.due + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
            {task.dueTime && <span>at {task.dueTime}</span>}
            {!isDone && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  daysUntil <= 0
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : daysUntil <= 3
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {daysUntil < 0
                  ? `${Math.abs(daysUntil)}d ago`
                  : daysUntil === 0
                    ? "Today"
                    : daysUntil === 1
                      ? "Tomorrow"
                      : `${daysUntil}d`}
              </span>
            )}
            {isDone && (
              <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Done
              </span>
            )}
          </div>
          {task.source && (
            <button
              type="button"
              onClick={() => onSelectFile?.(task.source!)}
              className="mt-1.5 ml-6 flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-primary"
            >
              <ExternalLink className="size-3" />
              {task.source}
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 opacity-0 group-hover:opacity-100"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="size-3.5 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
