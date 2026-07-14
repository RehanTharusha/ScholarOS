"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, FileText, FolderOpen, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StagedFile = {
  sourcePath: string;
  targetPath: string;
  name: string;
  size?: number;
  sourceFolder?: string;
};

type Course = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

interface IngestStageRailProps {
  stagedFiles: StagedFile[];
  isStaging: boolean;
  isProcessing: boolean;
  isIngesting: boolean;
  onStageFiles: (files: FileList | File[]) => Promise<void>;
  onStageFolders: (paths: string[]) => Promise<void>;
  onRemoveFile: (file: StagedFile) => void;
  onStartIngest: () => void;
  onOpenFilePicker: () => void;
  onCourseContextChange?: (
    courseName?: string,
    semester?: string,
    topicHint?: string,
  ) => void;
}

export function IngestStageRail({
  stagedFiles,
  isStaging,
  isProcessing,
  isIngesting,
  onStageFiles,
  onStageFolders,
  onRemoveFile,
  onStartIngest,
  onOpenFilePicker,
  onCourseContextChange,
}: IngestStageRailProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [newCourseName, setNewCourseName] = useState("");
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [semester, setSemester] = useState("");
  const [topicHint, setTopicHint] = useState("");
  const [watchingRaw, setWatchingRaw] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  // Load existing courses from quick-access.json on mount
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const raw = await window.ipc.invoke("workspace:readFile", {
          path: ".scholar/quick-access.json",
          encoding: "utf-8",
        });
        if (raw?.content) {
          const parsed = JSON.parse(raw.content);
          if (Array.isArray(parsed.items)) {
            setCourses(
              parsed.items
                .filter((i: { type: string }) => i.type === "course")
                .map((i: { id: string; name: string; color: string; createdAt: string }) => ({
                  id: i.id,
                  name: i.name,
                  color: i.color || "#3B82F6",
                  createdAt: i.createdAt,
                })),
            );
          }
        }
      } catch {
        // File doesn't exist yet — that's fine
      }
    };
    loadCourses();
  }, []);

  const handleCourseSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.currentTarget.value;
      if (val === "__new__") {
        setIsCreatingCourse(true);
        setSelectedCourseId("");
        setNewCourseName("");
      } else {
        setSelectedCourseId(val);
        setIsCreatingCourse(false);
      }
    },
    [],
  );

  const handleCreateCourse = useCallback(async () => {
    const name = newCourseName.trim();
    if (!name) return;
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      name,
      color: "#3B82F6",
      createdAt: new Date().toISOString(),
    };
    const updated = [...courses, newCourse];
    try {
      // Read existing quick-access items, append as a course type
      let items: Record<string, unknown>[] = [];
      try {
        const raw = await window.ipc.invoke("workspace:readFile", {
          path: ".scholar/quick-access.json",
          encoding: "utf-8",
        });
        if (raw?.content) {
          const parsed = JSON.parse(raw.content);
          if (Array.isArray(parsed.items)) items = parsed.items;
        }
      } catch {
        // File doesn't exist yet
      }
      const nextOrder =
        items.length > 0
          ? Math.max(...items.map((i: { order?: number }) => i.order ?? 0)) + 1
          : 0;
      items.push({
        id: newCourse.id,
        type: "course",
        name: newCourse.name,
        path: `courses/${newCourse.name}`,
        customName: null,
        color: newCourse.color,
        createdAt: newCourse.createdAt,
        order: nextOrder,
      });
      await window.ipc.invoke("workspace:writeFile", {
        path: ".scholar/quick-access.json",
        data: JSON.stringify({ items }, null, 2),
      });
      setCourses(updated);
      setSelectedCourseId(newCourse.id);
      setIsCreatingCourse(false);
      setNewCourseName("");
      toast.success(`Created course "${name}"`);
    } catch {
      toast.error("Failed to save course");
    }
  }, [newCourseName, courses]);

  const handlePickFolder = useCallback(async () => {
    setIsPickingFolder(true);
    try {
      const result = await window.ipc.invoke("ingest:pickFolder", null);
      if (!result.cancelled && result.paths.length > 0) {
        await onStageFolders(result.paths);
      }
    } catch {
      toast.error("Failed to pick folder");
    } finally {
      setIsPickingFolder(false);
    }
  }, [onStageFolders]);

  const handleWatchToggle = useCallback(async (enabled: boolean) => {
    try {
      await window.ipc.invoke("ingest:watchRaw", { enabled });
      setWatchingRaw(enabled);
      if (enabled) {
        toast.success("Watching raw/ for new files");
      }
    } catch {
      toast.error("Failed to toggle raw watcher");
    }
  }, []);

  // Sync course context upward whenever it changes
  useEffect(() => {
    const course = courses.find((c) => c.id === selectedCourseId);
    const name = isCreatingCourse ? newCourseName : course?.name;
    onCourseContextChange?.(name, semester || undefined, topicHint || undefined);
  }, [selectedCourseId, newCourseName, isCreatingCourse, semester, topicHint, courses, onCourseContextChange]);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const courseName = selectedCourse?.name || newCourseName;

  const hasStagedFiles = stagedFiles.length > 0;

  return (
    <div className="space-y-4">
      {/* Course Context Form */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-foreground">
          Course Context
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Course
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
              value={selectedCourseId}
              onChange={handleCourseSelect}
            >
              <option value="">— Auto-detect —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new__">+ New course...</option>
            </select>
          </div>

          {isCreatingCourse && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Course name"
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCourse();
                }}
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCreateCourse}
                disabled={!newCourseName.trim()}
              >
                Create
              </Button>
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">
                Semester
              </label>
              <Input
                placeholder="e.g. Fall 2025"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">
                Topic hint
              </label>
              <Input
                placeholder="e.g. Cell Biology"
                value={topicHint}
                onChange={(e) => setTopicHint(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Staged Files */}
      {hasStagedFiles && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-foreground">
            Staged Files ({stagedFiles.length})
          </p>
          <div className="space-y-2">
            {stagedFiles.map((file, index) => (
              <div
                key={`${file.sourcePath}-${file.targetPath}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {file.name}
                  </p>
                  {file.sourceFolder && (
                    <Badge variant="secondary" className="mt-0.5 text-[10px]">
                      {file.sourceFolder}
                    </Badge>
                  )}
                </div>
                {file.size ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                ) : null}
                <button
                  className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRemoveFile(file)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Files / Add Folder Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenFilePicker}
          disabled={isStaging || isIngesting}
          className="gap-1.5"
        >
          {isStaging ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <BookOpen className="size-3.5" />
          )}
          Add files
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePickFolder}
          disabled={isPickingFolder || isIngesting}
          className="gap-1.5"
        >
          {isPickingFolder ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FolderOpen className="size-3.5" />
          )}
          Add folder
        </Button>
      </div>

      {/* Raw Watch Toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-medium text-foreground">Watch raw/</p>
          <p className="text-xs text-muted-foreground">
            Auto-detect files dropped into raw/ from outside
          </p>
        </div>
        <button
          role="switch"
          aria-checked={watchingRaw}
          onClick={() => handleWatchToggle(!watchingRaw)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            watchingRaw ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
              watchingRaw ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>
      </div>

      {/* Action Area */}
      {hasStagedFiles && (
        <div className="flex flex-col items-center gap-3">
          <Button
            size="lg"
            onClick={onStartIngest}
            disabled={isProcessing || stagedFiles.length === 0}
            className="gap-2 px-8"
          >
            {isProcessing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Ingest {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default IngestStageRail;
