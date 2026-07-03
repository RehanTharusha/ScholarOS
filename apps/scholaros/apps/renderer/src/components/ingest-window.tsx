"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  Loader2,
  Sparkles,
  X,
  FileText,
  Search,
  Network,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  AcademicPageHeader,
  AcademicPageShell,
} from "@/components/academic/academic-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type StagedFile = {
  sourcePath: string;
  targetPath: string;
  name: string;
  size?: number;
};

type QueueItemStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

type QueueItem = {
  id: string;
  sourcePath: string;
  fileName: string;
  status: QueueItemStatus;
  progress: number;
  stage: string;
  error?: string;
};

type ProgressEvent = {
  itemId: string;
  progress: number;
  stage: string;
  fileName: string;
};

interface IngestWindowProps {
  onProcessIngest?: () => void;
  isProcessing?: boolean;
  currentProcessingFile?: string;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  extracting: "Extracting text…",
  analyzing: "Analyzing content…",
  generating: "Generating wiki pages…",
  writing: "Writing pages…",
  "extracting reviews": "Extracting review items…",
  embedding: "Embedding for search…",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STAGE_COLORS: Record<string, string> = {
  extracting: "bg-blue-500",
  analyzing: "bg-violet-500",
  generating: "bg-amber-500",
  writing: "bg-emerald-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

function StageBadge({ stage }: { stage: string }) {
  const label = STAGE_LABELS[stage] || stage;
  const color = STAGE_COLORS[stage] || "bg-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white",
        color,
      )}
    >
      {label}
    </span>
  );
}

