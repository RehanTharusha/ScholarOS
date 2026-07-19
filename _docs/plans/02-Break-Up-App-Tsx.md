# Plan 02: Break Up App.tsx

## Problem

`apps/renderer/src/App.tsx` is **6,973 lines** and contains:

- **~200+ state/ref variables** (lines 698-1159)
- **~50+ useCallback/useEffect hooks** (lines 860-4875)
- **All event handling** for chat, files, graph, canvas, calendar, research, voice, permissions, keyboard shortcuts
- **All rendering logic** — the main layout + chat + file editor + graph + canvas + calendar + bases + artifacts + onboarding + modals
- **Duplicated conversation rendering** shared with chat-sidebar.tsx

A single component this size means:
- Impossible to test any feature in isolation
- Every state update triggers re-renders of unrelated parts
- Two people cannot work on different features simultaneously
- The closure captures 500+ bindings — stale closure bugs are inevitable

## Desired State

App.tsx is <500 lines and delegates to focused contexts and view components.

```
App.tsx (orchestration only: layout shell + top-level view router)
├── ChatProvider (chat tabs, runs, streaming, permissions)
├── WorkspaceProvider (vault, file tree, file content, auto-save)
├── NavigationProvider (view state, history back/forward)
├── VoiceProvider (recording, TTS, Deepgram)
├── ResearchProvider (deep research sessions)
├── SidebarProvider (left sidebar state)
└── View components (rendered by App.tsx based on view state)
```

## Implementation Steps

### Step 1: Extract ChatContext

Move all chat-related state into `apps/renderer/src/contexts/chat-context.tsx`:

**State to move (from App.tsx):**
```typescript
// Lines 808-1080
- runId, runIdRef
- conversation, currentAssistantMessage, currentReasoningMessage
- currentToolDraftActive
- modelUsage, maxContextTokens, currentModelId
- isProcessing, isStopping, stopClickedAt
- processingRunIds, streamingBuffersRef
- chatTabs, activeChatTabId, chatViewStateByTab
- chatViewportAnchorByTab, chatDraftsRef
- chatScrollTopByTabRef, cavemanByTabRef
- selectedModelByTabRef, initialChatContextByTabRef
- toolOpenByTab
- pendingPermissionRequests, pendingAskHumanRequests
- allPermissionRequests, permissionResponses
- agentId, presetMessage
```

**Handlers to move:**
```typescript
- handlePromptSubmit (lines 2791-3080)
- handleRunEvent (lines 2245-2633)
- handleStop (lines 3219-3233)
- handleNewChat (lines 3289-3323)
- handlePermissionResponse (lines 3235-3272)
- handleAskHumanResponse (lines 3274-3287)
- loadRun (lines 2011-2222)
- handlePromptSubmitRef (line 3081)
- All chat tab operations (switch/close/openChatInNewTab)
- handleToggleCaveman
- All streaming buffer operations (getStreamingBuffer, appendStreamingBuffer)
```

**API exposed by ChatContext:**
```typescript
interface ChatContextValue {
  // State
  runId: string | null;
  conversation: ConversationItem[];
  currentAssistantMessage: string;
  currentReasoningMessage: string;
  isProcessing: boolean;
  isStopping: boolean;
  modelUsage: LanguageModelUsage | null;
  maxContextTokens: number;
  currentModelId: string | null;
  chatTabs: ChatTab[];
  activeChatTabId: string;
  chatViewStateByTab: Record<string, ChatTabViewState>;
  chatViewportAnchorByTab: Record<string, ChatViewportAnchorState>;
  processingRunIds: Set<string>;
  runs: RunListItem[];
  allPermissionRequests: Map<string, ToolPermissionRequestEvent>;
  permissionResponses: Map<string, 'approve' | 'deny'>;
  presetMessage: string | undefined;

  // Actions
  submitMessage: (message: PromptInputMessage, ...) => Promise<void>;
  stopProcessing: () => Promise<void>;
  newChat: () => void;
  loadRun: (id: string) => Promise<void>;
  loadRuns: () => Promise<void>;
  switchChatTab: (tabId: string) => void;
  closeChatTab: (tabId: string) => void;
  openChatInNewTab: (runId: string) => void;
  respondToPermission: (toolCallId: string, ...) => Promise<void>;
  respondToAskHuman: (toolCallId: string, ...) => Promise<void>;
  toggleCaveman: (tabId: string) => void;
  setPresetMessage: (msg: string | undefined) => void;
  setChatDraftForTab: (tabId: string, text: string) => void;
  getChatDraftForTab: (tabId: string) => string | undefined;
  setSelectedModelForTab: (tabId: string, model: SelectedModel | null) => void;
}
```

### Step 2: Extract WorkspaceContext

Move file/workspace state into `apps/renderer/src/contexts/workspace-context.tsx`:

**State to move:**
```typescript
- workspaceRoot
- hasVault
- selectedPath, fileContent, editorContent
- tree, expandedPaths
- editorContentByPath, initialContentByPathRef
- frontmatterByPathRef
- fileTabs, activeFileTabId
- editorSessionByTabId, fileHistoryHandlersRef
- versionHistoryPath, viewingHistoricalVersion
- isSaving, lastSaved
- baseConfigByPath
- canvasDataByPath
- recentWikiFiles
```

**Handlers to move:**
```typescript
- handleEditorChange (lines 1363-1381)
- loadDirectory (lines 1411-1429)
- The auto-save effect (lines 1790-1969)
- File tabs operations (open/switch/close)
- toggleExpand (lines 4877-4929)
- handleBaseConfigChange, handleBaseSave
- handleImageUpload
- Wiki link operations
```

### Step 3: Extract NavigationContext

Move view navigation into `apps/renderer/src/contexts/navigation-context.tsx`:

