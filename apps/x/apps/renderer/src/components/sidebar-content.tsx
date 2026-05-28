"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { isKnowledgeRelPath } from "@/lib/wiki-links";
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  Library,
  Mic,
  Network,
  Pencil,
  SearchIcon,
  SquarePen,
  Table2,
  Lightbulb,
  LoaderIcon,
  CalendarIcon,
  Settings,
  Square,
  Trash2,
  Inbox,
  LayoutGrid,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
} from "@/components/ui/sidebar";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type ActiveSection,
  useSidebarSection,
} from "@/contexts/sidebar-context";
import { SettingsDialog } from "@/components/settings-dialog";
import { toast } from "@/lib/toast";
import { useBilling } from "@/hooks/useBilling";

interface TreeNode {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: TreeNode[];
  loaded?: boolean;
}

type KnowledgeActions = {
  createNote: (parentPath?: string) => void;
  createFolder: (parentPath?: string) => void;
  createCanvas: (parentPath?: string) => void;
  openGraph: () => void;
  openBases: () => void;
  openCanvas: () => void;
  expandAll: () => void;
  collapseAll: () => void;
  rename: (path: string, newName: string, isDir: boolean) => Promise<void>;
  remove: (path: string) => Promise<void>;
  copyPath: (path: string) => void;
  revealInFileManager: (path: string) => Promise<void>;
  duplicate: (path: string, isDir: boolean) => Promise<void>;
  onOpenInNewTab?: (path: string) => void;
};

type RunListItem = {
  id: string;
  title?: string;
  createdAt: string;
  agentId: string;
};

type TasksActions = {
  onNewChat: () => void;
  onSelectRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void;
  onOpenInNewTab?: (runId: string) => void;
  onClearHistory?: () => void;
};

type SidebarContentPanelProps = {
  tree: TreeNode[];
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelectFile: (path: string, kind: "file" | "dir") => void;
  onToggleFolder?: (path: string) => void;
  knowledgeActions: KnowledgeActions;
  onVoiceNoteCreated?: (path: string) => void;
  onOpenSearch?: () => void;
  runs?: RunListItem[];
  currentRunId?: string | null;
  processingRunIds?: Set<string>;
  tasksActions?: TasksActions;
  onNewChat?: () => void;
  onOpenIngestWindow?: () => void;
  isBrowserOpen?: boolean;
  onToggleBrowser?: () => void;
  isSuggestedTopicsOpen?: boolean;
  onOpenSuggestedTopics?: () => void;
  onOpenArtifacts?: () => void;
  onOpenCanvases?: () => void;
  isCalendarOpen?: boolean;
  onOpenCalendar?: () => void;
} & React.ComponentProps<typeof Sidebar>;

const sectionTabs: { id: ActiveSection; label: string }[] = [
  { id: "knowledge", label: "Knowledge" },
  { id: "tasks", label: "Chat" },
];

function formatRunTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} m`;
  if (diffHours < 24) return `${diffHours} h`;
  if (diffDays < 7) return `${diffDays} d`;
  if (diffWeeks < 4) return `${diffWeeks} w`;
  return `${Math.max(1, diffMonths)} m`;
}

export function SidebarContentPanel({
  tree,
  selectedPath,
  expandedPaths,
  onSelectFile,
  onToggleFolder,
  knowledgeActions,
  onVoiceNoteCreated,
  runs = [],
  currentRunId,
  processingRunIds,
  tasksActions,
  onNewChat,
  onOpenSearch,
  onOpenIngestWindow,

  isBrowserOpen = false,
  onToggleBrowser,
  isSuggestedTopicsOpen = false,
  onOpenSuggestedTopics,
  onOpenArtifacts,
  onOpenCanvases,
  isCalendarOpen = false,
  onOpenCalendar,
  ...props
}: SidebarContentPanelProps) {
  const { activeSection, setActiveSection } = useSidebarSection();
  const showChatQuickActions = activeSection === "tasks";
  const showKnowledgeNewChat = activeSection === "knowledge";
  const quickActionState = showChatQuickActions ? "open" : "closed";
  const handleOpenCanvases = onOpenCanvases ?? knowledgeActions.openCanvas;
  const [isRowboatConnected, setIsRowboatConnected] = useState(false);
  const [appUrl, setAppUrl] = useState<string | null>(null);
  const { billing } = useBilling(isRowboatConnected);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaultLoading, setVaultLoading] = useState(false);

  // Load saved vault path on mount
  useEffect(() => {
    window.ipc
      .invoke("vault:getPath", null)
      .then((result) => {
        if (result.path) {
          setVaultPath(result.path);
        }
      })
      .catch((err) => {
        console.error("Failed to get vault path:", err);
      });
  }, []);

  useEffect(() => {
    const cleanup = window.ipc.on("vault:changed", (event) => {
      setVaultPath(event.path);
    });
    return cleanup;
  }, []);

  // Handle vault selection
  const handleVaultSelect = useCallback(async () => {
    try {
      setVaultLoading(true);
      const result = await window.ipc.invoke("vault:select", null);
      if (result.success && result.path) {
        setVaultPath(result.path);
        toast(
          `Vault changed to: ${result.path.split(/[\\/]/).pop()}.`,
          "success",
        );
      }
    } catch (err) {
      console.error("Failed to select vault:", err);
      toast("Failed to select vault", "error");
    } finally {
      setVaultLoading(false);
    }
  }, []);

  // Get display name for vault (just the folder name)
  const vaultDisplayName = vaultPath
    ? vaultPath.split(/[\\/]/).pop() || vaultPath
    : "Select Vault";

  useEffect(() => {
    let mounted = true;

    const refreshConnection = async () => {
      try {
        const result = await window.ipc.invoke("oauth:getState", null);
        const config = result.config || {};
        const connected = config["scholaros"]?.connected ?? false;
        if (mounted) {
          setIsRowboatConnected(connected);
        }
        if (connected && mounted) {
          try {
            const account = await window.ipc.invoke("account:getAccount", null);
            if (mounted) setAppUrl(account.config?.appUrl ?? null);
          } catch {
            /* ignore */
          }
        }
      } catch (error) {
        console.error("Failed to fetch OAuth state:", error);
        if (mounted) {
          setIsRowboatConnected(false);
        }
      }
    };

    refreshConnection();
    const cleanup = window.ipc.on("oauth:didConnect", () => {
      refreshConnection();
    });

    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader className="titlebar-drag-region">
        {/* Top spacer to clear the traffic lights + fixed toggle row */}
        <div className="h-8" />
        {/* Tab switcher - centered below the traffic lights row */}
        <div className="flex items-center px-2 py-0.5">
          <div className="titlebar-no-drag flex w-full rounded-lg bg-sidebar-accent/50 p-0.5">
            {sectionTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  activeSection === tab.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="titlebar-no-drag flex flex-col gap-0 px-2 pt-0 pb-1">
          {onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <SquarePen className="size-4" />
              <span>New chat</span>
            </button>
          )}
          {showKnowledgeNewChat && onOpenArtifacts && (
            <button
              type="button"
              onClick={onOpenArtifacts}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <Library className="size-4" />
              <span>Artifacts</span>
            </button>
          )}
          {showKnowledgeNewChat && handleOpenCanvases && (
            <button
              type="button"
              onClick={handleOpenCanvases}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <LayoutGrid className="size-4" />
              <span>Canvases</span>
            </button>
          )}
          <div
            className="sidebar-quick-actions"
            data-state={quickActionState}
            aria-hidden={!showChatQuickActions}
          >
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="sidebar-quick-action flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                style={{ "--stagger": "0ms" } as React.CSSProperties}
                tabIndex={showChatQuickActions ? 0 : -1}
              >
                <SearchIcon className="size-4" />
                <span>Search</span>
              </button>
            )}
            {onToggleBrowser && (
              <button
                type="button"
                onClick={onToggleBrowser}
                className={cn(
                  "sidebar-quick-action flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isBrowserOpen
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                style={{ "--stagger": "40ms" } as React.CSSProperties}
                tabIndex={showChatQuickActions ? 0 : -1}
              >
                <Globe className="size-4" />
                <span>Run browser task</span>
              </button>
            )}
            {onOpenSuggestedTopics && (
              <button
                type="button"
                onClick={onOpenSuggestedTopics}
                className={cn(
                  "sidebar-quick-action flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isSuggestedTopicsOpen
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                style={{ "--stagger": "80ms" } as React.CSSProperties}
                tabIndex={showChatQuickActions ? 0 : -1}
              >
                <Lightbulb className="size-4" />
                <span>Suggested Topics</span>
              </button>
            )}
            {onOpenIngestWindow && (
              <button
                type="button"
                onClick={onOpenIngestWindow}
                className="sidebar-quick-action flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                style={{ "--stagger": "120ms" } as React.CSSProperties}
                tabIndex={showChatQuickActions ? 0 : -1}
              >
                <Inbox className="size-4" />
                <span>Ingest materials</span>
              </button>
            )}
            {onOpenArtifacts && (
              <button
                type="button"
                onClick={onOpenArtifacts}
                className="sidebar-quick-action flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                style={{ "--stagger": "160ms" } as React.CSSProperties}
                tabIndex={showChatQuickActions ? 0 : -1}
              >
                <Library className="size-4" />
                <span>Artifacts</span>
              </button>
            )}
            {onOpenCalendar && (
              <button
                type="button"
                onClick={onOpenCalendar}
                className={cn(
                  "sidebar-quick-action flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isCalendarOpen
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                style={{ "--stagger": "200ms" } as React.CSSProperties}
                tabIndex={showChatQuickActions ? 0 : -1}
              >
                <CalendarIcon className="size-4" />
                <span>Calendar</span>
              </button>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {activeSection === "knowledge" && (
          <KnowledgeSection
            tree={tree}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onSelectFile={onSelectFile}
            onToggleFolder={onToggleFolder}
            actions={knowledgeActions}
            onOpenSearch={onOpenSearch}
            onVoiceNoteCreated={onVoiceNoteCreated}
          />
        )}
        {activeSection === "tasks" && (
          <TasksSection
            runs={runs}
            currentRunId={currentRunId}
            processingRunIds={processingRunIds}
            actions={tasksActions}
          />
        )}
      </SidebarContent>
      {/* Billing / upgrade CTA or Log in CTA */}
      {isRowboatConnected && billing ? (
        <div className="px-3 py-2">
          <div className="flex items-center justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/20 px-3 py-2">
            <div className="min-w-0">
              <span className="text-xs font-medium capitalize text-sidebar-foreground">
                {billing.subscriptionPlan
                  ? `${billing.subscriptionPlan} plan`
                  : "No plan"}
              </span>
              {billing.subscriptionStatus === "trialing" &&
                billing.trialExpiresAt &&
                (() => {
                  const days = Math.max(
                    0,
                    Math.ceil(
                      (new Date(billing.trialExpiresAt).getTime() -
                        Date.now()) /
                        (1000 * 60 * 60 * 24),
                    ),
                  );
                  return (
                    <p className="text-[10px] text-sidebar-foreground/60">
                      {days === 0
                        ? "Trial expires today"
                        : days === 1
                          ? "1 day left"
                          : `${days} days left`}
                    </p>
                  );
                })()}
            </div>
            <button
              onClick={() => appUrl && window.open(`${appUrl}?intent=upgrade`)}
              className="shrink-0 rounded-md bg-sidebar-foreground/10 px-2.5 py-1 text-[11px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/20"
            >
              {!billing.subscriptionPlan
                ? "Subscribe"
                : billing.subscriptionPlan === "starter"
                  ? "Upgrade"
                  : "Manage billing"}
            </button>
          </div>
        </div>
      ) : null}
      {/* Sign in CTA */}
      {/* Bottom actions */}
      <div className="border-t border-sidebar-border px-2 py-2">
        <div className="flex flex-col gap-1">
          <SettingsDialog>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
              <Settings className="size-4" />
              <span>Settings</span>
            </button>
          </SettingsDialog>
          {/* Vault Selector Button */}
          <button
            onClick={handleVaultSelect}
            disabled={vaultLoading}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            title={vaultPath || "Select a vault folder"}
          >
            {vaultLoading ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <FolderOpen className="size-4" />
            )}
            <span className="truncate flex-1 text-left">
              {vaultDisplayName}
            </span>
            <ChevronsUpDown className="size-3 opacity-50" />
          </button>
        </div>
      </div>
      <SidebarRail />
    </Sidebar>
  );
}

async function transcribeWithDeepgram(audioBlob: Blob): Promise<string | null> {
  try {
    const { exists } = await window.ipc.invoke("workspace:exists", {
      path: "config/deepgram.json",
    });
    if (!exists) return null;
    const configResult = await window.ipc.invoke("workspace:readFile", {
      path: "config/deepgram.json",
      encoding: "utf8",
    });
    const { apiKey } = JSON.parse(configResult.data) as { apiKey: string };
    if (!apiKey) throw new Error("No apiKey in deepgram.json");

    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": audioBlob.type,
        },
        body: audioBlob,
      },
    );

    if (!response.ok) throw new Error(`Deepgram API error: ${response.status}`);
    const result = await response.json();
    return result.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? null;
  } catch (err) {
    console.error("Deepgram transcription failed:", err);
    return null;
  }
}

// Voice Note Recording Button
function VoiceNoteButton({
  onNoteCreated,
}: {
  onNoteCreated?: (path: string) => void;
}) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [hasDeepgramKey, setHasDeepgramKey] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const notePathRef = React.useRef<string | null>(null);
  const timestampRef = React.useRef<string | null>(null);
  const relativePathRef = React.useRef<string | null>(null);
  // Keep a ref to always call the latest onNoteCreated (avoids stale closure in recorder.onstop)
  const onNoteCreatedRef = React.useRef(onNoteCreated);
  React.useEffect(() => {
    onNoteCreatedRef.current = onNoteCreated;
  }, [onNoteCreated]);

  React.useEffect(() => {
    (async () => {
      try {
        const { exists } = await window.ipc.invoke("workspace:exists", {
          path: "config/deepgram.json",
        });
        if (!exists) {
          setHasDeepgramKey(false);
          return;
        }
        const result = await window.ipc.invoke("workspace:readFile", {
          path: "config/deepgram.json",
          encoding: "utf8",
        });
        const { apiKey } = JSON.parse(result.data) as { apiKey: string };
        setHasDeepgramKey(!!apiKey);
      } catch {
        setHasDeepgramKey(false);
      }
    })();
  }, []);

  const startRecording = async () => {
    try {
      // Generate timestamp and paths immediately
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-");
      const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
      const noteName = `voice-memo-${timestamp}`;
      const notePath = `Voice Memos/${dateStr}/${noteName}.md`;

      timestampRef.current = timestamp;
      notePathRef.current = notePath;
      const relativePath = `Voice Memos/${dateStr}/${noteName}`;
      relativePathRef.current = relativePath;

      // Create the note immediately with a "Recording..." placeholder
      await window.ipc.invoke("workspace:mkdir", {
        path: `Voice Memos/${dateStr}`,
        recursive: true,
      });

      const initialContent = `---
