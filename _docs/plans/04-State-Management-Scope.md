# Plan 04: Define State Scope Boundaries

## Problem

The codebase has no clear rules about what state belongs where. The result:

1. **ChatSidebar takes 60+ props** (lines 179-262 in `chat-sidebar.tsx`). Many are passed through App.tsx from child to sibling to child. This makes the component impossible to reuse and hard to refactor.

2. **No distinction between local and shared state.** File editor content is in `editorContentByPath` (shared via context, effectively), but is also in `editorContentRef` (a ref), and `fileContent` (a separate state variable). Three copies of the same data with three update paths.

3. **Refs and state are duplicated.** Every `useState` has a corresponding `useRef` mirror (e.g., `runId` / `runIdRef`, `processingRunIds` / `processingRunIdsRef`, `ttsEnabled` / `ttsEnabledRef`). This pattern is necessary in some places but applied indiscriminately.

4. **Some state lives in the wrong scope.** `voiceTextBufferRef` (line 846) lives in App.tsx but is only used inside chat-sidebar.tsx and the streaming handler. `pendingPaletteSubmit` (line 915) is a cross-cutting concern that spans the palette and chat.

## Desired State

A documented state scope hierarchy:

```
Context/Provider (global — lives outside component tree)
  → used by multiple distant components
  → persisted across navigation
  → example: chat tabs, workspace root, OAuth state

Page/View state (lives in a view component or page-level wrapper)
  → used by one screen and its children
  → resets when navigating away
  → example: selected file, editor draft content, scroll position

Component state (lives in a single component)
  → only used by that component
  → example: dropdown open/closed, input focus, tooltip state

URL/Route state (lives in navigation state)
  → determines what the user sees
  → example: current view type, active tab
```

Each variable in the codebase should be answerable: "What scope does this belong to?" If it's in the wrong scope, move it.

## Implementation Steps

### Step 1: Audit every state variable in App.tsx

Categorize each of the ~200 state/ref variables:

| Variable | Lines | Current scope | Correct scope | Move to |
|----------|-------|---------------|---------------|---------|
| `runId` | 819 | App | Global | ChatContext |
| `selectedPath` | 710 | App | Page | WorkspaceContext or local |
| `conversation` | 810 | App | Global | ChatContext |
| `isSaving` | 790 | App | Component | MarkdownEditor (inline) |
| `lastSaved` | 791 | App | Component | MarkdownEditor (inline) |
| `tree` | 718 | App | Page/Global | WorkspaceContext |
| `isGraphOpen` | 721 | App | Global | NavigationContext |
| `isRecording` | 845 | App | Component | VoiceContext or ChatInput |
| `versionHistoryPath` | 800 | App | Component | VersionHistoryPanel |
| `editorContentByPath` | 714 | App | Wrong | Should be per-file, not flat map |
| `modelUsage` | 816 | App | Global | ChatContext |

### Step 2: Move component-scoped state out of App.tsx

**`isSaving` / `lastSaved`** — These are only used in the header (lines 5941-5953). Either:
- Move them into a `SaveIndicator` component that reads from a simple callback
- Or keep them in App.tsx until WorkspaceContext extraction, but remove from any intermediate component props

**`versionHistoryPath` / `viewingHistoricalVersion`** — These are only used in the version history panel. The panel should manage its own state via a simpler interface:

```typescript
// Current: App.tsx manages path, content, and navigated version
// Desired: VersionHistoryPanel manages its own state
<VersionHistoryPanel
  path={selectedPath}
  onRestore={(oid) => { /* App.tsx handles file reload */ }}
/>
```

**`externalBaseSearch`** (line 4481-4483) — Only used by BasesView. Pass as prop directly, don't store in App.tsx.

### Step 3: Eliminate unnecessary ref mirrors

Every `useState` + `useRef` pair needs justification. For each:

```typescript
// Is the ref actually needed in an async callback or event handler?
// If yes → keep (e.g., runIdRef for run event handlers)
// If no → remove the ref, use state directly

// Examples of NECESSARY refs:
runIdRef — used in IPC event handlers (lines 2246-2247)
processingRunIdsRef — used in useCallback that reads latest value (line 2248)

// Examples of UNNECESSARY refs:
ttsEnabledRef — could use ttsEnabled directly if TTS handlers use state setter
voiceRef — voice object doesn't change identity, ref adds complexity
```

After removing unnecessary refs, update comments on the remaining ones explaining *why* they're needed.

### Step 4: Document the scope rules

Add to `_docs/plans/state-scope-rules.md`:

```markdown
# State Scope Rules

## Global (React Context)
- Chat tabs, active tab, conversation history
- Workspace root, vault state, file tree
- Navigation view state, back/forward stacks
- Voice/TTS availability flags
- OAuth/sign-in state

## Page/View (local state in view component)
- Selected file path
- Editor draft content (cached per file)
- Scroll positions
- Active search/filter terms

## Component (local state in the component itself)
- Dropdown open/closed
- Popover visible/hidden
- Save status indicator
- Recording button state
- Resize handle dragging

## Rules
1. If a variable is read by exactly one component → it's component state.
2. If a variable is read by multiple siblings or far-apart components → it's context state.
3. If a variable resets on navigation → it's page state.
4. If a variable persists across navigation → it's global state.
5. Ref mirrors are ONLY justified when the value is read inside an async callback or IPC event handler that would capture a stale closure.
```

### Step 5: Fix the `editorContent` triple-store

Currently, editor content for the active file is stored in three places:

```typescript
const [editorContent, setEditorContent] = useState("");       // line 712
const editorContentRef = useRef<string>("");                  // line 713
const [editorContentByPath, setEditorContentByPath] =         // line 714
  useState<Record<string, string>>({});
const editorContentByPathRef = useRef<Map<string, string>>(new Map()); // line 717
```

This is because:
- `editorContent` drives the active editor re-render
- `editorContentRef` is used in auto-save callback (avoids stale closure)
- `editorContentByPath` persists drafts when switching files
- `editorContentByPathRef` mirrors it for callbacks

**Fix:** Consolidate to a single `MapRef` that also triggers renders:

```typescript
// Use a single source of truth
const editorContentManager = useEditorContentManager();

// Inside useEditorContentManager:
// - Store drafts in a Map<string, string>
// - Expose get(path), set(path, content), remove(path)
// - Track "active path" separately
// - The auto-save callback reads from the map directly (no stale closure risk)
```

## Verification

1. Every state variable in App.tsx has a documented scope
2. No variable is duplicated across two stores
3. ChatSidebar receives <20 props
4. `editorContent` triple-store is eliminated
5. All unnecessary `useRef` mirrors are removed
6. The state-scope-rules.md file exists and is referenced in PR reviews

## Dependencies

- Depends on: [02-Break-Up-App-Tsx.md](02-Break-Up-App-Tsx.md) (this is a subset of the extraction work)
- Blocks: nothing
