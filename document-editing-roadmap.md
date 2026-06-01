# Document Editing Features — Implementation Plan

This document outlines a phased plan for porting key document editing features from Odysseus into ScholarOS. Each feature includes the problem it solves, implementation approach, files to modify/create, key design decisions, and effort estimate.

---

## Table of Contents

1. [Phase 1: Foundation Features (Quick Wins)](#phase-1-foundation-features-quick-wins)
   - [1.1 Auto-save with Debounce](#11-auto-save-with-debounce)
   - [1.2 Word / Character Count in Status Bar](#12-word--character-count-in-status-bar)
   - [1.3 Find / Replace](#13-find--replace)
   - [1.4 Fullscreen / Distraction-Free Mode](#14-fullscreen--distraction-free-mode)
   - [1.5 Drag-to-Reorder Tabs](#15-drag-to-reorder-tabs)
2. [Phase 2: Advanced Features](#phase-2-advanced-features)
   - [2.1 Version Diff View (LCS-Based)](#21-version-diff-view-lcs-based)
   - [2.2 Multi-Language Editing & Syntax Highlighting](#22-multi-language-editing--syntax-highlighting)
   - [2.3 HTML / CSS Preview](#23-html--css-preview)
3. [Appendix: Architecture Patterns](#appendix-architecture-patterns)

---

## Phase 1: Foundation Features (Quick Wins)

These can be built in 0.5–2 days each and provide immediate quality-of-life improvements.

---

### 1.1 Auto-save with Debounce

**Problem:** ScholarOS currently saves on every keystroke via the `onChange` → `debouncedContent(500ms)` → `workspace:writeFile` IPC pipeline. This works but has no version coalescing — every save creates a new git commit, flooding the history with noise during rapid typing. There's also no visual feedback beyond "Saving..." / "Saved" in the header.

**Approach:**

1. **Add version coalescing to the save pipeline** (in `App.tsx` around the existing auto-save `useEffect` at line 1682):
   - Track `lastSaveTimestamp` per file in a `Ref<Map<string, number>>`.
   - If the last save was <60 seconds ago AND the source was a user edit (not AI), skip creating a git commit. Only update the file on disk and reset the dirty flag.
   - After 60 seconds of inactivity, the next save triggers a commit.
   - This mirrors Odysseus's `VERSION_COALESCE_SECONDS = 60` pattern.

2. **Improve save indicator:**
   - Replace the current `isSaving` / `lastSaved` boolean with a 3-state enum: `"unsaved" | "saving" | "saved"`.
   - Show a dot indicator on the tab when unsaved (common IDE pattern).
   - Keep the existing header indicator but add a subtle dot on the tab bar.

3. **Prevent save on no-op:**
   - If `debouncedContent === baseline`, skip the entire save. This is already partially done, but add a content-identity check (Odysseus does this server-side).

**Files to modify:**
- `apps/renderer/src/App.tsx` — Add coalescing logic, tab dirty dot
- `apps/renderer/src/components/tab-bar.tsx` — Accept `isDirty` prop per tab, render dot

**Key patterns from Odysseus:**
- `VERSION_COALESCE_SECONDS = 60` in `document_routes.py:499`
- Silent saves (`{ silent: true }`) to avoid toast spam

**Effort:** 1 day

---

### 1.2 Word / Character Count in Status Bar

**Problem:** Academic users need word/character counts for meeting page limits. ScholarOS has no such statistics anywhere in the editor.

**Approach:**

1. **Create a `StatusBar` component** rendered inside `markdown-editor.tsx` below the editor content:
   ```
   ┌─────────────────────────────────────┐
   │ [editor toolbar]                     │
   ├─────────────────────────────────────┤
   │ [editor content]                     │
   ├─────────────────────────────────────┤
   │ Words: 1,234  │  Chars: 8,765  │ Ln 42, Col 12 │
   └─────────────────────────────────────┘
   ```

2. **Compute stats from the ProseMirror document** (not from serialized markdown) to stay accurate in WYSIWYG mode:
   - **Words:** Count whitespace-separated tokens from `editor.state.doc.textContent`.
   - **Characters:** `editor.state.doc.textContent.length` (or `[...text].length` for grapheme-aware).
   - **Cursor position:** Listen to `selectionUpdate` on the editor — track `editor.state.selection.anchor` and compute line/column from the doc.

3. **Update on every selection change + debounced document change:**
   - Use a `useEffect` reacting to `editor.on('selectionUpdate', ...)` and `editor.on('update', ...)`.
   - Throttle to 100ms to avoid excessive re-renders.

4. **Styling:**
   - Fixed-height bar at the bottom of the `.tiptap-editor` flex column.
   - Small font (`text-xs`), `text-muted-foreground`, right-aligned stats.

5. **Optional: Show estimated reading time** (e.g., "5 min read" at 200 wpm) as a bonus academic-friendly stat.

**Files to create/modify:**
- `apps/renderer/src/components/editor-status-bar.tsx` (NEW)
- `apps/renderer/src/components/markdown-editor.tsx` — Import and render below wrapper

**Key patterns from Odysseus:**
- `chat.js` line 1194: `charCount` display (simple `text.length`)
- Odysseus editor status bar shows word + char count

**Effort:** 0.5 day

---

### 1.3 Find / Replace

**Problem:** No way to search within a document. For academic users working with long papers, this is essential.

**Approach:**

1. **Create a `FindReplaceBar` component** rendered between the toolbar and the editor content in `markdown-editor.tsx`:
   ```
   ┌─────────────────────────────────────┐
   │ [toolbar]                            │
   ├─────────────────────────────────────┤
   │ Find: [____________] [▼] [▲] [3/7] [✕] │
   │ Replace: [________] [Replace] [All]   │
   ├─────────────────────────────────────┤
   │ [editor content with highlights]     │
   └─────────────────────────────────────┘
   ```
   The bar is hidden by default and toggled via `Cmd+F` / `Ctrl+F`.

2. **Implement search using ProseMirror's decoration system** (not string manipulation on markdown):
   - Create a `Plugin` with a `DecorationSet` that wraps matching text in `<mark>` decorations.
   - The plugin watches `editor.state.doc` for changes and re-computes matches.
   - Store match positions as a sorted array of `{from, to}`.
   - Track `currentMatchIndex` in React state, update on next/prev.

3. **Search behavior:**
   - **Live search** — results update as you type (debounced at 150ms).
   - **Case-insensitive** by default, with a toggle button for case-sensitive.
   - **Next / Prev** buttons cycle through matches, scrolling the match into view via `editor.commands.scrollIntoView()` and setting `editor.commands.setTextSelection(matchPos)`.
   - **Match counter** shows "N of M" in the bar.

4. **Replace behavior:**
   - **Replace One:** Replace current match, advance to next.
   - **Replace All:** Replace every match in the document.
   - Use `editor.chain().focus().deleteRange({from, to}).insertContent(replacement).run()` for each replacement.

5. **Keyboard shortcuts:**
   - `Cmd+F` / `Ctrl+F` — open find bar, auto-focus input
   - `Enter` in find input — next match
   - `Shift+Enter` in find input — previous match
   - `Escape` — close find bar, refocus editor
   - `Cmd+Shift+F` / `Ctrl+Shift+F` — open replace section

6. **Styling:**
   - Highlight color: use CSS `--primary` with `0.2` opacity for inactive matches, `0.4` for active match.
   - The ProseMirror editor may need `scroll-margin` or the plugin can call `editor.commands.scrollIntoView()`.

**Files to create/modify:**
- `apps/renderer/src/components/find-replace-bar.tsx` (NEW)
- `apps/renderer/src/plugins/find-replace-plugin.ts` (NEW) — ProseMirror plugin with DecorationSet
- `apps/renderer/src/components/markdown-editor.tsx` — Import bar, add keyboard handler for Cmd+F
- `apps/renderer/src/styles/editor.css` — Styles for `.find-match`, `.find-match-active`

**Key patterns from Odysseus:**
- `_openFindBar` / `_doFind` in `document.js:4477` — input, match counter, prev/next
- `renderFindRects` in `document.js:5862` — mirror-div technique (not needed with ProseMirror — decorations handle this natively)
- `applyFindMarks` in `document.js:5923` — walk text nodes for hits

**Why ProseMirror approach is better than Odysseus's textarea approach:**
Odysseus had to use a mirror-div hack to measure text positions. ProseMirror exposes the document as a structured tree — decorations can mark exact text positions, and `scrollIntoView` handles scrolling. This is a cleaner, more robust implementation.

**Effort:** 2 days

---

### 1.4 Fullscreen / Distraction-Free Mode

**Problem:** No way to hide the sidebar and focus solely on writing. The existing `Cmd+L` toggles a "fullscreen chat" mode but does not apply to the document editor.

**Approach:**

1. **Add a fullscreen toggle to the editor toolbar** (a new button in `editor-toolbar.tsx`):
   - Icon: `Maximize2Icon` / `Minimize2Icon` (from lucide-react)
   - Action: calls a new `onToggleFullscreen` prop callback

2. **In `markdown-editor.tsx`:**
   - Accept a new prop `fullscreen?: boolean` and `onToggleFullscreen?: () => void`.
   - When `fullscreen=true`, add a `.doc-fullscreen` CSS class to the root `.tiptap-editor` element.

3. **In `App.tsx`:**
   - Manage `isFullscreen` state for the editor.
   - When fullscreen, hide the left sidebar, chat sidebar, and file tree. Only the editor and its toolbar are visible.
   - CSS: toggle a class on `<body>` that hides `.sidebar-content-panel` and `.chat-sidebar`, and makes `.tiptap-editor` fill the entire viewport.

4. **Keyboard shortcut:**
   - `Cmd+Shift+F` / `Ctrl+Shift+F` (if Find is not using this) or `F11` — toggle fullscreen.
   - Ensure escape exits fullscreen.

5. **Escape hatch:**
   - A floating "Exit fullscreen" button (small X in top-right corner) appears on hover at the top of the screen.
   - Esc key exits fullscreen.

**Files to modify:**
- `apps/renderer/src/components/editor-toolbar.tsx` — Add fullscreen button with `onToggleFullscreen` prop
- `apps/renderer/src/components/markdown-editor.tsx` — Accept fullscreen prop, apply class
- `apps/renderer/src/App.tsx` — Manage fullscreen state, wire keyboard shortcut, toggle layout
- `apps/renderer/src/styles/editor.css` — `.doc-fullscreen` styles

**Key patterns from Odysseus:**
- `toggleFullscreen` in `document.js:8041` — `.doc-fullscreen` CSS class, collapsible sidebar
- Chevron affordance for exit (hover-based)

**Effort:** 0.5 day

---

### 1.5 Drag-to-Reorder Tabs

**Problem:** The file tab bar currently renders tabs in fixed order. Users cannot reorganize tabs to match their workflow.

**Approach:**

1. **Modify `TabBar` component** to support drag-and-drop reordering:
   - Add `onReorderTabs?: (tabs: T[]) => void` prop.
   - When provided, each `<button>` tab gains `draggable="true"` and drag event handlers.
   - Use native HTML5 Drag and Drop (no library needed — Odysseus uses the same approach).

2. **Drag behavior:**
   - `dragstart`: set `dataTransfer` with the tab ID, add `.dragging` CSS class.
   - `dragover`: add `.drag-over` class to the hovered tab, prevent default to allow drop.
   - `drop`: swap the dragged tab's position with the drop target's position in the `tabs` array, call `onReorderTabs` with the new array.
   - `dragend`: clean up classes.

3. **Visual feedback:**
   - Dragged tab: `opacity-50`, slightly scaled down.
   - Drop target: subtle highlight on the left/right edge indicator (a 2px bar) showing where the tab will land.
   - Smooth CSS transitions on the tab positions.

4. **In `App.tsx`:**
   - Wire `onReorderTabs` to call `setFileTabs(newOrder)`.
   - Since `fileTabs` is the canonical ordering, this automatically updates rendering.

5. **Touch support (optional — can defer):**
   - Use `onTouchStart/Move/End` with `touch-action: none` for a basic mobile implementation, or punt to a follow-up.

**Files to modify:**
- `apps/renderer/src/components/tab-bar.tsx` — Add drag/drop handlers, new prop
- `apps/renderer/src/App.tsx` — Wire `onReorderTabs` callback
- `apps/renderer/src/styles/editor.css` (or a global CSS file) — `.dragging`, `.drag-over` classes

**Key patterns from Odysseus:**
- `initTabDragReorder` in `document.js:470` — native HTML5 drag/drop, `dragstart/dragover/drop/dragend`
- `_tabOrder` array reorder on drop

**Effort:** 1 day

---

## Phase 2: Advanced Features

These are 3-5 day features that require deeper integration but transform the editor's capabilities.

---

### 2.1 Version Diff View (LCS-Based)

**Problem:** The current `VersionHistoryPanel` shows a flat list of commits with timestamps. Clicking one loads the old content. There is no visual diff — users cannot see what changed between versions.

**Approach:**

1. **Implement a LCS (Longest Common Subsequence) line diff algorithm:**
   - Write `computeLineDiff(oldLines: string[], newLines: string[])` that returns an array of chunks:
     ```ts
     type DiffChunk = {
       type: "equal" | "insert" | "delete";
       oldStart: number; newStart: number;
       lines: string[];
     };
     ```
   - Use the standard Smith-Waterman DP table approach with `Uint16Array` for memory efficiency (same as Odysseus).
   - Optionally: use the `diff` npm package instead of hand-rolling (more robust, handles edge cases).

2. **Create a `DiffView` component** that renders two panels side-by-side:
   ```
   ┌──────────────────────┬──────────────────────┐
   │     OLD (v2)         │     NEW (v3)         │
   ├──────────────────────┼──────────────────────┤
   │ This is some text.   │ This is some text.   │
   │ Old line here.       │ │ New line here.     │
   │ Another line.        │ Another line.        │
   │                      │ │ Added paragraph.   │
   └──────────────────────┴──────────────────────┘
   ```
   - Deletions shown in red background on the left.
   - Additions shown in green background on the right.
   - Unchanged lines shown normally on both sides.
   - A gutter line connects corresponding deletions/additions.

3. **Integrate with existing `VersionHistoryPanel`:**
   - When a user clicks a version and the "Show diff" button, open the `DiffView` as a modal or expanded panel.
   - Add "Compare with current" and "Compare with previous" buttons to each version entry.
   - Show diff stats (e.g., "+12 / -3 lines") in the version list item itself — compute by comparing consecutive versions.

4. **ProseMirror integration (optional stretch):**
   - For a more refined experience, render the diff using ProseMirror decorations (red/green background on text runs) directly in the editor, making it read-only during diff mode. This is what Odysseus does (textarea + overlay).
   - This is harder but provides a unified editing experience.

5. **Backend support:**
   - The existing `knowledge:fileAtCommit` IPC already returns full content for any commit.
   - No server changes needed — diff computation is 100% client-side.

**Files to create/modify:**
- `apps/renderer/src/lib/diff.ts` (NEW) — `computeLineDiff()` LCS implementation
- `apps/renderer/src/components/diff-view.tsx` (NEW) — Visual diff panel
- `apps/renderer/src/components/version-history-panel.tsx` — Add "Show diff" buttons, diff stats
- `apps/renderer/src/styles/editor.css` — `.diff-line-add`, `.diff-line-del`, `.diff-gutter` styles

**Key patterns from Odysseus:**
- `_computeLineDiff` in `document.js:6761` — LCS DP with `Uint16Array`
- `_buildDiffChunks` in `document.js:6796` — grouping contiguous changes
- `_renderDiffOverlay` — colored overlay lines
- `_renderDiffGutter` — per-chunk accept/reject buttons

**Effort:** 3-4 days

---

### 2.2 Multi-Language Editing & Syntax Highlighting

**Problem:** ScholarOS is exclusively a markdown editor. It cannot be used for editing code, CSV data, or other structured formats. Academic users often work with scripts (Python, R, Julia), data files (CSV, JSON), and configuration files alongside their notes.

**Approach:**

1. **Detect document language from file extension:**
   - ScholarOS already uses file paths from `notePath`. Add a helper:
     ```ts
     function getFileLanguage(path: string): "markdown" | "code" | "csv" | "json" | "yaml" | null;
     ```
   - Check extension against a map: `.md` → markdown, `.py` → code, `.csv` → csv, `.json` → json, `.r` → code, `.rmd` → markdown, etc.
   - For markdown files: use Tiptap WYSIWYG (current behavior).
   - For others: switch to a `<textarea>`-based editor with syntax highlighting overlay (the Odysseus pattern).

2. **Create a language selector** in the editor (dropdown or the existing header area):
   - When a non-markdown file is detected, show a textarea instead of `EditorContent`.
   - Apply syntax highlighting using a lightweight library like `highlight.js` or `prism.js` (both are small and support many languages).
   - Use the same overlay pattern as Odysseus: `<textarea>` on top, `<pre><code>` behind it, sync on every input event.

3. **CSV mode:**
   - When `.csv` is detected, parse the content into a table using a CSV parser (Papa Parse or built-in).
   - Show an editable table view instead of raw text.
   - Sync edits back to the CSV text representation.

4. **Code editing mode:**
   - For `.py`, `.js`, `.r`, `.sh`, etc.: show the textarea + syntax highlighting overlay.
   - Optionally: add a "Run" button (deferred — this was excluded from scope but the architecture should support adding it later).

5. **Architecture:**
   - Extract the editor decision logic into a new wrapper component `AdaptiveEditor` that renders either:
     - `MarkdownEditor` (Tiptap WYSIWYG) for `.md` files
     - `CodeEditor` (textarea + highlight.js overlay) for code files
     - `CsvEditor` (editable table) for `.csv` files
   - This preserves the existing `MarkdownEditor` component entirely untouched.

**Files to create/modify:**
- `apps/renderer/src/components/adaptive-editor.tsx` (NEW) — Router component
- `apps/renderer/src/components/code-editor.tsx` (NEW) — Textarea + syntax overlay
- `apps/renderer/src/components/csv-editor.tsx` (NEW) — Editable CSV table
- `apps/renderer/src/App.tsx` — Replace `<MarkdownEditor>` with `<AdaptiveEditor>`, pass language hints
- `apps/renderer/package.json` — Add `highlight.js` or `prismjs`

**Key patterns from Odysseus:**
- `document.js` language detection + `syncHighlighting()` — textarea overlay with `hljs.highlight()`
- Language → extension mapping for export
- CSV preview mode (`#doc-csv-preview` table)

**Effort:** 4-5 days

---

### 2.3 HTML / CSS Preview

**Problem:** No way to see a clean, rendered preview of the output. The WYSIWYG shows formatted text, but users cannot preview the final rendered HTML as it would appear in a browser or when exported.

**Approach:**

1. **Add a "Preview" toggle button** to the toolbar (next to fullscreen toggle):
   - Three-state toggle button or dropdown: `Edit` | `Split` | `Preview`.
   - **Edit mode:** Normal WYSIWYG editing (current behavior).
   - **Preview mode:** The editor becomes read-only. The content is serialized to a sandboxed `<iframe>` and rendered as HTML.
   - **Split mode:** Editor on the left, preview iframe on the right, sync scrolling.

2. **Build the preview HTML:**
   - Use the custom markdown serializer (already exists in `markdown-editor.tsx` → `blockToMarkdown`).
   - Convert the serialized markdown to HTML using the same path the export uses. If ScholarOS has a markdown→HTML converter, use it; otherwise inject a minimal one or use the existing tiptap-markdown `getMarkdown()` and render via a simple `marked` or `remark` pipeline.
   - Wrap in a clean HTML template with proper CSS reset, typography styling, and print-friendly CSS.

3. **Sandboxed iframe:**
   - Use `<iframe sandbox="allow-same-origin">` (add `allow-popups` only if needed).
   - Write the HTML content via `srcdoc` attribute or `postMessage`.
   - Apply a `width: 100%; height: 100%; border: none` style.

4. **Sync scrolling (split mode only):**
   - Listen to scroll events on the editor container and the iframe (via `postMessage`) to keep them aligned by scroll percentage.

5. **Export improvement (bonus):**
   - The preview content is effectively "what you get" — use it as the basis for PDF export (via `window.print()` in the iframe, or a print-to-PDF flow).

**Files to create/modify:**
- `apps/renderer/src/components/preview-pane.tsx` (NEW) — Iframe-based preview with scroll sync
- `apps/renderer/src/components/editor-toolbar.tsx` — Add Edit/Preview/Split toggle
- `apps/renderer/src/components/markdown-editor.tsx` — Accept `viewMode` prop, conditionally show iframe
- `apps/renderer/src/lib/markdown-to-html.ts` (NEW) — Markdown→HTML conversion for preview

**Key patterns from Odysseus:**
- `toggleHtmlPreview` in `document.js` — sandboxed iframe for rendered output
- `_htmlPreviewActive` flag, `#doc-html-preview` element

**Effort:** 2-3 days

---

## Appendix: Architecture Patterns

### Component Hierarchy (After Changes)

```
App.tsx
├── TabBar (with drag-to-reorder)
├── AdaptiveEditor (NEW — routes by file extension)
│   ├── MarkdownEditor (Tiptap WYSIWYG)
│   │   ├── EditorToolbar
│   │   │   ├── [bold, italic, headings, lists, ...]
│   │   │   ├── [Find & Replace toggle — NEW]
│   │   │   └── [Fullscreen toggle — NEW]
│   │   ├── FindReplaceBar (NEW)
│   │   ├── FrontmatterProperties
│   │   ├── EditorContent (ProseMirror)
│   │   ├── WikiLink + @mention autocomplete popovers
│   │   ├── PreviewPane (NEW — shown in Preview/Split mode)
│   │   └── StatusBar (NEW — word/char count + cursor position)
│   ├── CodeEditor (NEW — textarea + syntax overlay)
│   └── CsvEditor (NEW — editable table)
├── VersionHistoryPanel
│   └── DiffView (NEW — LCS diff with side-by-side panel)
├── ChatSidebar
└── ...
```

### ProseMirror Plugin Architecture for Find/Replace

```ts
// plugins/find-replace-plugin.ts
import { Plugin, PluginKey, DecorationSet, Decoration } from '@tiptap/pm/state';

interface FindReplaceState {
  query: string;
  matches: Array<{ from: number; to: number }>;
  currentIndex: number;
  caseSensitive: boolean;
}

export const findReplacePluginKey = new PluginKey<FindReplaceState>('find-replace');

export function createFindReplacePlugin() {
  return new Plugin({
    key: findReplacePluginKey,
    state: {
      init() { return { query: '', matches: [], currentIndex: -1, caseSensitive: false }; },
      apply(tr, prev) {
        const meta = tr.getMeta(findReplacePluginKey);
        if (meta) return { ...prev, ...meta };
        // If document changed and we have a query, re-compute matches
        if (tr.docChanged && prev.query) {
          return { ...prev, matches: computeMatches(prev.query, tr.doc, prev.caseSensitive) };
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        const pluginState = findReplacePluginKey.getState(state);
        if (!pluginState || !pluginState.matches.length) return DecorationSet.empty;
        const decorations = pluginState.matches.map((m, i) => {
          const isActive = i === pluginState.currentIndex;
          return Decoration.inline(m.from, m.to, {
            class: isActive ? 'find-match-active' : 'find-match',
          });
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
```

### LCS Diff Algorithm — Core Structure

```ts
// lib/diff.ts
export interface DiffChunk {
  type: 'equal' | 'insert' | 'delete';
  oldStart: number;
  newStart: number;
  oldLines: string[];
  newLines: string[];
}

export function computeLineDiff(
  oldText: string,
  newText: string,
): DiffChunk[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const M = oldLines.length;
  const N = newLines.length;

  // Build LCS DP table using Uint16Array (Odysseus pattern)
  const dp = new Uint16Array((M + 1) * (N + 1));
  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i * (N + 1) + j] = dp[(i - 1) * (N + 1) + (j - 1)] + 1;
      } else {
        dp[i * (N + 1) + j] = Math.max(
          dp[(i - 1) * (N + 1) + j],
          dp[i * (N + 1) + (j - 1)],
        );
      }
    }
  }

  // Backtrack to build chunks
  const chunks: DiffChunk[] = [];
  let i = M, j = N;
  const reverseChunks: DiffChunk[] = [];
  // ... backtrack DP table, build chunks in reverse
  return reverseChunks.reverse();
}
```

### Save Pipeline with Coalescing

```ts
// In App.tsx, around the existing auto-save useEffect

const COALESCE_WINDOW_MS = 60_000;
const lastUserSaveTimestamps = useRef<Map<string, number>>(new Map());

// Inside the auto-save effect:
useEffect(() => {
  const path = editorPathRef.current;
  if (!path || !path.endsWith('.md')) return;
  const baseline = initialContentByPathRef.current.get(path);
  if (debouncedContent === baseline) return;
  if (!debouncedContent) return;

  const now = Date.now();
  const lastSave = lastUserSaveTimestamps.current.get(path) ?? 0;
  const shouldCommit = (now - lastSave) > COALESCE_WINDOW_MS;

  const saveFile = async () => {
    setIsSaving(true);
    const fullContent = joinFrontmatter(
      frontmatterByPathRef.current.get(path) ?? null,
      debouncedContent,
    );
    await window.ipc.invoke('workspace:writeFile', { path, data: fullContent });

    if (shouldCommit) {
      await window.ipc.invoke('knowledge:commit', { path, message: 'Auto-save' });
      lastUserSaveTimestamps.current.set(path, now);
    }

    initialContentByPathRef.current.set(path, debouncedContent);
    setIsSaving(false);
  };

  const timer = setTimeout(saveFile, 500);
  return () => clearTimeout(timer);
}, [debouncedContent]);
```