type: voice memo
recorded: "${now.toISOString()}"
path: ${relativePath}
---
# Voice Memo

## Transcript

*Recording in progress...*
`;
      await window.ipc.invoke("workspace:writeFile", {
        path: notePath,
        data: initialContent,
        opts: { encoding: "utf8" },
      });

      // Select the note so the user can see it
      onNoteCreatedRef.current?.(notePath);

      // Start actual recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType === "audio/mp4" ? "m4a" : "webm";
        const audioFilename = `voice-memo-${timestampRef.current}.${ext}`;

        // Save audio file to voice_memos folder (for backup/reference)
        try {
          await window.ipc.invoke("workspace:mkdir", {
            path: "voice_memos",
            recursive: true,
          });

          const arrayBuffer = await blob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              "",
            ),
          );

          await window.ipc.invoke("workspace:writeFile", {
            path: `voice_memos/${audioFilename}`,
            data: base64,
            opts: { encoding: "base64" },
          });
        } catch {
          console.error("Failed to save audio file");
        }

        // Update note to show transcribing status
        const currentNotePath = notePathRef.current;
        const currentRelativePath = relativePathRef.current;
        if (currentNotePath && currentRelativePath) {
          const transcribingContent = `---
type: voice memo
recorded: "${new Date().toISOString()}"
path: ${currentRelativePath}
---
# Voice Memo

