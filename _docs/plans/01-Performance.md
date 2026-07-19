# Plan 01: Performance & Efficiency

## Problem

The app has never been profiled or optimized for performance. Several known patterns are wasteful:

**Re-render cascade** — App.tsx holds ~200 state variables in one component. Every state change (e.g., typing in the editor, receiving a streaming token) re-renders the entire tree: sidebar, header, file tree, graph, canvas — even components that didn't change. This is the single biggest performance tax.

**Unnecessary re-renders in chat** — Every streaming token (`setCurrentAssistantMessage`) triggers a re-render of the full conversation list, not just the new token. With a 500-message conversation, this can drop below 30fps during streaming.

**Bundle size** — No bundle analysis has ever been run. Heavy libraries (TipTap, pdfjs-dist, Framer Motion, PostHog, Streamdown) may be inflating the critical path.

**Memory growth** — NDJSON run logs grow unbounded. Editor content for every opened file is cached in memory forever (no LRU eviction). DOM nodes accumulate in long chat sessions.

**File tree rebuild** — Every workspace change (create/delete/rename file) rebuilds the entire tree from scratch via recursive readdir, then re-renders the full sidebar tree.

**Main thread blocking** — IPC handlers run on the main process's main thread. Heavy operations (knowledge graph build, PDF parsing, directory traversal) block window management.

## Targets

| Metric | Current | Target | How |
|--------|---------|--------|-----|
| Chat streaming frame rate | Unknown (likely <30fps with long history) | 60fps steady | Memoize conversation items, virtualize list |
| App cold start | Unknown | <2s to interactive | Lazy-load non-critical features |
| File tree rebuild | Full tree rebuild on every change | Targeted update (insert/remove one node) | Differential tree update |
| Memory with 100-chat run | Unknown | <200MB | Truncate run logs, LRU editor cache |
| Re-render on keystroke | Full app re-render | Only editor re-renders | Split state into contexts |
| Bundle size (renderer) | Unknown | <500KB gzipped critical | Code-split heavy deps |
| IPC response time (workspace:stat) | Unknown | <10ms | Ensure sync paths don't block |

## Implementation

### Step 1: Profile current state (do first, informs everything)

Before any optimization, measure:

```typescript
// Add a dev-only performance monitor
// apps/renderer/src/lib/perf-monitor.ts
export function useRenderCount(name: string) {
  const count = useRef(0);
  count.current++;
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug(`[perf] ${name} rendered ${count.current} times`);
    }
  });
}

// Add to App.tsx temporarily:
useRenderCount('App');
// Add to chat-sidebar.tsx:
useRenderCount('ChatSidebar');
// Add to each context/view as extraction happens
```

Also run:
- Chrome DevTools Performance tab during chat streaming
- `npx vite-bundle-visualizer` in `apps/renderer` to see bundle composition
- `process.memoryUsage()` in main process after 1 hour of use

### Step 2: Stop the re-render cascade (highest ROI)

The single biggest win. Currently App.tsx re-renders everything on every state change.

**Immediate fixes (before context extraction):**

```typescript
// 2a. Wrap heavy children in React.memo
const ChatSidebarMemo = React.memo(ChatSidebar);
const SidebarContentPanelMemo = React.memo(SidebarContentPanel);

// 2b. Extract expensive inline computations into memoized values
// Lines 6491-6657: the conversation item  mapping + permission entries
// Currently computed inline during render. Extract:
const conversationNodes = useMemo(() => {
  return buildConversationNodes(tabState);
}, [tabState.conversation, tabState.allPermissionRequests, ...]);

// 2c. Split the streaming update path
// Current: setCurrentAssistantMessage(prev => prev + delta) on every token
// This re-renders App.tsx + ChatSidebar + all children on every ~50ms token
// Fix: use a separate "streaming" component that only renders the streaming text
// The conversation list doesn't need to re-render for new tokens — only the last message div needs to update.
```

**Streaming component extraction (critical)**

Create `apps/renderer/src/components/ai-elements/streaming-message.tsx`:

```typescript
// This component manages its own streaming text via ref
// so parent re-renders don't affect streaming smoothness
export function StreamingMessage({ runId }: { runId: string }) {
  const [text, setText] = useState('');
  const textRef = useRef('');
  
  useEffect(() => {
    const cleanup = window.ipc.on('runs:events', (event) => {
      if (event.type === 'llm-stream-event' && event.event.type === 'text-delta') {
        textRef.current += event.event.delta;
        // Throttle React updates to every 100ms max
        if (!throttleTimer) {
          throttleTimer = requestAnimationFrame(() => {
            setText(textRef.current);
            throttleTimer = null;
          });
        }
      }
    });
    return cleanup;
  }, [runId]);

  return <MessageResponse>{text}</MessageResponse>;
}
```

