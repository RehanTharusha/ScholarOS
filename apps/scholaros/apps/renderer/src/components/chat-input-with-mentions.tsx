import { useCallback, useEffect, useRef, useState } from "react";
import type { FileUIPart } from "ai";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowUp,
  AudioLines,
  BookOpen,
  ChevronDown,
  FileArchive,
  FileCode2,
  FileIcon,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Globe,
  Headphones,
  LoaderIcon,
  Mic,
  Plus,
  Settings,
  Square,
  X,
  Info,
  Sparkles,
} from "lucide-react";
import { SkillsPopover, SkillsPopoverContent } from "@/components/skills-popover";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type AttachmentIconKind,
  getAttachmentDisplayName,
  getAttachmentIconKind,
  getAttachmentToneClass,
  getAttachmentTypeLabel,
} from "@/lib/attachment-presentation";
import {
  getExtension,
  getFileDisplayName,
  getMimeFromExtension,
  isImageMime,
} from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import {
  type FileMention,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputTextarea,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { toast } from "sonner";

export type StagedAttachment = {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  isImage: boolean;
  size: number;
  thumbnailUrl?: string;
};

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

const providerDisplayNames: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Gemini",
  ollama: "Ollama",
  openrouter: "OpenRouter",
  aigateway: "AI Gateway",
  "openai-compatible": "OpenAI-Compatible",
  scholaros: "ScholarOS",
  opencode: "OpenCode",
  "opencode-zen": "OpenCode Zen",
  "opencode-go": "OpenCode Go",
};

type ProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "aigateway"
  | "ollama"
  | "openai-compatible"
  | "scholaros"
  | "opencode"
  | "opencode-zen"
  | "opencode-go";

interface ConfiguredModel {
  provider: ProviderName;
  model: string;
}

export interface SelectedModel {
  provider: string;
  model: string;
}

function getSelectedModelDisplayName(model: string) {
  return model.split("/").pop() || model;
}

function getAttachmentIcon(kind: AttachmentIconKind) {
  switch (kind) {
    case "audio":
      return AudioLines;
    case "video":
      return FileVideo;
    case "spreadsheet":
      return FileSpreadsheet;
    case "archive":
      return FileArchive;
    case "code":
      return FileCode2;
    case "text":
      return FileText;
    default:
      return FileIcon;
  }
}

interface ChatInputInnerProps {
  onSubmit: (
    message: PromptInputMessage,
    mentions?: FileMention[],
    attachments?: StagedAttachment[],
    searchEnabled?: boolean,
    researchEnabled?: boolean,
  ) => void;
  onStop?: () => void;
  isProcessing: boolean;
  isStopping?: boolean;
  isActive: boolean;
  presetMessage?: string;
  contextTrigger?: React.ReactNode;
  onPresetMessageConsumed?: () => void;
  runId?: string | null;
  initialDraft?: string;
  onDraftChange?: (text: string) => void;
  isRecording?: boolean;
  recordingText?: string;
  recordingState?: "connecting" | "listening";
  onStartRecording?: () => void;
  onSubmitRecording?: () => void;
  onCancelRecording?: () => void;
  voiceAvailable?: boolean;
  ttsAvailable?: boolean;
  ttsEnabled?: boolean;
  ttsMode?: "summary" | "full";
  onToggleTts?: () => void;
  onTtsModeChange?: (mode: "summary" | "full") => void;
  /** Fired when the user picks a different model in the dropdown (only when no run exists yet). */
  onSelectedModelChange?: (model: SelectedModel | null) => void;
  cavemanEnabled?: boolean;
  onToggleCaveman?: () => void;
  researchAvailable?: boolean;
}

