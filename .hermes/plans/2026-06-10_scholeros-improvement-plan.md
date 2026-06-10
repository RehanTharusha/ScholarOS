# ScholarOS Comprehensive Improvement Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make ScholarOS production-ready for mass distribution — fix bugs, add QoL features, optimize performance, improve UI/UX.

**Architecture:** Electron app with React renderer, Vite bundler, TailwindCSS + Radix UI. The app is a knowledge management tool with AI chat, PDF viewing, canvas, graph view, calendar, and browser integration.

**Tech Stack:** Electron 39, React 19, Vite 7, TailwindCSS 4, Radix UI, Tiptap editor, Mermaid, PDF.js

---

## Phase 1: Critical Bug Fixes (Console Errors)

### Task 1: Fix `useConnectors.ts` electronAPI undefined errors

**Objective:** Fix `Cannot read properties of undefined (reading 'invoke')` errors that flood the console.

**Files:**
- Modify: `apps/x/apps/renderer/src/hooks/useConnectors.ts`

**Step 1:** Add safe electronAPI access wrapper

The errors occur because `window.electronAPI` is undefined when running outside Electron (browser dev mode). Every call to `window.electronAPI.invoke(...)` crashes.

```typescript
// Add at top of useConnectors.ts or in a shared util
const safeElectronAPI = () => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
};
```

**Step 2:** Guard all electronAPI calls with null checks

**Step 3:** Verify no more console errors from this file

---

### Task 2: Fix `sidebar-content.tsx` electronAPI undefined errors

**Objective:** Fix `Cannot read properties of undefined (reading 'invoke')` and `(reading 'on')` errors.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/sidebar-content.tsx`

**Step 1:** Add safe electronAPI access pattern

**Step 2:** Guard all electronAPI calls at lines 151 and 457

---

### Task 3: Fix `chat-input-with-mentions.tsx` electronAPI undefined errors

**Objective:** Fix `Cannot read properties of undefined (reading 'invoke')` at line 153.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/chat-input-with-mentions.tsx`

---

### Task 4: Fix `useAnalyticsIdentity.ts` electronAPI undefined errors

**Objective:** Fix `Cannot read properties of undefined (reading 'on')` at line 42.

**Files:**
- Modify: `apps/x/apps/renderer/src/hooks/useAnalyticsIdentity.ts`

---

### Task 5: Fix PostHog initialization without token

**Objective:** Fix PostHog being initialized without a token, causing console error.

**Files:**
- Find: PostHog init call (likely in main.tsx or a config file)

**Step 1:** Add conditional PostHog initialization — only init if token exists.

---

## Phase 2: QoL Features (Obsidian-like)

### Task 6: Add keyboard shortcut for command palette (Ctrl+P)

**Objective:** Obsidian-like quick file/feature search with Ctrl+P.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/search-dialog.tsx`

---

### Task 7: Add drag-and-drop file reordering in sidebar

**Objective:** Allow users to reorder files/sections in the sidebar via drag.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/sidebar-content.tsx`

---

### Task 8: Add recent files / quick open history

**Objective:** Track recently opened files and show in command palette.

**Files:**
- Create: `apps/x/apps/renderer/src/hooks/useRecentFiles.ts`

---

### Task 9: Add file rename from sidebar context menu

**Objective:** Right-click rename in sidebar.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/sidebar-content.tsx`

---

### Task 10: Add word count and reading time to editor

**Objective:** Show word count and estimated reading time in editor status.

**Files:**
- Create: `apps/x/apps/renderer/src/components/word-count-bar.tsx`

---

### Task 11: Add focus/zen mode toggle

**Objective:** Hide sidebar and distractions for focused writing.

**Files:**
- Modify: `apps/x/apps/renderer/src/App.tsx`

---

### Task 12: Add customizable themes (light/dark/sepia)

**Objective:** Multiple theme options beyond current setup.

**Files:**
- Modify: `apps/x/apps/renderer/src/index.css`

---

## Phase 3: UI Animations & Aesthetics

### Task 13: Add page transition animations

**Objective:** Smooth transitions when switching between views.

**Files:**
- Modify: `apps/x/apps/renderer/src/App.tsx`

---

### Task 14: Add sidebar collapse/expand animation

**Objective:** Smooth slide animation for sidebar toggle.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/ui/sidebar.tsx`

---

### Task 15: Add loading skeleton shimmer improvements

**Objective:** Better loading states with smooth shimmer effects.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/ui/skeleton-shimmer.tsx`

---

### Task 16: Add hover micro-interactions

**Objective:** Subtle hover effects on buttons, cards, and interactive elements.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/ui/button.tsx`

---

## Phase 4: Performance Optimizations

### Task 17: Memoize expensive components

**Objective:** Add React.memo and useMemo where needed.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/ai-elements/message.tsx`
- Modify: `apps/x/apps/renderer/src/components/graph-view.tsx`

---

### Task 18: Optimize large list rendering

**Objective:** Virtualize long lists (file browser, chat history).

**Files:**
- Modify: `apps/x/apps/renderer/src/components/sidebar-content.tsx`

---

### Task 19: Add code splitting for heavy views

**Objective:** Lazy load PDF viewer, Mermaid, graph view.

**Files:**
- Modify: `apps/x/apps/renderer/src/App.tsx`

---

### Task 20: Optimize markdown editor re-renders

**Objective:** Reduce unnecessary re-renders of Tiptap editor.

**Files:**
- Modify: `apps/x/apps/renderer/src/components/markdown-editor.tsx`

---

## Verification Steps

After all tasks:
1. `cd apps/x && npm run deps && npm run lint` — no errors
2. `cd apps/x && npm run dev` — app starts, no console errors
3. Manual testing: sidebar, editor, chat, PDF, graph, calendar views
4. Performance: check render counts in React DevTools