This prevents every streaming token from re-rendering the entire App component.

### Step 3: Memoize conversation list

**Virtualize the conversation** — For long conversations (>50 messages), only render visible messages:

```bash
cd apps/renderer && pnpm add @tanstack/react-virtual
```

Or simpler: use `React.memo` with `useMemo` on the conversation rendering path:

```typescript
// Before: conversationNodes built inline during render (lines 6491-6657)
// After:
const ConversationBody = React.memo(function ConversationBody({
  items,
  allPermissionRequests,
  permissionResponses,
  // ...
}: {
  items: ConversationItem[];
  // ...
}) {
  // All the rendering logic lives here, memoized
});

// Usage:
<ConversationBody
  items={conversation}
  allPermissionRequests={allPermissionRequests}
  permissionResponses={permissionResponses}
/>
```

This alone prevents the conversation from re-rendering when unrelated state (sidebar open/close, focus mode, etc.) changes.

### Step 4: Differential file tree updates

Current (App.tsx:1493-1569): every workspace change reloads the entire tree:

```typescript
const needsTreeReload = event.type !== "changed";
if (needsTreeReload) {
  loadDirectory().then(setTree);  // Full recursive readdir + tree build
}
```

Replace with targeted updates:

```typescript
case "created": {
  // Fetch stat for the new entry, insert into existing tree
  const entry = await window.ipc.invoke("workspace:stat", { path: event.path });
  setTree(prev => insertIntoTree(prev, entry));
  break;
}
case "deleted": {
  setTree(prev => removeFromTree(prev, event.path));
  break;
}
case "moved": {
  setTree(prev => moveInTree(prev, event.from, event.to));
  break;
}
```

This requires:
1. `insertIntoTree`, `removeFromTree`, `moveInTree` functions in `lib/file-tree.ts`
2. The tree to be stored as a `Map<string, TreeNode>` for O(1) lookups instead of recursive search

### Step 5: LRU editor content cache

Current (App.tsx:714-717): `editorContentByPath` stores content for every file ever opened, never evicts.

```typescript
// Replace Map with LRU
import { LRUCache } from 'lru-cache'; // or implement simple

const editorCache = new LRUCache<string, string>({
  max: 50, // Keep at most 50 file drafts in memory
  ttl: 1000 * 60 * 30, // Evict after 30 minutes of inactivity
});
```

### Step 6: Limit NDJSON run log growth

In `core/src/runs/repo.ts`, after N entries (e.g., 2000), truncate:

```typescript
const MAX_LOG_EVENTS = 2000;

async function appendToRun(runId: string, event: RunEvent) {
  // ... write event ...
  // After write, check total line count
  const lineCount = await countLines(runLogPath(runId));
  if (lineCount > MAX_LOG_EVENTS * 1.5) {
    // Truncate oldest events, keeping the most recent MAX_LOG_EVENTS
    await truncateLog(runLogPath(runId), MAX_LOG_EVENTS);
  }
}
```

On the renderer side, when loading a run with many events, batch-process:

```typescript
// Instead of processing 5000 events synchronously in the IPC handler:
// Chunk the processing and yield between chunks
for (let i = 0; i < events.length; i += 100) {
  processBatch(events.slice(i, i + 100));
  await new Promise(r => setTimeout(r, 0)); // Yield to event loop
}
```

### Step 7: Bundle optimization

Run bundle analysis:

```bash
cd apps/renderer && pnpm add -D vite-bundle-visualizer
npx vite-bundle-visualizer
```

Look for:
- **Large dependencies in critical path:** pdfjs-dist (~5MB), Framer Motion (~150KB), PostHog, TipTap extensions
- **Duplicate dependencies:** Same lib bundled multiple times across packages
- **Unused imports:** Barrel exports from `lucide-react`, `@radix-ui/*` importing all variants

**Code-split aggressively:**

```typescript
// Current: React.lazy used only for PdfViewer, GraphView, CanvasView
// Add: Lazy-load all heavy views
const LazyCalendarView = React.lazy(() => import("./components/calendar-view"));
const LazyGraphView = React.lazy(() => import("./components/graph-view"));
const LazyCanvasView = React.lazy(() => import("./components/canvas-view"));
const LazyPdfViewer = React.lazy(() => import("./components/pdf-viewer"));
const LazyBasesView = React.lazy(() => import("./components/bases-view"));
const LazyArtifactsView = React.lazy(() => import("./components/artifacts-view"));
```

