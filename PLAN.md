# ScholarOS — MVP Quality Plan

## Overview

This plan covers the highest-priority user-facing issues identified in a full codebase audit (July 2026). The goal is to eliminate sources of user confusion, crashes, and distrust before shipping a public MVP.

---

## P0 — User Will Hit These Immediately

### ✅ 1. Remove blank "Connect Accounts" onboarding step

**Problem:** Step 3 of onboarding (Connect Accounts) renders `<> </>` — a completely blank page. There are no accounts to connect. The entire OAuth provider loading, provider state tracking, and connection UI is dead code.

**Files:**
- `apps/renderer/src/components/onboarding-modal.tsx` — remove `renderAccountConnectionStep()`, step 3 rendering, providers state, `refreshAllStatuses`, OAuth event listener, `connectedProviders`, `showMoreProviders`, `providersLoading`, `providerStates`. Update `Step` type from `0|1|2|3|4` to `0|1|2|3`, update `handleNext`/`handleBack`/`renderStepIndicator` accordingly.
- `apps/renderer/src/components/onboarding/steps/feature-tour-step.tsx` — remove the "Track Blocks" feature card (see P1.1).

**Acceptance:** Onboarding flows Sign In → BYOK Upsell → LLM Setup → Completion. No blank pages.

### ✅ 2. Confirm before deleting files and folders

**Problem:** Right-click → Delete sends a file to trash with zero warning. Vaults and providers are removed permanently with no dialog. Users will accidentally lose data.

**Files:**
- `apps/renderer/src/components/sidebar-content.tsx` — add `AlertDialog` before `handleDelete` and vault removal
- `apps/renderer/src/components/settings-dialog.tsx` — add `AlertDialog` before provider deletion
- Shared `useConfirmDelete` hook recommended for consistency

