"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Inbox,
  Loader2,
  Play,
  Upload,
  X,
  FileText,
} from "lucide-react";
import {
  AcademicPageHeader,
  AcademicPageShell,
} from "@/components/academic/academic-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      <AcademicPageHeader
        eyebrow="Ingestion"
        title="Import materials"
        description="Drop PDFs, slides, images, and notes. Files copy to raw/ and AI processes them."
        actions={
          <Button variant="outline" size="sm" onClick={openRawFolder} disabled={!rawPath}>
            <FolderOpen className="mr-2 size-4" />
            Open raw folder
          </Button>
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

        <div
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
            <div className="flex size-14 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-transform group-hover:scale-110">
              <Inbox className="size-6" />
            </div>
          )}
          <h3 className="mt-5 text-lg font-semibold text-foreground">
            {isDragging
              ? "Release to stage files"
              : isStaging
                ? "Copying files..."
                : "Drop files or click to browse"}
          </h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            PDFs, slides, images, notes — any course material.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              <Upload className="mr-1 size-3" />
              Staged to raw/
            </Badge>
            <Badge variant="secondary" className="rounded-full">
              <FileText className="mr-1 size-3" />
              Any file type
            </Badge>
          </div>
        </div>

        {hasStagedFiles ? (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div>
                <h4 className="text-sm font-medium text-foreground">
                  {stagedFiles.length} file(s) staged
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Opens a new chat to process with AI.
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
                  Process
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Queue
                </span>
              </div>
              <div className="space-y-2">
                {stagedFiles.map((file) => (
                  <div
                    key={`${file.sourcePath}-${file.targetPath}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
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
                      <Badge variant="outline" className="rounded-full text-[11px]">
                        raw/
                      </Badge>
                      <button
                        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setStagedFiles((prev) =>
                            prev.filter((f) => f.sourcePath !== file.sourcePath),
                          );
                          toast.info(`Removed ${file.name}`);
                        }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {errors.length > 0 ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive animate-in fade-in slide-in-from-bottom-2 duration-200">
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