**Tree-shake icon imports:**

```typescript
// Bad (imports entire lucide-react):
import { CheckIcon, LoaderIcon, PanelLeftIcon } from "lucide-react";

// Better (individual imports — Vite usually handles this, but verify):
import CheckIcon from "lucide-react/dist/esm/icons/check";
```

### Step 8: Debounce/sync IPC paths

Some IPC handlers perform heavy synchronous work. Audit these in `apps/main/src/ipc.ts`:

| Handler | Risk | Fix |
|---------|------|-----|
| `workspace:stat` | File system call, fast (<1ms) | OK |
| `workspace:readdir` | Recursive can be slow on large vaults | Limit depth, paginate |
| `knowledge-graph:buildWiki` | Builds full graph, can take seconds | Show loading state, run in worker |
| `pdf:*` | Heavy parsing | Ensure off main process |
| `runs:list` | Paginated, OK | Add cursor index |

For handlers that block, add timeout warnings in dev mode:

```typescript
// apps/main/src/utils/perf-warn.ts
export function withPerfWarning<T>(name: string, fn: () => Promise<T>, thresholdMs = 100): Promise<T> {
  const start = performance.now();
  return fn().then(result => {
    const elapsed = performance.now() - start;
    if (elapsed > thresholdMs) {
      console.warn(`[perf] ${name} took ${elapsed.toFixed(0)}ms`);
    }
    return result;
  });
}
```

### Step 9: Image and asset optimization

- Images uploaded to `.assets/` are saved as raw base64 data URLs. For large images (>1MB), this bloats both the editor state and any markdown files they're embedded in.
- **Fix:** Resize large images client-side before saving:

```typescript
// apps/renderer/src/lib/image-optimize.ts
export async function optimizeImage(file: File, maxWidth = 1920): Promise<Blob> {
  if (file.size < 500 * 1024) return file; // Skip small images
  const img = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve as BlobCallback, 'image/webp', 0.85)!);
}
```

### Step 10: Prevent unnecessary IPC calls

Current pattern — many IPC calls on mount that could be cached or batched:

```typescript
// App.tsx:860-881 — voice:getConfig + oauth:getState fetched on every mount
// Cache these in main process and push updates instead
```

Replace request-pattern with push-pattern where possible:

```typescript
// Before: renderer asks main process for config on mount
const config = await window.ipc.invoke('voice:getConfig', null);

// After: main process pushes config to renderer when it changes
const cleanup = window.ipc.on('config:voiceChanged', (config) => {
  setVoiceConfig(config);
});
```

## Per-Feature Performance Checklist

### Chat
- [ ] Streaming tokens update only the last message DOM node, not the conversation list
- [ ] Conversation messages are virtualized (only ~20 rendered at a time)
- [ ] Message components are `React.memo`'d with proper comparison
- [ ] Run log loading is chunked to avoid blocking the renderer

### File Editor
- [ ] Editor content is cached with LRU eviction (max 50 files)
- [ ] Auto-save is debounced (already done: 500ms via useDebounce)
- [ ] File switching doesn't re-mount the editor component unnecessarily

### File Tree
- [ ] Tree updates are differential (not full rebuild)
- [ ] Tree is stored as Map for O(1) lookups
- [ ] Large directories are loaded on demand (lazy children)

### Knowledge Graph
- [ ] Graph building runs in a worker (or main process with progress updates)
- [ ] Graph canvas uses canvas/WebGL, not DOM nodes (already done)
- [ ] Node count is capped (e.g., max 500 nodes displayed)

### Search
- [ ] Search input is debounced (already done or easy to add)
- [ ] Search results are virtualized
- [ ] Search doesn't block typing

## Verification

1. **Chat streaming:** Open DevTools Performance tab, type a long message, verify <5ms frame time during streaming (no dropped frames)
2. **File tree operations:** Create 100 files, verify tree update time <10ms per operation
3. **Memory:** Load 50 files, verify memory doesn't increase by >50MB
4. **Bundle:** `npx vite-bundle-visualizer` shows `vendor.js` <500KB gzipped
5. **Cold start:** `console.time('app-ready')` from module load to first paint <2s
6. **Re-render count:** Add `useRenderCount` to 5 key components, verify they only re-render when their specific state changes
7. **IPC handlers:** No handler blocks >50ms in the main process

## Dependencies

- Blocks: [02-Break-Up-App-Tsx.md](02-Break-Up-App-Tsx.md) (Steps 2-3 of this plan should happen before or during context extraction)
- Depends on: nothing