export function IngestWindow({
  onProcessIngest,
  isProcessing,
  currentProcessingFile,
}: IngestWindowProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isPipelineProcessing, setIsPipelineProcessing] = useState(false);

  useEffect(() => {
    window.ipc.invoke("workspace:getRoot", null).then(({ root }) => {
      setWorkspaceRoot(root || null);
    });
  }, []);

  useEffect(() => {
    const cleanup = window.ipc.on("ingest:progress", (event: unknown) => {
      const ev = event as ProgressEvent;
      setQueueItems((prev) =>
        prev.map((item) =>
          item.id === ev.itemId
            ? { ...item, progress: ev.progress, stage: ev.stage }
            : item,
        ),
      );
    });
    return cleanup;
  }, []);

  const stageFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const paths = fileArray
      .map((file) => window.electronUtils?.getPathForFile(file))
      .filter(Boolean) as string[];

    if (paths.length === 0) {
      toast.error("No file paths were available for the dropped materials.");
      return;
    }

    setIsStaging(true);
    setErrors([]);

    try {
      const result = await window.ipc.invoke("ingest:addFiles", {
        files: paths,
      });

      setStagedFiles((prev) => [...result.stagedFiles, ...prev]);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        toast.warning("Some files could not be staged.");
      } else {
        toast.success(
          `Added ${result.stagedFiles.length} file(s) for processing.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors([message]);
      toast.error("Failed to add files for processing.");
    } finally {
      setIsStaging(false);
    }
  }, []);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
        setIsDragging(true);
      }
    };

    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) {
        setIsDragging(false);
      }
    };

    const onDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
        setIsDragging(false);
      }
      if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
        void stageFiles(event.dataTransfer.files);
      }
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [stageFiles]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePipelineProcess = useCallback(async () => {
    if (stagedFiles.length === 0) return;

    setIsPipelineProcessing(true);
    setErrors([]);

    try {
      const result = await window.ipc.invoke("ingest:enqueue", {
        files: stagedFiles.map((f) => f.targetPath),
        courseId: "default",
        courseCode: undefined,
        semester: undefined,
      });

      setQueueItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newItems = result.items.filter((i) => !existingIds.has(i.id));
        return [
          ...prev.map((p) => {
            const updated = result.items.find((r) => r.id === p.id);
            return updated || p;
          }),
          ...newItems.map((i) => ({
            id: i.id,
            sourcePath: i.sourcePath,
            fileName: i.fileName,
            status: i.status as QueueItemStatus,
            progress: i.progress,
            stage: i.stage,
            error: i.error,
          })),
        ];
      });

      toast.success(`Queued ${result.items.length} file(s) for processing.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors([message]);
      toast.error("Failed to queue files for processing.");
    } finally {
      setIsPipelineProcessing(false);
    }
  }, [stagedFiles]);

  const handleRemoveFile = useCallback(
    (file: StagedFile) => {
      setStagedFiles((prev) => prev.filter((f) => f.sourcePath !== file.sourcePath));
      toast.info(`Removed ${file.name}`);
    },
    [],
  );

  const handleCancelItem = useCallback(async (itemId: string) => {
    try {
      await window.ipc.invoke("ingest:cancel", { itemId });
    } catch {
      // ignore
    }
  }, []);

  const hasStagedFiles = stagedFiles.length > 0;
  const hasQueueItems = queueItems.length > 0;
  const activeItems = queueItems.filter(
    (i) => i.status !== "completed" && i.status !== "cancelled",
  );
  const completedCount = queueItems.filter((i) => i.status === "completed").length;
  const failedCount = queueItems.filter((i) => i.status === "failed").length;

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="Knowledge Base"
        title="Build Your Wiki"
        description="Drop your course materials — PDFs, slides, notes, images. AI reads them, extracts key concepts, and builds a linked knowledge wiki you can search and explore."
      />

      <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-6 py-5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.currentTarget.files) {
              void stageFiles(event.currentTarget.files);
            }
            event.currentTarget.value = "";
          }}
        />

        {/* Drop Zone */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={cn(
            "relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200",
            isDragging
              ? "scale-[1.02] border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30 hover:bg-muted/10",
          )}
          onClick={!isStaging ? openFilePicker : undefined}
        >
          {isStaging ? (
            <Loader2 className="size-10 animate-spin text-muted-foreground" />
          ) : (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="flex size-14 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm"
            >
              <BookOpen className="size-6" />
            </motion.div>
          )}
          <h3 className="mt-5 text-lg font-semibold text-foreground">
            {isDragging
              ? "Release to add files"
              : isStaging
                ? "Adding files..."
                : "Drop files here"}
          </h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {isDragging
              ? "Drop anywhere to start adding"
              : "or click to browse"}
          </p>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Brain className="size-4.5" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">AI Analysis</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Extracts concepts and connections
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Network className="size-4.5" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Knowledge Graph
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Links related topics together
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Search className="size-4.5" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Searchable Wiki
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Find anything instantly
              </p>
            </div>
          </div>
        </motion.div>

        {/* Staged Files */}
        <AnimatePresence mode="wait">
          {hasStagedFiles ? (
            <motion.div
              key="staged-files"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {/* File List */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="mb-3 text-sm font-semibold text-foreground">
                  Staged Files
                </p>
                <div className="space-y-2">
                  {stagedFiles.map((file, index) => (
                    <motion.div
                      key={`${file.sourcePath}-${file.targetPath}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.2 }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {file.name}
                        </p>
                      </div>
                      {file.size ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                      ) : null}
                      <button
                        className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemoveFile(file)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Action Area */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-3">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.2 }}
                  >
                    <Button
                      size="lg"
                      onClick={onProcessIngest}
                      disabled={isProcessing || !onProcessIngest}
                      className="gap-2 px-8"
                    >
                      {isProcessing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      Process Files
                    </Button>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, duration: 0.2 }}
                  >
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handlePipelineProcess}
                      disabled={isPipelineProcessing}
                      className="gap-2 px-8"
                    >
                      {isPipelineProcessing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Brain className="size-4" />
                      )}
                      Wiki Pipeline
                    </Button>
                  </motion.div>
                </div>
                {!isProcessing && !isPipelineProcessing && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.2 }}
                    className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
                    onClick={openFilePicker}
                  >
                    Or drop more files
                  </motion.p>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Processing State (agent path) */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-8"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="flex size-12 items-center justify-center rounded-full bg-primary/10"
              >
                <Sparkles className="size-6 text-primary" />
              </motion.div>
              <div className="text-center">
                <p className="text-base font-medium text-foreground">
                  Analyzing your materials...
                </p>
                {currentProcessingFile && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Processing: {currentProcessingFile}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pipeline Progress */}
        <AnimatePresence>
          {hasQueueItems && (
            <motion.div
              key="pipeline-progress"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  Pipeline Progress
                </p>
                <p className="text-xs text-muted-foreground">
                  {completedCount} done
                  {failedCount > 0 ? ` · ${failedCount} failed` : ""}
                  {activeItems.length > 0
                    ? ` · ${activeItems.length} active`
                    : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="space-y-3">
                  {queueItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/20 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.fileName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StageBadge stage={item.stage} />
                          {item.status === "queued" && (
                            <button
                              className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleCancelItem(item.id)}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${item.progress}%`,
                            }}
                            transition={{ duration: 0.3 }}
                            className={cn(
                              "h-full rounded-full",
                              item.status === "failed"
                                ? "bg-destructive"
                                : item.status === "completed"
                                  ? "bg-green-500"
                                  : "bg-primary",
                            )}
                          />
                        </div>
                        <span className="w-8 text-right text-[10px] text-muted-foreground">
                          {item.progress}%
                        </span>
                      </div>
                      {item.error && (
                        <p className="text-xs text-destructive">
                          {item.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Errors */}
        <AnimatePresence>
          {errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive"
            >
              <p className="text-sm font-medium">Some files failed to add</p>
              <ul className="mt-2 space-y-1 text-sm">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <div className="border-t border-border/70 bg-background/95 px-6 py-3">
        <p className="text-center text-xs text-muted-foreground">
          Files are processed locally. Your data stays on your machine.
        </p>
      </div>
    </AcademicPageShell>
  );
}

export default IngestWindow;
