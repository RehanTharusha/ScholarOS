import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Maximize2, Minimize2, SquarePen } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  StreamingMessageBody,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import { ToolCallGroupView } from "@/components/ai-elements/tool-group";
import { WebSearchResult } from "@/components/ai-elements/web-search-result";
import { PermissionRequest } from "@/components/ai-elements/permission-request";
import { AskHumanRequest } from "@/components/ai-elements/ask-human-request";
import { Suggestions } from "@/components/ai-elements/suggestions";
import {
  type PromptInputMessage,
  type FileMention,
} from "@/components/ai-elements/prompt-input";
import { FileCardProvider } from "@/contexts/file-card-context";
import { TabBar, type ChatTab } from "@/components/tab-bar";
import {
  ChatResearchProgress,
  ChatResearchComplete,
} from "@/components/research";
import {
  ChatInputWithMentions,
  type StagedAttachment,
  type SelectedModel,
} from "@/components/chat-input-with-mentions";
import { ChatMessageAttachments } from "@/components/chat-message-attachments";
import { wikiLabel } from "@/lib/wiki-links";
import {
  streamdownComponents,
  userMessageRemarkPlugins,
  SmoothStreamingMessage,
  matchBillingError,
  BillingErrorCTA,
} from "@/components/chat-shared";
import {
  type ChatViewportAnchorState,
  type ChatTabViewState,
  type ConversationItem,
  type PermissionResponse,
  type ToolCall,
  createEmptyChatTabViewState,
  getWebSearchCardData,
  groupConversationItems,
  isChatMessage,
  isErrorMessage,
  isToolCall,
  parseAttachedFiles,
} from "@/lib/chat-conversation";


const MIN_WIDTH = 360;
const MAX_WIDTH = 1600;
const MIN_MAIN_PANE_WIDTH = 420;
const MIN_MAIN_PANE_RATIO = 0.3;
const DEFAULT_WIDTH = 460;
const RIGHT_PANE_WIDTH_STORAGE_KEY = "x:right-pane-width";

function clampPaneWidth(width: number, maxWidth: number = MAX_WIDTH): number {
  const boundedMax = Math.max(0, Math.min(MAX_WIDTH, maxWidth));
  const boundedMin = Math.min(MIN_WIDTH, boundedMax);
  return Math.min(boundedMax, Math.max(boundedMin, width));
}

function getInitialPaneWidth(defaultWidth: number): number {
  const fallback = clampPaneWidth(defaultWidth);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(RIGHT_PANE_WIDTH_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return clampPaneWidth(parsed);
  } catch {
    return fallback;
  }
}

interface ChatSidebarProps {
  defaultWidth?: number;
  isOpen?: boolean;
  isMaximized?: boolean;
  chatTabs: ChatTab[];
  activeChatTabId: string;
  getChatTabTitle: (tab: ChatTab) => string;
  isChatTabProcessing: (tab: ChatTab) => boolean;
  onSwitchChatTab: (tabId: string) => void;
  onCloseChatTab: (tabId: string) => void;
  onNewChatTab: () => void;
  onOpenFullScreen?: () => void;
  conversation: ConversationItem[];
  currentAssistantMessage: string;
  currentToolDraftActive?: boolean;
  chatTabStates?: Record<string, ChatTabViewState>;
  viewportAnchors?: Record<string, ChatViewportAnchorState>;
  isProcessing: boolean;
  isStopping?: boolean;
  onStop?: () => void;
  onSubmit: (
    message: PromptInputMessage,
    mentions?: FileMention[],
    attachments?: StagedAttachment[],
    searchEnabled?: boolean,
    researchEnabled?: boolean,
  ) => void;
  knowledgeFiles?: string[];
  recentFiles?: string[];
  visibleFiles?: string[];
  runId?: string | null;
  presetMessage?: string;
  onPresetMessageConsumed?: () => void;
  getInitialDraft?: (tabId: string) => string | undefined;
  onDraftChangeForTab?: (tabId: string, text: string) => void;
  onSelectedModelChangeForTab?: (
    tabId: string,
    model: SelectedModel | null,
  ) => void;
  pendingAskHumanRequests?: ChatTabViewState["pendingAskHumanRequests"];
  allPermissionRequests?: ChatTabViewState["allPermissionRequests"];
  permissionResponses?: ChatTabViewState["permissionResponses"];
  onPermissionResponse?: (
    toolCallId: string,
    subflow: string[],
    response: PermissionResponse,
    scope?: "once" | "session" | "always",
  ) => void;
  onAskHumanResponse?: (
    toolCallId: string,
    subflow: string[],
    response: string,
  ) => void;
  isToolOpenForTab?: (tabId: string, toolId: string) => boolean;
  onToolOpenChangeForTab?: (
    tabId: string,
    toolId: string,
    open: boolean,
  ) => void;
  onOpenKnowledgeFile?: (path: string) => void;
  onActivate?: () => void;
  // Voice / TTS props
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
  cavemanEnabled?: boolean;
  onToggleCaveman?: () => void;
  researchAvailable?: boolean;
  onCopyResearch?: () => void;
  onDeleteResearch?: () => void;
  onDiscussResearch?: () => void;
  onShowResearchInPanel?: () => void;
  onOpenResearchHtml?: () => void;
  onCancelResearch?: () => void;
}