**Acceptance:** Every destructive action (file delete, folder delete, vault remove, provider remove) shows a Radix UI confirmation dialog with the item name. Delete confirms "Move to trash" (with hint it's recoverable). Vault/provider removal says "This cannot be undone."

### ✅ 3. Add a React Error Boundary at the root

**Problem:** Any runtime error in the renderer unmounts the entire React tree → white screen. No fallback UI, no recovery.

**Files:**
- `apps/renderer/src/components/error-boundary.tsx` (new) — `componentDidCatch` with a "Something went wrong" fallback, a "Reload" button, and error details collapsed behind a details toggle
- `apps/renderer/src/main.tsx` — wrap `<App />` with `<ErrorBoundary>`

**Acceptance:** A render crash shows a styled error page with "Reload ScholarOS" button instead of a white screen. The error is logged to console for debugging.

### ✅ 4. Show user-friendly AI error messages instead of raw provider responses

**Problem:** When an AI provider fails, users see raw text like `responseBody: {"error":{"message":"Insufficient quota"}}` or `name: ContentFilter`. Meaningless to non-technical users.

**Files:**
- `packages/core/src/agents/runtime.ts` — map known error types to user-friendly messages (rate limit, auth failure, model not found, content filter, network error, server error)
- `apps/renderer/src/App.tsx:2630` — display the mapped message instead of `event.error.split("\n")[0]`

**Acceptance:** Users see messages like "This model is currently rate-limited. Wait a moment and try again." or "Your API key appears to be invalid. Check your settings." Never raw JSON.

---

## P1 — Quality-of-Life Gaps

### ✅ 1. Strip all Track Block Model remnants

**Problem:** The "Track Blocks" feature (auto-updating AI note sections) was removed, but `trackBlockModel` survives in the config schema, settings UI dropdown, onboarding UI, and defaults code. Users can configure a model that does nothing. The system prompt still references the `tracks` skill that doesn't exist.

**Files:**
- `packages/shared/src/models.ts` — remove `trackBlockModel` from `LlmModelConfig`
- `packages/core/src/models/defaults.ts` — remove `getTrackBlockModel()`, `SIGNED_IN_TRACK_BLOCK_MODEL`
- `packages/core/src/models/repo.ts` — remove `trackBlockModel` from config merge
- `packages/core/src/application/assistant/skills/index.ts:36` — remove dead `// console.log(tracksSkill)`
- `apps/renderer/src/App.tsx:442-449` — remove track/tracking note references from suggested topics prompt
- `apps/renderer/src/components/onboarding-modal.tsx` — remove `trackBlockModel` from types, state, update handler, and model setup UI
- `apps/renderer/src/components/settings-dialog.tsx` — remove `trackBlockModel` from types, state, update handlers, and model dropdowns
- `apps/renderer/src/components/onboarding/steps/feature-tour-step.tsx` — remove "Track Blocks" card

**Acceptance:** No `trackBlockModel` references remain in the codebase. No UI shows a dead config option. "Track Blocks" does not appear in the feature tour.

### ✅ 2. Add empty states for file tree and search

**Problem:** Opening a new vault shows an empty sidebar with no guidance. Search that fails silently shows "No results found." Users don't know if the app is working.

**Files:**
- `apps/renderer/src/components/sidebar-content.tsx` — in the file tree section, when `tree` is empty, show "No notes yet" with a "Create your first note" button
- `apps/renderer/src/components/search-dialog.tsx:134` — show a toast on search IPC failure instead of silently clearing results

**Acceptance:** Empty vault shows a helpful placeholder. Search errors are communicated to the user.

### ⏭️ 3. Use skeleton loading states instead of blank/spinner-only

**Problem:** The skeleton components (`Skeleton`, `SkeletonShimmer`, etc.) are defined but never used. The file tree, chat history, and search results all appear with no loading transition.

**Files:**
- `apps/renderer/src/components/sidebar-content.tsx` — add `SkeletonShimmerCard` placeholders while tree and runs list are loading
- `apps/renderer/src/components/search-dialog.tsx` — add skeleton placeholders while `isSearching` is true

**Acceptance:** Loading states show skeleton placeholders matching the final layout, not just spinners or white space.

### ✅ 4. Unify toast systems (remove custom, keep sonner)

**Problem:** Two toast systems coexist. `lib/toast.ts` (custom) is used in `sidebar-content.tsx`. `sonner` is used everywhere else. Different visual treatment, different API.

**Files:**
- `apps/renderer/src/lib/toast.ts` — delete (or deprecate)
- `apps/renderer/src/components/sidebar-content.tsx` — replace `toast("...","success")`/`toast("...","error")` calls with `toast.success("...")`/`toast.error("...")` from sonner

**Acceptance:** All toasts use sonner. Single import pattern across the app.

### ✅ 5. Replace native `confirm()` in settings with Radui UI AlertDialog

**Problem:** Settings "Discard changes?" uses the OS-native `confirm()` dialog — jarring against the app's polished Radix UI.

**File:**
- `apps/renderer/src/components/settings-dialog.tsx:1525` — replace `confirm(...)` with an `AlertDialog` component

**Acceptance:** "Discard changes?" shows a styled Radix UI dialog matching the rest of the app.

### ✅ 6. Add confirmation to onboarding "Skip" action

**Problem:** "Skip for now" / "Skip onboarding" links have no guard. Users can accidentally skip vault selection, theme, and model setup with one click.

**File:**
- `apps/renderer/src/components/onboarding/steps/welcome-step.tsx:124` — add `AlertDialog` before completing onboarding skip
- `apps/renderer/src/components/onboarding-modal.tsx` — add confirmation before "Skip for now" on LLM setup and other steps

**Acceptance:** Skipping onboarding shows "Are you sure? You won't have an AI assistant configured." with Cancel/Confirm.

---

## P2 — Polish & Low Risk

These are worth doing but won't block an MVP launch.

### 1. Remove dead `backend/` directory
### 2. Remove unused dependencies (xterm, react-big-calendar, date-fns, googleapis, cron-parser, cors, etc.)
### 3. Consolidate duplicate `parseFrontmatter` implementations
### 4. Replace `console.log` with structured logging
### 5. Add global type definition for `window.ipc` to eliminate `(window as any).ipc`
### 6. Delete stale `packages/core/src/knowledge/README.md`

---

## Status — ✅ All completed 2026-07-18

| Item | Status | Notes |
|------|--------|-------|
| **P0.1** Remove blank onboarding step 3 | ✅ Done | Removed `renderAccountConnectionStep`, OAuth provider loading, provider states. Updated step numbering 0-3. |
| **P1.1** Strip Track Block remnants | ✅ Done | Removed from schema, defaults, repo, settings UI, onboarding UI, App.tsx prompt, feature tour. |
| **P0.2** Delete confirmation dialogs | ✅ Done | Added AlertDialog for file/folder delete in Tree component (`sidebar-content.tsx`). |
| **P0.3** React Error Boundary | ✅ Done | New `ErrorBoundary` component with "Reload" button and collapsible error details. Wraps `<App />` in `main.tsx`. |
| **P0.4** User-friendly AI errors | ✅ Done | `userFacingError()` maps 9 error types (rate limit, auth, quota, content filter, etc.) to plain English. Applied in both streaming and run-level error paths. |
| **P1.2** Empty states | ✅ Done | File tree shows "No notes yet" with "Create your first note" link. Search errors show toast. |
| **P1.4** Unify toast systems | ✅ Done | Replaced all `toast(msg, "success"|"error"|"info")` calls with sonner `toast.success/error/info`. Removed `lib/toast.ts`. |
| **P1.5** Native confirm replacement | ✅ Done | Replaced `confirm("Discard changes?")` in settings with AlertDialog. |
| **P1.6** Onboarding skip confirmation | ✅ Done | Added AlertDialog before skipping onboarding with warning about no AI assistant. |
| **P1.3** Skeleton loading states | Skipped | Nice-to-have polish. Skeleton components exist but are unused. |
| **P2** Cleanup debt | Not started | Backend dir, unused deps, duplicate parseFrontmatter, console.log, window.ipc types. |