function ChatInputInner({
  onSubmit,
  onStop,
  isProcessing,
  isStopping,
  isActive,
  presetMessage,
  onPresetMessageConsumed,
  runId,
  initialDraft,
  onDraftChange,
  isRecording,
  recordingText,
  recordingState,
  onStartRecording,
  onSubmitRecording,
  onCancelRecording,
  voiceAvailable,
  ttsAvailable,
  ttsEnabled,
  ttsMode,
  onToggleTts,
  onTtsModeChange,
  onSelectedModelChange,
  cavemanEnabled = false,
  onToggleCaveman,
  researchAvailable = true,
  contextTrigger,
}: ChatInputInnerProps) {
  const controller = usePromptInputController();
  const message = controller.textInput.value;
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [focusNonce, setFocusNonce] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaAnchorRef = useRef<HTMLSpanElement>(null);
  const canSubmit =
    (Boolean(message.trim()) || attachments.length > 0) && !isProcessing;

  const [configuredModels, setConfiguredModels] = useState<ConfiguredModel[]>(
    [],
  );
  const [activeModelKey, setActiveModelKey] = useState("");
  const [lockedModel, setLockedModel] = useState<SelectedModel | null>(null);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  // When a run exists, freeze the dropdown to the run's resolved model+provider.
  useEffect(() => {
    if (!runId) {
      setLockedModel(null);
      return;
    }
    if (!window.ipc) return;
    let cancelled = false;
    window.ipc
      .invoke("runs:fetch", { runId })
      .then((run) => {
        if (cancelled) return;
        if (run.provider && run.model) {
          setLockedModel({ provider: run.provider, model: run.model });
        }
      })
      .catch(() => {
        /* legacy run or fetch failure — leave unlocked */
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Check ScholarOS sign-in state
  useEffect(() => {
    if (!window.ipc) return;
    window.ipc
      .invoke("oauth:getState", null)
      .then((result) => {
        setIsSignedIn(result.config?.scholaros?.connected ?? false);
      })
      .catch(() => setIsSignedIn(false));
  }, [isActive]);

  // Update sign-in state when OAuth events fire
  useEffect(() => {
    if (!window.ipc) return;
    const cleanup = window.ipc.on("oauth:didConnect", () => {
      window.ipc?.invoke("oauth:getState", null)
        .then((result) => {
          setIsSignedIn(result.config?.scholaros?.connected ?? false);
        })
        .catch(() => setIsSignedIn(false));
    });
    return cleanup;
  }, []);

  // Load the list of models the user can choose from.
  // Signed-in: gateway model list. Signed-out: providers configured in models.json.
  const loadModelConfig = useCallback(async () => {
    try {
      if (!window.ipc) return;
      if (isSignedIn) {
        const listResult = await window.ipc.invoke("models:list", null);
        const scholarosProvider = listResult.providers?.find(
          (p: { id: string }) => p.id === "scholaros",
        );
        const models: ConfiguredModel[] = (scholarosProvider?.models || []).map(
          (m: { id: string }) => ({ provider: "scholaros", model: m.id }),
        );
        setConfiguredModels(models);
      } else {
        const result = await window.ipc.invoke("workspace:readFile", {
          path: "config/models.json",
        });
        const parsed = JSON.parse(result.data);
        const models: ConfiguredModel[] = [];
        if (parsed?.providers) {
          for (const [flavor, entry] of Object.entries(parsed.providers)) {
            const e = entry as Record<string, unknown>;
            const modelList: string[] = Array.isArray(e.models)
              ? (e.models as string[])
              : [];
            const singleModel = typeof e.model === "string" ? e.model : "";
            const allModels =
              modelList.length > 0
                ? modelList
                : singleModel
                  ? [singleModel]
                  : [];
            for (const model of allModels) {
              if (model) {
                models.push({ provider: flavor as ProviderName, model });
              }
            }
          }
        }
        setConfiguredModels(models);
      }
    } catch {
      // No config yet
    }
  }, [isSignedIn]);

  useEffect(() => {
    loadModelConfig();
  }, [isActive, loadModelConfig]);

  // Reload when model config changes (e.g. from settings dialog)
  useEffect(() => {
    const handler = () => {
      loadModelConfig();
    };
    window.addEventListener("models-config-changed", handler);
    return () => window.removeEventListener("models-config-changed", handler);
  }, [loadModelConfig]);

  // Search is always available via the embedded browser
  useEffect(() => {
    setSearchAvailable(true);
  }, []);

  // Selecting a model affects only the *next* run created from this tab.
  // Once a run exists, model is frozen on the run and the dropdown is read-only.
  const handleModelChange = useCallback(
    (key: string) => {
      if (lockedModel) return;
      const entry = configuredModels.find(
        (m) => `${m.provider}/${m.model}` === key,
      );
      if (!entry) return;
      setActiveModelKey(key);
      onSelectedModelChange?.({ provider: entry.provider, model: entry.model });
    },
    [configuredModels, lockedModel, onSelectedModelChange],
  );

  // Restore the tab draft when this input mounts.
  useEffect(() => {
    if (initialDraft) {
      controller.textInput.setInput(initialDraft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onDraftChange?.(message);
  }, [message, onDraftChange]);

  useEffect(() => {
    if (presetMessage) {
      controller.textInput.setInput(presetMessage);
      onPresetMessageConsumed?.();
    }
  }, [presetMessage, controller.textInput, onPresetMessageConsumed]);

  const addFiles = useCallback(async (paths: string[]) => {
    if (!window.ipc) return;
    const newAttachments: StagedAttachment[] = [];
    for (const filePath of paths) {
      try {
        const result = await window.ipc.invoke("shell:readFileBase64", {
          path: filePath,
        });
        if (result.size > MAX_ATTACHMENT_SIZE) {
          toast.error(
            `File too large: ${getFileDisplayName(filePath)} (max 10MB)`,
          );
          continue;
        }
        const mime =
          result.mimeType || getMimeFromExtension(getExtension(filePath));
        const image = isImageMime(mime);
        newAttachments.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          path: filePath,
          filename: getFileDisplayName(filePath),
          mimeType: mime,
          isImage: image,
          size: result.size,
          thumbnailUrl: image
            ? `data:${mime};base64,${result.data}`
            : undefined,
        });
      } catch (err) {
        console.error("Failed to read file:", filePath, err);
        toast.error(`Failed to read: ${getFileDisplayName(filePath)}`);
      }
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
      setFocusNonce((value) => value + 1);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(
      { text: message.trim(), files: attachments as unknown as FileUIPart[] },
      controller.mentions.mentions,
      attachments,
      searchEnabled || undefined,
      researchEnabled || undefined,
    );
    controller.textInput.clear();
    controller.mentions.clearMentions();
    setAttachments([]);
    setSearchEnabled(false);
    setResearchEnabled(false);
  }, [attachments, canSubmit, controller, message, onSubmit, searchEnabled, researchEnabled]);

  const handleSkillSelect = useCallback(
    (skillId: string) => {
      const current = controller.textInput.value;
      const suffix = current && !current.endsWith(" ") ? " " : "";
      controller.textInput.setInput(`${current}${suffix}/${skillId} `);
      setFocusNonce((v) => v + 1);
    },
    [controller.textInput],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "/" && !message) {
        e.preventDefault();
        setSkillsOpen(true);
      }
    },
    [handleSubmit, message],
  );

  useEffect(() => {
    if (!isActive) return;
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
    };

    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const paths = Array.from(e.dataTransfer.files)
          .map((file) => window.electronUtils?.getPathForFile(file))
          .filter(Boolean) as string[];
        if (paths.length > 0) {
          void addFiles(paths);
        }
      }
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [addFiles, isActive]);

  return (
    <div className="rounded-lg border border-border bg-background shadow-none">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-1 pt-3">
          {attachments.map((attachment) => {
            const attachmentType = getAttachmentTypeLabel(attachment);
            const attachmentName = getAttachmentDisplayName(attachment);
            const Icon = getAttachmentIcon(getAttachmentIconKind(attachment));

            return (
              <span
                key={attachment.id}
                className="group relative inline-flex min-w-[230px] max-w-[320px] items-center gap-2 rounded-xl border border-border/50 bg-muted/80 px-2.5 py-2"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                    attachment.isImage && attachment.thumbnailUrl
                      ? "bg-muted"
                      : getAttachmentToneClass(attachmentType),
                  )}
                >
                  {attachment.isImage && attachment.thumbnailUrl ? (
                    <img
                      src={attachment.thumbnailUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <Icon className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-tight font-medium">
                    {attachmentName}
                  </span>
                  <span className="block pt-0.5 text-xs leading-tight text-muted-foreground">
                    {attachmentType}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground opacity-0 transition-[opacity,color] duration-150 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          const paths = Array.from(files)
            .map((file) => window.electronUtils?.getPathForFile(file))
            .filter(Boolean) as string[];
          if (paths.length > 0) {
            void addFiles(paths);
          }
          e.target.value = "";
        }}
      />
      {isRecording ? (
        /* ── Recording bar ── */
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onCancelRecording}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Cancel recording"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            <VoiceWaveform />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {recordingState === "connecting"
                ? "Connecting..."
                : recordingText || "Listening..."}
            </span>
          </div>
          <Button
            size="icon"
            onClick={onSubmitRecording}
            disabled={!recordingText?.trim()}
            className={cn(
              "h-7 w-7 shrink-0 rounded-full transition-all",
              recordingText?.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground",
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        /* ── Normal input ── */
        <>
          <div className="px-4 pt-4 pb-2">
            <SkillsPopover
              open={skillsOpen}
              onOpenChange={setSkillsOpen}
              anchorRef={textareaAnchorRef}
            >
              <SkillsPopoverContent onSelectSkill={handleSkillSelect} />
            </SkillsPopover>
            <PromptInputTextarea
              placeholder="Type your message..."
              onKeyDown={handleKeyDown}
              autoFocus={isActive}
              focusTrigger={
                isActive ? `${runId ?? "new"}:${focusNonce}` : undefined
              }
              className="min-h-6 rounded-none border-0 py-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-2 px-4 pb-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Attach files"
            >
              <Plus className="h-4 w-4" />
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Chat options"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-56 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Caveman mode</span>
                  <button
                    type="button"
                    onClick={onToggleCaveman}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${cavemanEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                    aria-label="Toggle caveman mode"
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${cavemanEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`}
                    />
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            {cavemanEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground cursor-default">
                    <Info className="h-3 w-3" />
                    <span>Caveman mode</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Make your agent talk like caveman, cutting ~75% of output
                  tokens while maintaining accuracy
                </TooltipContent>
              </Tooltip>
            )}
            {searchAvailable &&
              (searchEnabled ? (
                <button
                  type="button"
                  onClick={() => setSearchEnabled(false)}
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Search</span>
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchEnabled(true)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Search"
                >
                  <Globe className="h-4 w-4" />
                </button>
              ))}
            {researchAvailable &&
              (researchEnabled ? (
                <button
                  type="button"
                  onClick={() => setResearchEnabled(false)}
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-emerald-600 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Research</span>
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setResearchEnabled(true)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Deep Research"
                >
                  <BookOpen className="h-4 w-4" />
                </button>
              ))}
            <button
              type="button"
              onClick={() => setSkillsOpen(true)}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Skills"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Skills</span>
            </button>
            <div className="flex-1" />
            {lockedModel ? (
              <span
                className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground"
                title={`${providerDisplayNames[lockedModel.provider] || lockedModel.provider} — fixed for this chat`}
              >
                <span className="max-w-[150px] truncate">
                  {getSelectedModelDisplayName(lockedModel.model)}
                </span>
              </span>
            ) : configuredModels.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <span className="max-w-[150px] truncate">
                      {getSelectedModelDisplayName(
                        configuredModels.find(
                          (m) => `${m.provider}/${m.model}` === activeModelKey,
                        )?.model ||
                          configuredModels[0]?.model ||
                          "Model",
                      )}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={activeModelKey}
                    onValueChange={handleModelChange}
                  >
                    {configuredModels.map((m) => {
                      const key = `${m.provider}/${m.model}`;
                      return (
                        <DropdownMenuRadioItem key={key} value={key}>
                          <span className="truncate">{m.model}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {providerDisplayNames[m.provider] || m.provider}
                          </span>
                        </DropdownMenuRadioItem>
                      );
                    })}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {contextTrigger}
            {onToggleTts && ttsAvailable && (
              <div className="flex shrink-0 items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onToggleTts}
                      className={cn(
                        "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
                        ttsEnabled
                          ? "text-foreground hover:bg-muted"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      aria-label={
                        ttsEnabled
                          ? "Disable voice output"
                          : "Enable voice output"
                      }
                    >
                      <Headphones className="h-4 w-4" />
                      {!ttsEnabled && (
                        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="block h-[1.5px] w-5 -rotate-45 rounded-full bg-muted-foreground" />
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {ttsEnabled ? "Voice output on" : "Voice output off"}
                  </TooltipContent>
                </Tooltip>
                {ttsEnabled && onTtsModeChange && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuRadioGroup
                        value={ttsMode ?? "summary"}
                        onValueChange={(v) =>
                          onTtsModeChange(v as "summary" | "full")
                        }
                      >
                        <DropdownMenuRadioItem value="summary">
                          Speak summary
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="full">
                          Speak full response
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
            {voiceAvailable && onStartRecording && (
              <button
                type="button"
                onClick={onStartRecording}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Voice input"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            {isProcessing ? (
              <Button
                size="icon"
                onClick={onStop}
                title={
                  isStopping ? "Click again to force stop" : "Stop generation"
                }
                className={cn(
                  "h-7 w-7 shrink-0 rounded-full transition-all",
                  isStopping
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {isStopping ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-3 w-3 fill-current" />
                )}
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  "h-7 w-7 shrink-0 rounded-full transition-all",
                  canSubmit
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Animated waveform bars for the recording indicator */
function VoiceWaveform() {
  return (
    <div className="flex items-center gap-[3px] h-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-primary"
          style={{
            animation: `voice-wave 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes voice-wave {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      `}</style>
    </div>
  );
}

export interface ChatInputWithMentionsProps {
  knowledgeFiles: string[];
  recentFiles: string[];
  visibleFiles: string[];
  onSubmit: (
    message: PromptInputMessage,
    mentions?: FileMention[],
    attachments?: StagedAttachment[],
    searchEnabled?: boolean,
    researchEnabled?: boolean,
  ) => void;
  onStop?: () => void;
  isProcessing: boolean;
  isStopping?: boolean;
  isActive?: boolean;
  presetMessage?: string;
  onPresetMessageConsumed?: () => void;
  runId?: string | null;
  initialDraft?: string;
  onDraftChange?: (text: string) => void;
  isRecording?: boolean;
  recordingText?: string;
  recordingState?: "connecting" | "listening";
  onStartRecording?: () => void;
  onSubmitRecording?: () => void;
  onCancelRecording?: () => void;
  voiceAvailable?: boolean;
  ttsAvailable?: boolean;
  ttsEnabled?: boolean;
  ttsMode?: "summary" | "full";
  onToggleTts?: () => void;
  onTtsModeChange?: (mode: "summary" | "full") => void;
  onSelectedModelChange?: (model: SelectedModel | null) => void;
  cavemanEnabled?: boolean;
  onToggleCaveman?: () => void;
  researchAvailable?: boolean;
  contextTrigger?: React.ReactNode;
}

export function ChatInputWithMentions({
  knowledgeFiles,
  recentFiles,
  visibleFiles,
  onSubmit,
  onStop,
  isProcessing,
  isStopping,
  isActive = true,
  presetMessage,
  onPresetMessageConsumed,
  runId,
  initialDraft,
  onDraftChange,
  isRecording,
  recordingText,
  recordingState,
  onStartRecording,
  onSubmitRecording,
  onCancelRecording,
  voiceAvailable,
  ttsAvailable,
  ttsEnabled,
  ttsMode,
  onToggleTts,
  onTtsModeChange,
  onSelectedModelChange,
  cavemanEnabled = false,
  onToggleCaveman,
  researchAvailable = true,
  contextTrigger,
}: ChatInputWithMentionsProps) {
  return (
    <PromptInputProvider
      knowledgeFiles={knowledgeFiles}
      recentFiles={recentFiles}
      visibleFiles={visibleFiles}
    >
      <ChatInputInner
        onSubmit={onSubmit}
        onStop={onStop}
        isProcessing={isProcessing}
        isStopping={isStopping}
        isActive={isActive}
        presetMessage={presetMessage}
        onPresetMessageConsumed={onPresetMessageConsumed}
        runId={runId}
        initialDraft={initialDraft}
        onDraftChange={onDraftChange}
        isRecording={isRecording}
        recordingText={recordingText}
        recordingState={recordingState}
        onStartRecording={onStartRecording}
        onSubmitRecording={onSubmitRecording}
        onCancelRecording={onCancelRecording}
        voiceAvailable={voiceAvailable}
        ttsAvailable={ttsAvailable}
        ttsEnabled={ttsEnabled}
        ttsMode={ttsMode}
        onToggleTts={onToggleTts}
        onTtsModeChange={onTtsModeChange}
        onSelectedModelChange={onSelectedModelChange}
        cavemanEnabled={cavemanEnabled}
        onToggleCaveman={onToggleCaveman}
        researchAvailable={researchAvailable}
        contextTrigger={contextTrigger}
      />
    </PromptInputProvider>
  );
}
