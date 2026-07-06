"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  AcademicPageHeader,
  AcademicPageShell,
} from "@/components/academic/academic-shell";
import { useIngestActivity } from "@/hooks/use-ingest-activity";
import { IngestActivity } from "@/components/ingest/ingest-activity";
import { IngestModeToggle } from "@/components/ingest/ingest-mode-toggle";
import { IngestApproveConcepts } from "@/components/ingest/ingest-approve-concepts";
import { IngestStageRail } from "@/components/ingest/ingest-stage-rail";
import { IngestEmptyState } from "@/components/ingest/ingest-empty-state";
import { toast } from "sonner";

type StagedFile = {
  sourcePath: string;
  targetPath: string;
  name: string;
  size?: number;
  sourceFolder?: string;
};

interface IngestWindowProps {
  onProcessIngest?: (
    targets: string[],
    ingestMode?: "guided" | "autonomous",
    courseName?: string,
    semester?: string,
    topicHint?: string,
  ) => void;
  activeRunId?: string;
  onOpenPage?: (path: string) => void;
}

export function IngestWindow({
  onProcessIngest,
  activeRunId,
  onOpenPage,
}: IngestWindowProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const lastStagedRef = useRef<string[]>([]);

  const [ingestMode, setIngestMode] = useState<"guided" | "autonomous">("autonomous");
  const courseNameRef = useRef<string | undefined>(undefined);
  const semesterRef = useRef<string | undefined>(undefined);
  const topicHintRef = useRef<string | undefined>(undefined);
  const lastIngestModeRef = useRef<"guided" | "autonomous">("autonomous");

  const { activities, phase, error: ingestError, pendingAskHuman } = useIngestActivity(activeRunId);

  const isIngesting = phase === "ingesting" || phase === "paused";
  const isDone = phase === "done" && activities.length > 0;
  const isPausedForReview = phase === "paused" && !!pendingAskHuman;
  const [acknowledgedDone, setAcknowledgedDone] = useState(false);

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

  const stageFolders = useCallback(async (folderPaths: string[]) => {
    if (folderPaths.length === 0) return;

    setIsStaging(true);
    setErrors([]);

    try {
      const result = await window.ipc.invoke("ingest:addFiles", {
        files: [],
        folders: folderPaths,
      });

      setStagedFiles((prev) => [...result.stagedFiles, ...prev]);
      if (result.errors.length > 0) {
        setErrors(result.errors);
        toast.warning("Some files could not be staged.");
      } else {
        toast.success(
          `Added ${result.stagedFiles.length} file(s) from folder(s).`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors([message]);
      toast.error("Failed to add files from folder.");
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

  // Listen for raw file events from the auto-watcher
  useEffect(() => {
    const cleanup = window.ipc.on("ingest:rawFileEvent", (event: unknown) => {
      const ev = event as { files: StagedFile[] };
      if (ev.files && ev.files.length > 0) {
        setStagedFiles((prev) => [...ev.files, ...prev]);
        toast.info(`Auto-detected ${ev.files.length} new file(s) in raw/.`);
      }
    });
    return cleanup;
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemoveFile = useCallback(
    (file: StagedFile) => {
      setStagedFiles((prev) => prev.filter((f) => f.sourcePath !== file.sourcePath));
      toast.info(`Removed ${file.name}`);
    },
    [],
  );

  const hasStagedFiles = stagedFiles.length > 0;

  const handleCourseContextChange = useCallback(
    (courseName?: string, semester?: string, topicHint?: string) => {
      courseNameRef.current = courseName;
      semesterRef.current = semester;
      topicHintRef.current = topicHint;
    },
    [],
  );

  const handleStartIngest = useCallback(() => {
    if (stagedFiles.length === 0 || !onProcessIngest) return;
    const targets = stagedFiles.map((f) => f.targetPath);
    lastStagedRef.current = targets;
    lastIngestModeRef.current = ingestMode;
    setAcknowledgedDone(false);
    onProcessIngest(
      targets,
      ingestMode,
      courseNameRef.current,
      semesterRef.current,
      topicHintRef.current,
    );
  }, [stagedFiles, onProcessIngest, ingestMode]);

  const handleAskHumanResponse = useCallback(
    async (toolCallId: string, response: string) => {
      try {
        await window.ipc.invoke("runs:provideHumanInput", {
          toolCallId,
          subflow: [],
          response,
        });
      } catch {
        toast.error("Failed to send response to agent.");
      }
    },
    [],
  );

  const handleRetry = useCallback(() => {
    if (lastStagedRef.current.length > 0 && onProcessIngest) {
      onProcessIngest(
        lastStagedRef.current,
        lastIngestModeRef.current,
        courseNameRef.current,
        semesterRef.current,
        topicHintRef.current,
      );
    } else if (stagedFiles.length > 0 && onProcessIngest) {
      const targets = stagedFiles.map((f) => f.targetPath);
      lastStagedRef.current = targets;
      lastIngestModeRef.current = ingestMode;
      onProcessIngest(
        targets,
        ingestMode,
        courseNameRef.current,
        semesterRef.current,
        topicHintRef.current,
      );
    }
  }, [stagedFiles, onProcessIngest, ingestMode]);

  const handleIngestMore = useCallback(() => {
    setAcknowledgedDone(true);
    setStagedFiles([]);
    setErrors([]);
    toast.info("Add more files to ingest.");
  }, []);

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="Knowledge Base"
        title="Build Your Wiki"
        description="Drop your course materials — PDFs, slides, notes, images. AI reads them, extracts key concepts, and builds a linked knowledge wiki you can search and explore."
        actions={
          <IngestModeToggle value={ingestMode} onChange={setIngestMode} />
        }
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

        {/* Drop Zone + Stage Rail (hidden during active ingest, shown after acknowledging done) */}
        {!isIngesting && (!isDone || acknowledgedDone) && (
          <>
            {/* Drop Zone */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={
                "relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200 " +
                (isDragging
                  ? "scale-[1.02] border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/10")
              }
              onClick={!isStaging ? openFilePicker : undefined}
            >
              {isStaging ? (
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              ) : (
                <div className="flex flex-col items-center">
                  <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
                    <svg
                      className="size-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {isDragging
                      ? "Release to add files"
                      : "Drop files here"}
                  </h3>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {isDragging
                      ? "Drop anywhere to start adding"
                      : "or click to browse"}
                  </p>
                </div>
              )}
            </motion.div>

            {/* Stage Rail */}
            <IngestStageRail
              stagedFiles={stagedFiles}
              isStaging={isStaging}
              isProcessing={false}
              isIngesting={isIngesting}
              onStageFiles={stageFiles}
              onStageFolders={stageFolders}
              onRemoveFile={handleRemoveFile}
              onStartIngest={handleStartIngest}
              onOpenFilePicker={openFilePicker}
              onCourseContextChange={handleCourseContextChange}
            />
          </>
        )}

        {/* Empty State (onboarding for first-run, simple otherwise) */}
        {!hasStagedFiles && !isIngesting && !isStaging && !isDone && (
          <IngestEmptyState onOpenFilePicker={openFilePicker} />
        )}

        {/* Approve Concepts Card (paused for review) */}
        {isPausedForReview && pendingAskHuman && (
          <IngestApproveConcepts
            toolCallId={pendingAskHuman.toolCallId}
            query={pendingAskHuman.query}
            onResponse={handleAskHumanResponse}
          />
        )}

        {/* Activity Panel */}
        {(isIngesting || (phase === "done" && !acknowledgedDone) || ingestError) && (
          <IngestActivity
            activities={activities}
            phase={phase}
            error={ingestError}
            onOpenPage={onOpenPage}
            onRetry={handleRetry}
            onIngestMore={handleIngestMore}
          />
        )}

        {/* Errors */}
        <AnimatePresence>
          {errors.length > 0 && !isIngesting && (
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