## Transcript

*Transcribing...*
`;
          await window.ipc.invoke("workspace:writeFile", {
            path: currentNotePath,
            data: transcribingContent,
            opts: { encoding: "utf8" },
          });
        }

        // Transcribe and update the note with the transcript
        const transcript = await transcribeWithDeepgram(blob);
        if (currentNotePath && currentRelativePath) {
          const finalContent = transcript
            ? `---
type: voice memo
recorded: "${new Date().toISOString()}"
path: ${currentRelativePath}
---
# Voice Memo

## Transcript

${transcript}
`
            : `---
type: voice memo
recorded: "${new Date().toISOString()}"
path: ${currentRelativePath}
---
# Voice Memo

## Transcript

*Transcription failed. Please try again.*
`;
          await window.ipc.invoke("workspace:writeFile", {
            path: currentNotePath,
            data: finalContent,
            opts: { encoding: "utf8" },
          });

          // Re-select to trigger refresh
          onNoteCreatedRef.current?.(currentNotePath);

          if (transcript) {
            toast("Voice note transcribed", "success");
          } else {
            toast("Transcription failed", "error");
          }
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      toast("Recording started", "success");
    } catch {
      toast("Could not access microphone", "error");
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  if (!hasDeepgramKey) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded p-1.5 transition-colors"
        >
          {isRecording ? (
            <Square className="size-4 fill-red-500 text-red-500 animate-pulse" />
          ) : (
            <Mic className="size-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isRecording ? "Stop Recording" : "New Voice Note"}
      </TooltipContent>
    </Tooltip>
  );
}

// Knowledge Section
function KnowledgeSection({
  tree,
  selectedPath,
  expandedPaths,
  onSelectFile,
  onToggleFolder,
  actions,
  onOpenSearch,
  onVoiceNoteCreated,
}: {
  tree: TreeNode[];
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelectFile: (path: string, kind: "file" | "dir") => void;
  onToggleFolder?: (path: string) => void;
  actions: KnowledgeActions;
  onOpenSearch?: () => void;
  onVoiceNoteCreated?: (path: string) => void;
}) {
  const isExpanded = expandedPaths.size > 0;
  const treeContainerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedPath) return;

    let cancelled = false;
    let rafId: number | null = null;
    let attempts = 0;
    const maxAttempts = 20;

    const revealActiveFile = () => {
      if (cancelled) return;
      const container = treeContainerRef.current;
      if (!container) return;
      const activeRow = container.querySelector<HTMLElement>(
        '[data-knowledge-active="true"]',
      );
      if (activeRow) {
        activeRow.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      if (attempts >= maxAttempts) return;
      attempts += 1;
      rafId = requestAnimationFrame(revealActiveFile);
    };

    rafId = requestAnimationFrame(revealActiveFile);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [selectedPath, expandedPaths, tree]);

  const quickActions = [
    ...(onOpenSearch
      ? [{ icon: SearchIcon, label: "Search", action: onOpenSearch }]
      : []),
    { icon: FilePlus, label: "New Note", action: () => actions.createNote() },
    {
      icon: FolderPlus,
      label: "New Folder",
      action: () => actions.createFolder(),
    },
    { icon: Network, label: "Graph View", action: () => actions.openGraph() },
    { icon: Table2, label: "Bases", action: () => actions.openBases() },
  ];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarGroup className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-center gap-1 py-1 sticky top-0 z-10 bg-sidebar border-b border-sidebar-border">
            {quickActions.map((action) => (
              <Tooltip key={action.label}>
                <TooltipTrigger asChild>
                  <button
                    onClick={action.action}
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded p-1.5 transition-colors"
                  >
                    <action.icon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{action.label}</TooltipContent>
              </Tooltip>
            ))}
            <VoiceNoteButton onNoteCreated={onVoiceNoteCreated} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={isExpanded ? actions.collapseAll : actions.expandAll}
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded p-1.5 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronsDownUp className="size-4" />
                  ) : (
                    <ChevronsUpDown className="size-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isExpanded ? "Collapse All" : "Expand All"}
              </TooltipContent>
            </Tooltip>
          </div>
          <SidebarGroupContent className="flex-1 overflow-y-auto">
            <div ref={treeContainerRef}>
              <SidebarMenu>
                {tree.map((item, index) => (
                  <Tree
                    key={index}
                    item={item}
                    selectedPath={selectedPath}
                    expandedPaths={expandedPaths}
                    onSelect={onSelectFile}
                    onToggleFolder={onToggleFolder}
                    actions={actions}
                  />
                ))}
              </SidebarMenu>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => actions.createNote()}>
          <FilePlus className="mr-2 size-4" />
          New Note
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.createFolder()}>
          <FolderPlus className="mr-2 size-4" />
          New Folder
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.createCanvas()}>
          <LayoutGrid className="mr-2 size-4" />
          New Canvas
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Display name overrides for top-level knowledge folders */
const FOLDER_DISPLAY_NAMES: Record<string, string> = {};

// Tree component for file browser
function Tree({
  item,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggleFolder,
  actions,
}: {
  item: TreeNode;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (path: string, kind: "file" | "dir") => void;
  onToggleFolder?: (path: string) => void;
  actions: KnowledgeActions;
}) {
  const isDir = item.kind === "dir";
  const isExpanded = expandedPaths.has(item.path);
  const isSelected = selectedPath === item.path;
  const [isRenaming, setIsRenaming] = useState(false);
  const isSubmittingRef = React.useRef(false);
  const displayName = (isDir && FOLDER_DISPLAY_NAMES[item.name]) || item.name;
  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toLowerCase().includes("mac");
  const revealLabel = isMac ? "Reveal in Finder" : "Reveal in Explorer";

  // For files, strip .md extension for editing
  const baseName =
    !isDir && item.name.endsWith(".md") ? item.name.slice(0, -3) : item.name;
  const [newName, setNewName] = useState(baseName);

  // Sync newName when baseName changes (e.g., after external rename)
  React.useEffect(() => {
    setNewName(baseName);
  }, [baseName]);

  const handleRename = async () => {
    // Prevent double submission
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const trimmedName = newName.trim();
    if (trimmedName && trimmedName !== baseName) {
      try {
        await actions.rename(item.path, trimmedName, isDir);
        toast("Renamed successfully", "success");
      } catch {
        toast("Failed to rename", "error");
      }
    }
    setIsRenaming(false);
    // Reset after a small delay to prevent blur from re-triggering
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 100);
  };

  const handleDelete = async () => {
    try {
      await actions.remove(item.path);
      toast("Moved to trash", "success");
    } catch {
      toast("Failed to delete", "error");
    }
  };

  const handleCopyPath = () => {
    actions.copyPath(item.path);
    toast("Path copied", "success");
  };

  const cancelRename = () => {
    isSubmittingRef.current = true; // Prevent blur from triggering rename
    setIsRenaming(false);
    setNewName(baseName); // Reset to original name
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 100);
  };

  const contextMenuContent = (
    <ContextMenuContent className="w-48">
      {isDir && (
        <>
          <ContextMenuItem onClick={() => actions.createNote(item.path)}>
            <FilePlus className="mr-2 size-4" />
            New Note
          </ContextMenuItem>
          <ContextMenuItem onClick={() => actions.createFolder(item.path)}>
            <FolderPlus className="mr-2 size-4" />
            New Folder
          </ContextMenuItem>
          <ContextMenuItem onClick={() => actions.createCanvas(item.path)}>
            <LayoutGrid className="mr-2 size-4" />
            New Canvas
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {!isDir && actions.onOpenInNewTab && (
        <>
          <ContextMenuItem onClick={() => actions.onOpenInNewTab!(item.path)}>
            <ExternalLink className="mr-2 size-4" />
            Open in new tab
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onClick={handleCopyPath}>
        <Copy className="mr-2 size-4" />
        Copy Path
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => void actions.revealInFileManager(item.path)}
      >
        <FolderOpen className="mr-2 size-4" />
        {revealLabel}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => void actions.duplicate(item.path, isDir)}>
        <Copy className="mr-2 size-4" />
        Duplicate
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => {
          setNewName(baseName);
          isSubmittingRef.current = false;
          setIsRenaming(true);
        }}
      >
        <Pencil className="mr-2 size-4" />
        Rename
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onClick={handleDelete}>
        <Trash2 className="mr-2 size-4" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );

  // Inline rename input
  if (isRenaming) {
    return (
      <SidebarMenuItem>
        <div className="flex items-center px-2 py-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={async (e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                await handleRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            onBlur={() => {
              // Only trigger rename if not already submitting
              if (!isSubmittingRef.current) {
                handleRename();
              }
            }}
            className="h-6 text-sm flex-1"
            autoFocus
          />
        </div>
      </SidebarMenuItem>
    );
  }

  // Top-level knowledge folders open bases view — render as flat items
  const parts = item.path.split("/");
  const isBasesFolder =
    isDir && parts.length === 1 && isKnowledgeRelPath(parts[0] + "/");

  if (isBasesFolder) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuItem className="group/file-item">
            <Collapsible
              open={isExpanded}
              className="sidebar-folder-collapsible"
            >
              <SidebarMenuButton onClick={() => onSelect(item.path, item.kind)}>
                <Folder className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{displayName}</span>
              </SidebarMenuButton>
              {onToggleFolder && (item.children?.length ?? 0) > 0 && (
                <SidebarMenuAction
                  showOnHover
                  aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFolder(item.path);
                  }}
                >
                  <ChevronRight
                    className={cn(
                      "transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                </SidebarMenuAction>
              )}
              <CollapsibleContent>
                <SidebarMenuSub>
                  {(item.children ?? []).map((subItem, index) => (
                    <Tree
                      key={index}
                      item={subItem}
                      selectedPath={selectedPath}
                      expandedPaths={expandedPaths}
                      onSelect={onSelect}
                      onToggleFolder={onToggleFolder}
                      actions={actions}
                    />
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>
        </ContextMenuTrigger>
        {contextMenuContent}
      </ContextMenu>
    );
  }

  if (!isDir) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarMenuItem
            className="group/file-item"
            data-knowledge-file-path={item.path}
            data-knowledge-active={isSelected ? "true" : "false"}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/x-scholaros-path", item.path);
              e.dataTransfer.effectAllowed = "copy";
            }}
          >
            <SidebarMenuButton
              isActive={isSelected}
              onClick={(e) => {
                if (e.metaKey && actions.onOpenInNewTab) {
                  actions.onOpenInNewTab(item.path);
                } else {
                  onSelect(item.path, item.kind);
                }
              }}
            >
              <div className="flex w-full items-center gap-1 min-w-0">
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </ContextMenuTrigger>
        {contextMenuContent}
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem>
          <Collapsible
            open={isExpanded}
            onOpenChange={() => onSelect(item.path, item.kind)}
            className="sidebar-folder-collapsible group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
          >
            <CollapsibleTrigger asChild>
              <SidebarMenuButton>
                <ChevronRight className="transition-transform size-4" />
                <span className="min-w-0 flex-1 truncate">{displayName}</span>
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {(item.children ?? []).map((subItem, index) => (
                  <Tree
                    key={index}
                    item={subItem}
                    selectedPath={selectedPath}
                    expandedPaths={expandedPaths}
                    onSelect={onSelect}
                    onToggleFolder={onToggleFolder}
                    actions={actions}
                  />
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
        </SidebarMenuItem>
      </ContextMenuTrigger>
      {contextMenuContent}
    </ContextMenu>
  );
}

// Knowledge section

// Tasks Section
function TasksSection({
  runs,
  currentRunId,
  processingRunIds,
  actions,
}: {
  runs: RunListItem[];
  currentRunId?: string | null;
  processingRunIds?: Set<string>;
  actions?: TasksActions;
}) {
  const [pendingDeleteRunId, setPendingDeleteRunId] = useState<string | null>(
    null,
  );
  const [pendingClearHistory, setPendingClearHistory] = useState(false);

  return (
    <SidebarGroup className="flex-1 flex flex-col overflow-hidden">
      <SidebarGroupContent className="flex-1 overflow-y-auto">
        {/* Runs Section */}
        {runs.length > 0 && (
          <>
            <div className="group/header flex items-center justify-between px-3 py-1.5 mt-4">
              <span className="text-xs font-medium text-muted-foreground">
                Chat history
              </span>
              {actions?.onClearHistory && (
                <button
                  onClick={() => setPendingClearHistory(true)}
                  className="invisible group-hover/header:visible flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-3" />
                  Clear history
                </button>
              )}
            </div>
            <SidebarMenu>
              {runs.map((run) => (
                <ContextMenu key={run.id}>
                  <ContextMenuTrigger asChild>
                    <SidebarMenuItem className="group/chat-item">
                      <SidebarMenuButton
                        isActive={currentRunId === run.id}
                        onClick={(e) => {
                          if (e.metaKey && actions?.onOpenInNewTab) {
                            actions.onOpenInNewTab(run.id);
                          } else {
                            actions?.onSelectRun(run.id);
                          }
                        }}
                      >
                        <div className="flex w-full items-center gap-2 min-w-0">
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {run.title || "(Untitled chat)"}
                          </span>
                          {run.createdAt ? (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatRunTime(run.createdAt)}
                            </span>
                          ) : null}
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    {actions?.onOpenInNewTab && (
                      <ContextMenuItem
                        onClick={() => actions.onOpenInNewTab!(run.id)}
                      >
                        <ExternalLink className="mr-2 size-4" />
                        Open in new tab
                      </ContextMenuItem>
                    )}
                    {!processingRunIds?.has(run.id) && (
                      <>
                        {actions?.onOpenInNewTab && <ContextMenuSeparator />}
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => setPendingDeleteRunId(run.id)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </SidebarMenu>
          </>
        )}
      </SidebarGroupContent>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!pendingDeleteRunId}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRunId(null);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingDeleteRunId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (pendingDeleteRunId) {
                  actions?.onDeleteRun(pendingDeleteRunId);
                }
                setPendingDeleteRunId(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear all history confirmation dialog */}
      <Dialog
        open={pendingClearHistory}
        onOpenChange={(open) => {
          if (!open) setPendingClearHistory(false);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear chat history</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all chat history? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingClearHistory(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                actions?.onClearHistory?.();
                setPendingClearHistory(false);
              }}
            >
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
  );
}
