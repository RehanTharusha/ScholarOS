import {
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { OnboardingState } from "../use-onboarding-state";

interface CompletionStepProps {
  state: OnboardingState;
}

function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        delay: Math.random() * 2,
        duration: Math.random() * 3 + 3,
      })),
    [],
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((dot, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-primary/20"
          style={{
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            width: dot.size,
            height: dot.size,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: dot.duration,
            delay: dot.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function CompletionStep({ state }: CompletionStepProps) {
  const { vaultPath, vaultLoading, handleVaultSelect, handleComplete } = state;
  const vaultName = vaultPath ? vaultPath.split(/[\\/]/).pop() : null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isStaging, setIsStaging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<
    Array<{ name: string; sourcePath: string; targetPath: string }>
  >([]);
  const [dropActive, setDropActive] = useState(false);
  const [skippedFirstIngest, setSkippedFirstIngest] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const stageFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const paths = fileArray
      .map((file) => window.electronUtils?.getPathForFile(file))
      .filter(Boolean) as string[];

    if (paths.length === 0) {
      toast.error("No file paths were available for the selected files.");
      return;
    }

    setIsStaging(true);
    setStageError(null);

    try {
      const result = await window.ipc.invoke("ingest:addFiles", {
        files: paths,
      });

      setStagedFiles((prev) => [...result.stagedFiles, ...prev]);

      if (result.errors.length > 0) {
        setStageError(result.errors.join("\n"));
        toast.warning("Some files could not be staged.");
      } else {
        toast.success(
          `Staged ${result.stagedFiles.length} file(s) into raw/ folder.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStageError(message);
      toast.error("Failed to stage files for ingestion.");
    } finally {
      setIsStaging(false);
    }
  }, []);

  const ingestSteps = [
    {
      title: "Drop materials",
      description: "Add PDFs, slides, images, or notes to the /raw folder.",
      icon: "📥",
    },
    {
      title: "Open your AI agent",
      description: "Point any AI coding agent at your vault folder.",
      icon: "🤖",
    },
    {
      title: "Ingest",
      description: 'Say "Ingest /raw" and watch your wiki grow.',
      icon: "📚",
    },
  ];

  const hasStagedFiles = stagedFiles.length > 0;

  return (
    <div className="flex flex-col flex-1 relative">
      <Particles />

      <div className="relative z-10 flex flex-col flex-1">
        {/* Celebratory icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="text-center mb-6"
        >
          <div className="relative inline-block">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="relative size-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center"
            >
              <Sparkles className="size-10 text-primary" />
            </motion.div>
          </div>
        </motion.div>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-2"
        >
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            You're all set
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Your vault is ready. Drop in your first file and watch the wiki
            build itself.
          </p>
        </motion.div>

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

        {/* Vault card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border bg-muted/30 p-4 mt-6 mb-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <FolderOpen className="size-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                  Vault
                </div>
                <div className="text-sm font-medium truncate">
                  {vaultName ?? (
                    <span className="text-muted-foreground italic">
                      No vault selected
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleVaultSelect}
              disabled={vaultLoading}
              className="shrink-0"
            >
              {vaultLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Change"
              )}
            </Button>
          </div>
        </motion.div>

        {/* Ingest prompt */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-6"
        >
          {!skippedFirstIngest ? (
            <div
              className={cn(
                "rounded-2xl border border-border bg-card px-6 py-5 text-left shadow-sm",
                isStaging && "pointer-events-none opacity-80",
              )}
            >
              <div
                className={cn(
                  "rounded-2xl border-2 border-dashed p-4 transition-all duration-200",
                  dropActive
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/20",
                )}
                onDragEnter={(event) => {
                  if (event.dataTransfer.types.includes("Files")) {
                    event.preventDefault();
                    setDropActive(true);
                  }
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes("Files")) {
                    event.preventDefault();
                    setDropActive(true);
                  }
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  ) {
                    return;
                  }
                  setDropActive(false);
                }}
                onDrop={(event) => {
                  if (event.dataTransfer.files.length > 0) {
                    event.preventDefault();
                    setDropActive(false);
                    void stageFiles(event.dataTransfer.files);
                  }
                }}
              >
                <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                  <div className="mb-4 flex size-14 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
                    {isStaging ? (
                      <Loader2 className="size-6 animate-spin" />
                    ) : (
                      <Upload className="size-6" />
                    )}
                  </div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    <Sparkles className="size-3.5" />
                    Start your first ingest
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {isStaging
                      ? "Staging files..."
                      : dropActive
                        ? "Release to stage files"
                        : "Drop files or click to browse"}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    PDFs, slides, images, and notes will be copied to{" "}
                    <code className="rounded bg-background px-1 py-0.5 text-xs">
                      raw/
                    </code>
                    .
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      onClick={openFilePicker}
                      disabled={isStaging}
                      className="gap-2"
                    >
                      <Upload className="size-4" />
                      Select files
                    </Button>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      <FileText className="size-3.5" />
                      PDFs, slides, notes
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      <Upload className="size-3.5" />
                      Select files inside this panel
                    </span>
                  </div>

                  {hasStagedFiles ? (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="size-3.5" />
                      {stagedFiles.length} file(s) staged
                    </div>
                  ) : null}

                  {stageError ? (
                    <p className="mt-3 max-w-sm whitespace-pre-line text-xs text-destructive">
                      {stageError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-4 text-left">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Need the ingest steps?
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Here is the 3-step setup for later.
                </p>
              </div>

              <div className="mt-4 space-y-2.5">
                {ingestSteps.map((step, index) => (
                  <div
                    key={step.title}
                    className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 p-3"
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-xs shadow-sm">
                      {step.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {index + 1}. {step.title}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!skippedFirstIngest ? (
            <div className="mt-3 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setSkippedFirstIngest(true)}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-foreground/50"
              >
                Skip this step
              </button>
            </div>
          ) : null}
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col items-center gap-3 mt-auto pt-4 border-t"
        >
          <Button
            onClick={handleComplete}
            size="lg"
            className="h-12 px-8 text-base font-medium w-full max-w-xs"
          >
            Open ScholarOS
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