**State to move:**
```typescript
- isGraphOpen, isBrowserOpen, isCanvasOpen, isCanvasesOpen
- isSuggestedTopicsOpen, isArtifactsOpen, isCalendarOpen
- isChatSidebarOpen, isRightPaneMaximized
- expandedFrom, activeShortcutPane
- viewHistory (back/forward stacks)
```

**Handlers to move:**
```typescript
- navigateToView (lines 4206-4339)
- navigateBack/navigateForward (lines 4370-4408)
- applyViewState (lines 4206-4339)
- All ensure*FileTab functions
- toggleKnowledgePane, toggleRightPaneMaximize
- handleOpenFullScreenChat, handleCloseFullScreenChat
- navigateToFullScreenChat
- handleToggleBrowser
```

### Step 4: Extract VoiceContext

Move into `apps/renderer/src/contexts/voice-context.tsx`:

```typescript
- voiceAvailable, ttsAvailable
- ttsEnabled, ttsMode
- isRecording
- voiceTextBufferRef, spokenIndexRef
- handleStartRecording, handleSubmitRecording
- handleCancelRecording, handleToggleTts
- handleTtsModeChange
- refreshVoiceAvailability
```

### Step 5: Extract ResearchContext

Move into `apps/renderer/src/contexts/research-context.tsx`:

```typescript
- handleCopyResearch, handleDeleteResearch
- handleDiscussResearch, handlePanelDiscussResearch
- handleOpenResearchHtml, handleShowResearchInPanel
- handleResearchCancelInChat
```

### Step 6: Slim down App.tsx

After extracting all contexts, App.tsx should only:

1. Render `<SidebarProvider>` and the layout shell (sidebar + inset + chat sidebar)
2. Render `<ViewRouter>` that switches on a single `viewState`
3. Compose the contexts:

```tsx
function App() {
  return (
    <TooltipProvider>
      <SidebarSectionProvider>
        <NavigationProvider>
          <WorkspaceProvider>
            <ChatProvider>
              <VoiceProvider>
                <ResearchProvider>
                  <ShellLayout />
                  <CommandPalette />
                  <OnboardingModal />
                  <Toaster />
                </ResearchProvider>
              </VoiceProvider>
            </ChatProvider>
          </WorkspaceProvider>
        </NavigationProvider>
      </SidebarSectionProvider>
    </TooltipProvider>
  );
}
```

### Step 7: Extract view components

The massive `AnimatePresence` switch at lines 6104-6861 should become a separate component:

```tsx
function ViewRouter({ viewKey, viewState }: { viewKey: string; viewState: ViewState }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={viewKey} ...>
        {viewState.type === 'file' && <FileView />}
        {viewState.type === 'graph' && <GraphView />}
        {viewState.type === 'browser' && <BrowserView />}
        {viewState.type === 'chat' && <ChatView />}
        {viewState.type === 'canvas' && <CanvasView />}
        {viewState.type === 'calendar' && <CalendarView />}
        ...
      </motion.div>
    </AnimatePresence>
  );
}
```

Each view component reads from the relevant context.

## Migration Strategy

Do not do a big-bang rewrite. Extract one context at a time, validate it works:

1. **VoiceContext first** — smallest, fewest dependencies, least risky
2. **NavigationContext** — middle risk, unlocks better view switching
3. **WorkspaceContext** — large but well-bounded (file ops are self-contained)
4. **ChatContext** — most complex, do last when pattern is proven
5. **ResearchContext** — small, depends on ChatContext
6. **View Router + component extraction**

Each step:
- Create the context file
- Move state and handlers
- Export the context + provider + hook
- Wrap App.tsx in the new provider
- Replace inline state uses with `useYourContext()`
- Run lint, verify no regressions

## Performance Note

Context extraction is itself the biggest performance win in the entire app. Currently a keystroke in the editor re-renders App.tsx → SidebarContentPanel → chat-sidebar → conversation list → graph (if mounted) → everything. After extraction:

- Keystroke only re-renders WorkspaceContext consumers (editor + save indicator)
- Streaming token only re-renders ChatContext consumers (conversation list)
- Sidebar toggle only re-renders NavigationContext consumers (sidebar + header padding)

Each context should use `useSyncExternalStore` or a library (Zustand/Jotai) that provides automatic render scoping — components only re-render when the specific slice they read changes.

**Apply `React.memo` aggressively during extraction.** Every context-dependent component that doesn't change on every state update should be wrapped:

```typescript
const FileTree = React.memo(function FileTree({ tree, expandedPaths, ... }) {
  // Only re-renders when tree or expandedPaths change
});

// But NOT:
const ChatStreamingMessage = React.memo(function ChatStreamingMessage({ text }) {
  // This changes on every token — memo overhead exceeds benefit
});
```

Rule: memo components whose props change rarely (<1x/second). Don't memo components that change on every frame or every keystroke.

## Verification

1. App compiles with `npm run lint`
2. All existing features work: chat, files, graph, canvas, calendar, voice, research
3. App.tsx is <500 lines
4. Each context file is <800 lines
5. No regressions in the chat input submit flow (most complex path)
6. **Performance:** Adding `useRenderCount` to 5 key components shows they only re-render on their specific state changes (see [01-Performance.md Step 1](01-Performance.md))

## Dependencies

- Blocks: [03-View-Switching.md](03-View-Switching.md), [04-State-Management-Scope.md](04-State-Management-Scope.md)
- Related: [05-Duplicate-Rendering-Logic.md](05-Duplicate-Rendering-Logic.md) (do after contexts exist so the shared rendering can live in ChatContext)
- Performance: [01-Performance.md](01-Performance.md) Steps 2-3 (memo + streaming optimization) should happen during or immediately after context extraction