export function ChatSidebar({
  defaultWidth = DEFAULT_WIDTH,
  isOpen = true,
  isMaximized = false,
  chatTabs,
  activeChatTabId,
  getChatTabTitle,
  isChatTabProcessing,
  onSwitchChatTab,
  onCloseChatTab,
  onNewChatTab,
  onOpenFullScreen,
  conversation,
  currentAssistantMessage,
  currentToolDraftActive = false,
  chatTabStates = {},
  viewportAnchors = {},
  isProcessing,
  isStopping,
  onStop,
  onSubmit,
  knowledgeFiles = [],
  recentFiles = [],
  visibleFiles = [],
  runId,
  presetMessage,
  onPresetMessageConsumed,
  getInitialDraft,
  onDraftChangeForTab,
  onSelectedModelChangeForTab,
  pendingAskHumanRequests = new Map(),
  allPermissionRequests = new Map(),
  permissionResponses = new Map(),
  onPermissionResponse,
  onAskHumanResponse,
  isToolOpenForTab,
  onToolOpenChangeForTab,
  onOpenKnowledgeFile,
  onActivate,
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
  cavemanEnabled = false,
  onToggleCaveman,
  researchAvailable = true,
  onCopyResearch,
  onDeleteResearch,
  onDiscussResearch,
  onShowResearchInPanel,
  onOpenResearchHtml,
  onCancelResearch,
}: ChatSidebarProps) {
  const [width, setWidth] = useState(() => getInitialPaneWidth(defaultWidth));
  const [isResizing, setIsResizing] = useState(false);
  const [showContent, setShowContent] = useState(isOpen);
  const [localPresetMessage, setLocalPresetMessage] = useState<
    string | undefined
  >(undefined);

  const paneRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const prevIsMaximizedRef = useRef(isMaximized);
  const justToggledMaximize = prevIsMaximizedRef.current !== isMaximized;

  const getMaxAllowedWidth = useCallback(() => {
    if (typeof window === "undefined") return MAX_WIDTH;
    const paneElement = paneRef.current;
    const splitContainer = paneElement?.parentElement;
    const mainPane = splitContainer?.querySelector<HTMLElement>(
      '[data-slot="sidebar-inset"]',
    );
    const paneWidth = paneElement?.getBoundingClientRect().width ?? 0;
    const mainPaneWidth = mainPane?.getBoundingClientRect().width ?? 0;
    const splitWidth = paneWidth + mainPaneWidth;
    const fallbackWidth = splitContainer?.clientWidth ?? window.innerWidth;
    const availableSplitWidth = splitWidth > 0 ? splitWidth : fallbackWidth;
    const minMainPaneWidth = Math.min(
      availableSplitWidth,
      Math.max(
        MIN_MAIN_PANE_WIDTH,
        Math.floor(availableSplitWidth * MIN_MAIN_PANE_RATIO),
      ),
    );
    return Math.max(0, availableSplitWidth - minMainPaneWidth);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setShowContent(true), 150);
      return () => clearTimeout(timer);
    }
    setShowContent(false);
  }, [isOpen]);

  useEffect(() => {
    prevIsMaximizedRef.current = isMaximized;
  }, [isMaximized]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RIGHT_PANE_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // Ignore persistence failures and keep in-memory behavior.
    }
  }, [width]);

  useEffect(() => {
    const clampToAvailableWidth = () => {
      const maxAllowedWidth = getMaxAllowedWidth();
      setWidth((prev) => clampPaneWidth(prev, maxAllowedWidth));
    };

    clampToAvailableWidth();
    window.addEventListener("resize", clampToAvailableWidth);
    return () => window.removeEventListener("resize", clampToAvailableWidth);
  }, [getMaxAllowedWidth]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setIsResizing(true);

      const handleMouseMove = (event: MouseEvent) => {
        const delta = startXRef.current - event.clientX;
        const maxAllowedWidth = getMaxAllowedWidth();
        setWidth(
          clampPaneWidth(startWidthRef.current + delta, maxAllowedWidth),
        );
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width, getMaxAllowedWidth],
  );

  const activeTabState = useMemo<ChatTabViewState>(
    () => ({
      runId: runId ?? null,
      conversation,
      currentAssistantMessage,
      currentToolDraftActive,
      pendingAskHumanRequests,
      allPermissionRequests,
      permissionResponses,
      research: chatTabStates[activeChatTabId]?.research ?? null,
    }),
    [
      runId,
      conversation,
      currentAssistantMessage,
      currentToolDraftActive,
      pendingAskHumanRequests,
      allPermissionRequests,
      permissionResponses,
      chatTabStates,
      activeChatTabId,
    ],
  );
  const emptyTabState = useMemo<ChatTabViewState>(
    () => createEmptyChatTabViewState(),
    [],
  );
  const getTabState = useCallback(
    (tabId: string): ChatTabViewState => {
      if (tabId === activeChatTabId) return activeTabState;
      return chatTabStates[tabId] ?? emptyTabState;
    },
    [activeChatTabId, activeTabState, chatTabStates, emptyTabState],
  );
  const hasConversation =
    activeTabState.conversation.length > 0 ||
    activeTabState.currentAssistantMessage !== "" ||
    activeTabState.currentReasoningMessage !== "" ||
    activeTabState.currentToolDraftActive;

  const renderConversationItem = (item: ConversationItem, tabId: string) => {
    if (isChatMessage(item)) {
      if (item.role === "user") {
        if (item.attachments && item.attachments.length > 0) {
          return (
            <Message key={item.id} from={item.role} data-message-id={item.id}>
              <MessageContent className="group-[.is-user]:bg-transparent group-[.is-user]:px-0 group-[.is-user]:py-0 group-[.is-user]:rounded-none">
                <ChatMessageAttachments attachments={item.attachments} />
              </MessageContent>
              {item.content && (
                <MessageContent>
                  <MessageResponse
                    components={streamdownComponents}
                    remarkPlugins={userMessageRemarkPlugins}
                  >
                    {item.content}
                  </MessageResponse>
                </MessageContent>
              )}
            </Message>
          );
        }
        const { message, files } = parseAttachedFiles(item.content);
        return (
          <Message key={item.id} from={item.role} data-message-id={item.id}>
            <MessageContent>
              {files.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {files.map((filePath, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    >
                      @{wikiLabel(filePath)}
                    </span>
                  ))}
                </div>
              )}
              <MessageResponse
                components={streamdownComponents}
                remarkPlugins={userMessageRemarkPlugins}
              >
                {message}
              </MessageResponse>
            </MessageContent>
          </Message>
        );
      }
      return (
        <Message key={item.id} from={item.role} data-message-id={item.id}>
          {item.reasoning && (
            <Reasoning isStreaming={false} defaultOpen={false}>
              <ReasoningTrigger />
              <ReasoningContent>{item.reasoning}</ReasoningContent>
            </Reasoning>
          )}
          <MessageContent>
            <MessageResponse components={streamdownComponents}>
              {item.content}
            </MessageResponse>
          </MessageContent>
        </Message>
      );
    }

    if (isToolCall(item)) {
      const webSearchData = getWebSearchCardData(item);
      if (webSearchData) {
        return (
          <WebSearchResult
            key={item.id}
            query={webSearchData.query}
            results={webSearchData.results}
            status={item.status}
            title={webSearchData.title}
          />
        );
      }
      if (item.name === "deep-research") {
        const result = item.result as any;
        const session = result?.session ?? null;
        const progress = result?.progress ?? null;
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {session ? (
              <ChatResearchComplete
                session={session}
                onCopy={onCopyResearch ?? (() => {})}
                onDelete={onDeleteResearch ?? (() => {})}
                onDiscuss={onDiscussResearch ?? (() => {})}
                onShowInPanel={onShowResearchInPanel ?? (() => {})}
                onOpenHtml={onOpenResearchHtml ?? (() => {})}
              />
            ) : (
              <ChatResearchProgress
                progress={(progress ?? {
                  phase: "planning" as const,
                  round: 0,
                  totalRounds: 6,
                  queriesFound: 0,
                  sourcesFound: 0,
                  findingsCount: 0,
                }) as any}
                startedAt={item.timestamp}
                onCancel={onCancelResearch ?? (() => {})}
              />
            )}
          </motion.div>
        );
      }

      // Generic tool calls are now rendered via ToolCallGroupView
      // in the grouped conversation iteration.
      return null;
    }

    if (isErrorMessage(item)) {
      const billingError = matchBillingError(item.message);
      if (billingError) {
        return (
          <Message key={item.id} from="assistant" data-message-id={item.id}>
            <MessageContent className="rounded-lg border border-amber-500/30 dark:border-amber-400/20 bg-amber-500/10 dark:bg-amber-400/10 px-4 py-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-200 dark:text-amber-300">
                  {billingError.title}
                </p>
                <p className="text-xs text-amber-300/80 dark:text-amber-400/70">
                  {billingError.subtitle}
                </p>
                <BillingErrorCTA label={billingError.cta} />
              </div>
            </MessageContent>
          </Message>
        );
      }
      return (
        <Message key={item.id} from="assistant" data-message-id={item.id}>
          <MessageContent className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
            <pre className="whitespace-pre-wrap font-mono text-xs">
              {item.message}
            </pre>
          </MessageContent>
        </Message>
      );
    }

    return null;
  };

  const paneStyle = useMemo<React.CSSProperties>(() => {
    if (!isOpen) {
      return { width: 0, flex: "0 0 auto" };
    }
    if (isMaximized) {
      // In maximize mode the pane should grow into the freed left space,
      // not add extra width to the right and overflow the app viewport.
      return { width: 0, flex: "1 1 auto" };
    }
    return { width, flex: "0 0 auto" };
  }, [isOpen, isMaximized, width]);

  return (
    <div
      ref={paneRef}
      data-chat-sidebar-root
      onMouseDownCapture={onActivate}
      onFocusCapture={onActivate}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden border-l border-border bg-background",
        !isResizing &&
          !justToggledMaximize &&
          "transition-[width] duration-200 ease-linear",
      )}
      style={paneStyle}
    >
      {!isMaximized && (
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute inset-y-0 left-0 z-20 w-4 -translate-x-1/2 cursor-col-resize",
            "after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:transition-colors",
            "hover:after:bg-sidebar-border",
            isResizing && "after:bg-primary",
          )}
        />
      )}

      {showContent && (
        <>
          <header className="titlebar-drag-region flex h-10 shrink-0 items-stretch border-b border-border bg-sidebar">
            <TabBar
              tabs={chatTabs}
              activeTabId={activeChatTabId}
              getTabTitle={getChatTabTitle}
              getTabId={(tab) => tab.id}
              isProcessing={isChatTabProcessing}
              onSwitchTab={onSwitchChatTab}
              onCloseTab={onCloseChatTab}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onNewChatTab}
                  className="titlebar-no-drag my-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <SquarePen className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New chat tab</TooltipContent>
            </Tooltip>
            {onOpenFullScreen && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onOpenFullScreen}
                    className="titlebar-no-drag my-1 mr-2 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={
                      isMaximized
                        ? "Restore two-pane view"
                        : "Maximize chat view"
                    }
                  >
                    {isMaximized ? (
                      <Minimize2 className="size-5" />
                    ) : (
                      <Maximize2 className="size-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isMaximized ? "Restore two-pane view" : "Maximize chat view"}
                </TooltipContent>
              </Tooltip>
            )}
          </header>

          <FileCardProvider
            onOpenKnowledgeFile={onOpenKnowledgeFile ?? (() => {})}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative min-h-0 flex-1">
                {chatTabs.map((tab) => {
                  const isActive = tab.id === activeChatTabId;
                  const tabState = getTabState(tab.id);
                  const tabHasConversation =
                    tabState.conversation.length > 0 ||
                    tabState.currentAssistantMessage !== "" ||
                    tabState.currentReasoningMessage !== "" ||
                    tabState.currentToolDraftActive;
                  return (
                    <div
                      key={tab.id}
                      className={cn(
                        "min-h-0 h-full flex-col",
                        isActive
                          ? "flex"
                          : "pointer-events-none invisible absolute inset-0 flex",
                      )}
                      data-chat-tab-panel={tab.id}
                      aria-hidden={!isActive}
                    >
                      <Conversation
                        anchorMessageId={viewportAnchors[tab.id]?.messageId}
                        anchorRequestKey={viewportAnchors[tab.id]?.requestKey}
                        className="relative flex-1"
                      >
                        <ConversationContent
                          className={
                            tabHasConversation
                              ? "mx-auto w-full max-w-4xl px-3 pb-28"
                              : "mx-auto w-full max-w-4xl min-h-full items-center justify-center px-3 pb-0"
                          }
                        >
                          {!tabHasConversation ? (
                            <ConversationEmptyState className="h-auto">
                              <div className="text-sm text-muted-foreground">
                                Ask anything...
                              </div>
                            </ConversationEmptyState>
                          ) : (
                            <>
                              {(() => {
                                const nodes: React.ReactNode[] = [];
                                let idx = 0;
                                for (const groupItem of groupConversationItems(
                                  tabState.conversation,
                                )) {
                                  idx++;
                                  if (groupItem.kind === "tool-group") {
                                    const permEntries = (
                                      onPermissionResponse
                                        ? groupItem.items
                                            .map((toolItem) => {
                                              const req =
                                                tabState.allPermissionRequests.get(
                                                  toolItem.id,
                                                );
                                              return req
                                                ? {
                                                    item: toolItem,
                                                    request: req,
                                                    response:
                                                      tabState.permissionResponses.get(
                                                        toolItem.id,
                                                      ) || null,
                                                  }
                                                : null;
                                            })
                                            .filter(Boolean)
                                        : []
                                    ) as Array<{
                                      item: ToolCall;
                                      request: NonNullable<
                                        ReturnType<
                                          typeof tabState.allPermissionRequests.get
                                        >
                                      >;
                                      response: "approve" | "deny" | null;
                                    }>;

                                    nodes.push(
                                      <React.Fragment key={`g-${idx}`}>
                                        <motion.div
                                          initial={{ opacity: 0, y: 6 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          transition={{
                                            duration: 0.25,
                                            ease: [0.16, 1, 0.3, 1],
                                          }}
                                        >
                                          <ToolCallGroupView
                                            group={groupItem}
                                          />
                                        </motion.div>
                                        {permEntries.map(
                                          ({ item, request, response }) => (
                                            <motion.div
                                              key={`gp-${item.id}`}
                                              initial={{ opacity: 0, y: 6 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              transition={{
                                                duration: 0.25,
                                                ease: [0.16, 1, 0.3, 1],
                                              }}
                                            >
                                              <PermissionRequest
                                                toolCall={request.toolCall}
                                                onApprove={() =>
                                                  onPermissionResponse!(
                                                    request.toolCall.toolCallId,
                                                    request.subflow,
                                                    "approve",
                                                  )
                                                }
                                                onApproveSession={() =>
                                                  onPermissionResponse!(
                                                    request.toolCall.toolCallId,
                                                    request.subflow,
                                                    "approve",
                                                    "session",
                                                  )
                                                }
                                                onApproveAlways={() =>
                                                  onPermissionResponse!(
                                                    request.toolCall.toolCallId,
                                                    request.subflow,
                                                    "approve",
                                                    "always",
                                                  )
                                                }
                                                onDeny={() =>
                                                  onPermissionResponse!(
                                                    request.toolCall.toolCallId,
                                                    request.subflow,
                                                    "deny",
                                                  )
                                                }
                                                isProcessing={
                                                  isActive && isProcessing
                                                }
                                                response={response}
                                              />
                                            </motion.div>
                                          ),
                                        )}
                                      </React.Fragment>,
                                    );
                                  } else {
                                    const rendered =
                                      renderConversationItem(
                                        groupItem,
                                        tab.id,
                                      );
                                    nodes.push(
                                      <motion.div
                                        key={`s-${idx}`}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                          duration: 0.25,
                                          ease: [0.16, 1, 0.3, 1],
                                        }}
                                      >
                                        {rendered}
                                      </motion.div>,
                                    );
                                  }
                                }
                                return nodes;
                              })()}

                              {onAskHumanResponse &&
                                Array.from(
                                  tabState.pendingAskHumanRequests.values(),
                                ).map((request) => (
                                  <AskHumanRequest
                                    key={request.toolCallId}
                                    query={request.query}
                                    onResponse={(response) =>
                                      onAskHumanResponse(
                                        request.toolCallId,
                                        request.subflow,
                                        response,
                                      )
                                    }
                                    isProcessing={isActive && isProcessing}
                                  />
                                ))}

                              {tabState.currentReasoningMessage && (
                                <Reasoning isStreaming>
                                  <ReasoningTrigger />
                                  <ReasoningContent>
                                    {tabState.currentReasoningMessage}
                                  </ReasoningContent>
                                </Reasoning>
                              )}

                              {tabState.currentToolDraftActive && (
                                <Message from="assistant">
                                  <MessageContent>
                                    <StreamingMessageBody />
                                  </MessageContent>
                                </Message>
                              )}

                              {tabState.currentToolDraftActive === false && tabState.currentAssistantMessage && (
                                <SmoothStreamingMessage
                                  text={tabState.currentAssistantMessage.replace(/<\/?voice>/g, "")}
                                  components={streamdownComponents}
                                />
                              )}

                              {isActive &&
                                isProcessing &&
                                !tabState.currentReasoningMessage &&
                                !tabState.currentAssistantMessage &&
                                !tabState.currentToolDraftActive && (
                                  <Message from="assistant">
                                    <MessageContent>
                                      <Shimmer duration={1}>
                                        Thinking...
                                      </Shimmer>
                                    </MessageContent>
                                  </Message>
                                )}
                            </>
                          )}
                        </ConversationContent>
                        <ConversationScrollButton />
                      </Conversation>
                    </div>
                  );
                })}
              </div>

              <div className="sticky bottom-0 z-10 bg-background pb-12 pt-0 shadow-lg">
                <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-linear-to-t from-background to-transparent" />
                <div className="mx-auto w-full max-w-4xl px-3">
                  {!hasConversation && (
                    <Suggestions
                      onSelect={setLocalPresetMessage}
                      className="mb-3 justify-center"
                    />
                  )}
                  {chatTabs.map((tab) => {
                    const isActive = tab.id === activeChatTabId;
                    const tabState = getTabState(tab.id);
                    return (
                      <div
                        key={tab.id}
                        className={isActive ? "block" : "hidden"}
                        data-chat-input-panel={tab.id}
                        aria-hidden={!isActive}
                      >
                        <ChatInputWithMentions
                          knowledgeFiles={knowledgeFiles}
                          recentFiles={recentFiles}
                          visibleFiles={visibleFiles}
                          onSubmit={onSubmit}
                          onStop={onStop}
                          isProcessing={isActive && isProcessing}
                          isStopping={isActive && isStopping}
                          isActive={isActive}
                          presetMessage={
                            isActive
                              ? (localPresetMessage ?? presetMessage)
                              : undefined
                          }
                          onPresetMessageConsumed={
                            isActive
                              ? () => {
                                  setLocalPresetMessage(undefined);
                                  onPresetMessageConsumed?.();
                                }
                              : undefined
                          }
                          runId={tabState.runId}
                          initialDraft={getInitialDraft?.(tab.id)}
                          onDraftChange={
                            onDraftChangeForTab
                              ? (text) => onDraftChangeForTab(tab.id, text)
                              : undefined
                          }
                          onSelectedModelChange={
                            onSelectedModelChangeForTab
                              ? (m) => onSelectedModelChangeForTab(tab.id, m)
                              : undefined
                          }
                          isRecording={isActive && isRecording}
                          recordingText={isActive ? recordingText : undefined}
                          recordingState={isActive ? recordingState : undefined}
                          onStartRecording={
                            isActive ? onStartRecording : undefined
                          }
                          onSubmitRecording={
                            isActive ? onSubmitRecording : undefined
                          }
                          onCancelRecording={
                            isActive ? onCancelRecording : undefined
                          }
                          voiceAvailable={isActive && voiceAvailable}
                          ttsAvailable={isActive && ttsAvailable}
                          ttsEnabled={ttsEnabled}
                          ttsMode={ttsMode}
                          onToggleTts={isActive ? onToggleTts : undefined}
                          onTtsModeChange={
                            isActive ? onTtsModeChange : undefined
                          }
                          cavemanEnabled={cavemanEnabled}
                          onToggleCaveman={
                            isActive ? onToggleCaveman : undefined
                          }
                          researchAvailable={researchAvailable}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </FileCardProvider>
        </>
      )}
    </div>
  );
}
