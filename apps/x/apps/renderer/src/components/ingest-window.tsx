"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpFromLine,
  FolderOpen,
  Inbox,
  Loader2,
  Upload,
  Play,
} from "lucide-react";
import {
  AcademicCard,
  AcademicPageHeader,
  AcademicPageShell,
} from "@/components/academic/academic-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type StagedFile = {
  sourcePath: string;
  targetPath: string;
  name: string;
};

interface IngestWindowProps {
  onProcessIngest?: () => void;
  isProcessing?: boolean;
}

export function IngestWindow({
  onProcessIngest,
  isProcessing,
}: IngestWindowProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const rawPath = useMemo(() => {
    if (!workspaceRoot) return null;
    return `${workspaceRoot.replace(/\/+$/, "")}/raw`;
  }, [workspaceRoot]);

  useEffect(() => {
    window.ipc.invoke("workspace:getRoot", null).then(({ root }) => {
      setWorkspaceRoot(root || null);
    });
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
          `Staged ${result.stagedFiles.length} file(s) into raw/ folder.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors([message]);
      toast.error("Failed to stage files for ingestion.");
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

  const openRawFolder = useCallback(() => {
    if (!rawPath) return;
    void window.ipc.invoke("shell:openPath", { path: rawPath });
  }, [rawPath]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const hasStagedFiles = stagedFiles.length > 0;

  return (
    <AcademicPageShell>
      <Toaster richColors position="top-right" />
      <AcademicPageHeader
        eyebrow="Ingestion"
        title="Drop materials for import"
        description="Drag PDFs, slides, images, and notes here. Files are copied into the raw/ folder and processed by the AI agent."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={openRawFolder}
              disabled={!rawPath}
            >
              <FolderOpen className="mr-2 size-4" />
              Open raw folder
            </Button>
            <Button size="sm" onClick={openFilePicker}>
              <Upload className="mr-2 size-4" />
              Choose files
            </Button>
          </>
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

        <AcademicCard className="p-0">
          <div
            className={cn(
              "flex min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/20",
            )}
          >
            <div className="flex size-14 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
              {isStaging ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <Inbox className="size-6" />
              )}
            </div>
            <h3 className="mt-5 text-lg font-semibold text-foreground">
              {isDragging ? "Release to stage files" : "Drop files here"}
            </h3>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {isStaging
                ? "Copying files into the raw/ folder..."
                : "Accepts PDFs, slides, notes, images, and other course materials."}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline">Staged folder: raw/</Badge>
              <Badge variant="outline">Drag and drop</Badge>
              <Badge variant="outline">Any file type</Badge>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={openRawFolder}
                disabled={!rawPath}
              >
                <FolderOpen className="mr-2 size-4" />
                Open raw folder
              </Button>
              <Button variant="secondary" onClick={openFilePicker}>
                <ArrowUpFromLine className="mr-2 size-4" />
                Select files
              </Button>
            </div>
            <p className="mt-5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Drop files anywhere in this area
            </p>
          </div>
        </AcademicCard>

        {/* Process Button - triggers agent with "ingest" command */}
        {hasStagedFiles && (
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div>
              <h4 className="text-sm font-medium text-foreground">
                Ready to process {stagedFiles.length} file(s)
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                This will open a new chat and tell the agent to ingest these
                files.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setStagedFiles([]);
                  toast.info("Cleared staged files.");
                }}
                variant="outline"
                size="sm"
              >
                Clear
              </Button>
              <Button
                onClick={onProcessIngest}
                disabled={isProcessing || !onProcessIngest}
                className="gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Process with Agent
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Files staged
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-2xl font-semibold text-foreground">
                {stagedFiles.length}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">ready</span>
            </div>
          </div>
        </div>

        <AcademicCard>
          <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Queue
              </p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                Staged materials
              </h3>
            </div>
            <Badge variant="secondary">{stagedFiles.length} items</Badge>
          </div>

          <div className="mt-4 space-y-2">
            {stagedFiles.length > 0 ? (
              stagedFiles.map((file) => (
                <div
                  key={`${file.sourcePath}-${file.targetPath}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {file.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {file.sourcePath}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">Copied</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setStagedFiles((prev) =>
                          prev.filter((f) => f.sourcePath !== file.sourcePath),
                        );
                        toast.info(`Removed ${file.name}`);
                      }}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
                <p className="text-base font-medium text-foreground">
                  No files staged yet
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Drop something in the window or choose files from disk to
                  start staging.
                </p>
              </div>
            )}
          </div>
        </AcademicCard>

        {errors.length > 0 ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <p className="text-sm font-medium">Some files failed to stage</p>
            <ul className="mt-2 space-y-1 text-sm">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </main>
    </AcademicPageShell>
  );
}

export default IngestWindow;
