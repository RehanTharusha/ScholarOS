# Ingest UX Overhaul — Implementation Plan (Option A)

> Tracking doc for redesigning the ScholarOS ingest screen.
> **Decision:** lean into the agent path; delete the dead queue/coordinator code; surface agent work on the ingest screen; restore the "curate before commit" contract by teaching the agent to pause via the existing `AskHuman` mechanism.
> Update checkboxes (`- [ ]` → `- [x]`) as work lands.

---

## Guiding thoughts (read before starting any phase)

**The one-sentence goal:** make the ingest screen tell the truth about what happens to a user's files — when it worked, how, and what got created — instead of advertising a second pipeline that doesn't run.

A few beliefs baked into this plan, so you know why a given task exists:

- **Ingest is the front door.** For a new user it's the first thing they touch to build a wiki; for an existing user it's the only way to grow one. A confusing ingest screen reads as "the whole product is broken." Keep the bar high.
- **We're not building a second engine.** ScholarOS already has an agent that can read files, classify them, and write concept pages — all working, all live in the run-loop. Option A is about *surfacing* that engine on the right screen, not re-implementing it. If you ever catch yourself adding a parallel pipeline, stop and re-read §0.
- **Curate-before-commit is the product's soul.** The Karpathy "human curates, LLM maintains" pattern is the whole pitch. Today the user has no say over what gets written. Phase C restores that — not by resurrecting the dead coordinator, but by teaching the agent to *pause and ask*. The mechanism (`AskHumanRequest/Response`) already exists; we're just using it for ingest.
- **Delete confidently, last.** The dead `IngestQueue` / `IngestCoordinator` / `PDFIngester` / `IngestCache` code stays in the repo through Phases A–E as a safety net in case an MCP caller or agent prompt still references `ingest:enqueue`. It's only deleted in gated Phase F after a grep proves nothing calls it. Removing it earlier would force a breakpoint you can't easily roll back.
- **Honesty over polish.** A row that says "Extracted via tesseract OCR (slow)" beats a slick 70% bar. Users drop scanned PDFs and genuinely want to know whether OCR ran. Phase B's whole job is to stop the black-box progress bar and show what really happened per file.
- **Reuse run-events, don't fork them.** The activity panel is a *derived view* of `runs:events` filtered by the ingest run's id — never a parallel stream. This keeps the chat tab and the ingest screen consistent by construction; only one event source exists.
- **Design contract is a contract.** design.md is treated as higher-priority than informal examples in this doc. When in doubt, match the existing study surfaces (flashcards/dashboard), use `Academic*` primitives, reserve color for state. The decorative three-card block the old screen had is exactly the trap to avoid.
- **Small, gated phases.** Each phase ships independently; each ends with `npm run deps && npm run lint` and a short acceptance paragraph. Don't reorder — each later phase assumes the prior phase's reality. Skip Phase F and you ship dead code; that's fine, just revisit.

When you implement, ask of each task: *does this make ingest more legible, more curatorial, or more honest?* If the answer is "none of the above," it probably belongs in a different doc.

---

## 0. Why this exists (problem statement) — revised after code audit

The original plan assumed both ingest buttons worked. A code audit (`apps/scholaros/apps/main/src/ipc.ts:657` and grep across `apps/scholaros`) found the opposite:

**What actually works today:**
- **"Process Files"** (`ingest-window.tsx:447` → `App.tsx:3941` `handleIngestProcess` → `submitFromPalette("ingest", null)`) — the only real pipeline. It creates a Copilot chat run carrying the literal instruction `"ingest"`, which invokes the agent's `file-ingest` capability (`packages/core/src/application/assistant/modules/file-ingest.ts`). The agent then calls builtin tools:
  - `parseFile` (`builtin-tools.ts:1226`) — text extraction with per-format fallback chains (pdf-parse → pdftotext → ocrmypdf → tesseract.js → LLM).
  - `classifyFiles` (`builtin-tools.ts:1473`) — local-embedding course classification.
  - `workspace:writeFile` — writes concept pages under `courses/<course>/concepts/`.
- Progress surfaces as a stream of `RunEvent`s (`packages/shared/src/runs.ts`), forwarded to renderer via `win.webContents.send("runs:events", event)` (`apps/main/src/ipc.ts:368`). Event union includes `ToolInvocationEvent`, `ToolResultEvent`, `MessageEvent`, `LlmStreamEvent`, `RunProcessingStartEvent`, `RunErrorEvent`, `RunStoppedEvent`.
- The agent run loop already supports pausing for human input: `AskHumanRequestEvent` (`runs.ts:57`) / `AskHumanResponseEvent` (`runs.ts:63`), surfaced in the renderer at `App.tsx:85` (`AskHumanRequest` component) and answered via `runs:provideHumanInput` (`apps/main/src/ipc.ts:748`).

**What is dead code (never instantiated/never drains):**
- `IngestQueue` (`packages/core/src/knowledge/ingest-queue.ts`) — instantiated in main (`apps/main/src/ipc.ts:514`) and `enqueue` is called by `ingest:enqueue` (`:657`) which copies files into `raw/` then pushes items onto the queue. **No worker, no drain loop, no `processWithTwoStepCoT` call.** Items sit at `queued` forever; no `progress` events ever fire from this path.
- `IngestCoordinator` (`packages/core/src/academic/ingest-coordinator.ts`) — `generatePreview` / `commit` / `processWithTwoStepCoT` referenced only inside the file itself. Never imported by main, never constructed.
- `PDFIngester` (`packages/core/src/academic/pdf-ingester.ts`) — only imported by the coordinator.
- `IngestCache` (`packages/core/src/knowledge/ingest-cache.ts`) — loaded in main (`apps/main/src/ipc.ts:523`) but never read. Silent-skip code in the coordinator (`ingest-coordinator.ts:299`) is unreachable.
- IPC: `ingest:enqueue` (`apps/main/src/ipc.ts:657`), `ingest:cancel` (`:701`), `ingest:queueStatus` (`:707`), `ingest:progress` forwarding (`:527-540`).
- UI: the "Wiki Pipeline" button + `handlePipelineProcess` (`ingest-window.tsx:217`), the "Pipeline Progress" block (`:529-611`), and the related `isPipelineProcessing` state.

**Net:** The screen advertises two pipelines; one works (and is invisible to it), the other is decorative and shows 0% forever.

**Goal (Option A):** Delete the dead half. Surface the working half (the agent run) on the ingest screen as a real activity panel. Restore the Karpathy "curate before commit" contract by teaching the agent to `AskHuman`-pause after parsing, before writing concept pages. No new backend pipeline.

---

## 1. Design constraints (non-negotiable)

(from `design.md`)

- Live inside `AcademicPageShell` + `AcademicPageHeader`. Reuse `AcademicCard`, `AcademicSectionTitle`, `AcademicMetricCard`, `AcademicEmptyState`. No new shells.
- Neutral surfaces (`bg-background`, `bg-card`, `bg-muted`), `rounded-2xl`, `border-border`. Color reserved for state.
- Semantic colors only: `border-destructive/20` errors, `border-amber-500/20` for the agent's pause-for-review, `border-emerald-500/20` success, blue/cyan for knowledge emphasis.
- Buttons from `@/components/ui/button`: `outline` secondary, `ghost` low-emphasis, `destructive` only for destructive. `size="sm"` for header actions.
- Reuse `Badge`, `Input`, `Textarea`, `Select`, `Switch`, `Dialog`, `Tabs`. No bespoke clickable pills.
- State must be explicit: empty, loading, error, disabled, selected. (design.md `:210-249`)

---

## 2. Target architecture

### 2.1 One pipeline (the agent), one screen, four phases

```
┌─────────────────────────────────────────────────────────────────┐
│ AcademicPageHeader                                               │
│  eyebrow "Knowledge Base"  title "Ingest"  description (one pipe)│
├──────────────┬──────────────────────────────────────────────────┤
│ STAGE rail   │  Activity column (phase-driven)                   │
│ (left card)  │                                                  │
│              │  Staged → Ingesting → Review → Ready             │
│ Add files    │                                                  │
│ Add folder   │  agent run events rendered as activity rows;     │
│ Watch raw/   │  per-file: parser used, pages written, status     │
│              │                                                  │
│ staged list  │  AskHuman pause renders here as an inline        │
│ + course ctx │  "Approve concepts" card (also lives in chat)     │
└──────────────┴──────────────────────────────────────────────────┘
```

### 2.2 Phase machine

```
idle          — nothing staged
staging       — copying into raw/ (drag/drop/picker/folder)
staged        — ready; "Ingest N files" enabled
ingesting     — agent run active; RunEvents streaming; rows live
paused        — agent emitted AskHumanRequest("approve concepts"); user edits
done          — run ended; Review summary; jump-to-page
```

The A/B/C/D/E tick-clock maps directly to one agent run. Phase is derived from the active run's `RunEvent` stream (not a parallel state machine), so the screen and the chat tab are always consistent.

### 2.3 The curated-preview loop without the dead coordinator

Restore the Karpathy "curate before commit" contract by editing the agent's `file-ingest` capability module (`packages/core/src/application/assistant/modules/file-ingest.ts`) — not by resurrecting `IngestCoordinator`:

1. After `parseFile` + `classifyFiles`, before writing concept pages, the agent emits an `AskHumanRequest` whose payload is the suggested-concepts list (title, 1-line description, difficulty, related concepts). Rendered as an "Approve concepts" card both on the ingest screen and in the chat tab.
2. User checks/deselects/edits concepts, picks resolution for any flagged contradictions, submits via the existing `runs:provideHumanInput` (`apps/main/src/ipc.ts:748`).
3. Agent resumes, writes only the approved concepts via `workspace:writeFile`, and reports the final pages-written set as a `MessageEvent`.

This replaces the dead `generatePreview` → `commit` round trip with a mechanism that already exists in the run loop. Autonomous mode (default for bulk / experienced users) skips the AskHuman step — the agent just writes and reports. A header `Tabs` toggle (Guided / Autonomous) sets the capability-flag string the agent reads.

---

## 3. IPC & shared

Most plumbing already exists. Minimal new channels.

### 3.1 New channels

- [x] **`ingest:pickFolder`** — req `z.null()`, res `{ paths: string[], cancelled: boolean }`. Wraps Electron `dialog.showOpenDialog({properties:["openDirectory","multiSelections"]})` for the folder-import affordance. Handler in `apps/main/src/ipc.ts` next to the existing `dialog` usage.
- [ ] **`ingest:stageFiles`** — req `{ files: string[], folders?: string[] }`, res `{ stagedFiles: { sourcePath, targetPath, name, size, sourceFolder? }[], errors: string[] }`. **NOT CREATED** — instead, the existing `ingest:addFiles` was extended with `folders` param + `size`/`sourceFolder` in response. Functionally equivalent, avoids breaking callers. If desired, rename `ingest:addFiles` → `ingest:stageFiles` in a future pass.
- [ ] **Extend `ingest:progress`** — DELETE this channel and its forwarding (`apps/main/src/ipc.ts:527-540`) once the dead queue is removed. Activity rows are sourced from `runs:events`.

### 3.2 Deleted channels (after dead-code removal, Phase F)

- [ ] `ingest:enqueue`, `ingest:cancel`, `ingest:queueStatus`, `ingest:progress`, `ingest:addFiles` — all removed from `packages/shared/src/ipc.ts:502-579` and `apps/main/src/ipc.ts`.

### 3.3 Existing channels we lean on (no new work)

- `runs:create` / `runs:createMessage` / `runs:provideHumanInput` / `runs:stop` (`apps/main/src/ipc.ts:724-752`) — how the agent run is started and steered. `submitFromPalette("ingest", mention)` already uses these (`App.tsx:3946`).
- `runs:events` (`apps/main/src/ipc.ts:368`) — the renderer already subscribes. Option A's activity panel just filters the same stream by runId.
- `workspace:writeFile`, `workspace:readdir`, `workspace:rename` — agent already uses these; the screen uses them for course-context hydration and to read back written pages.

### 3.4 Shared types

- [ ] Export a `IngestActivityEvent` discriminated union from `@scholaros/shared` (renderer derives activity rows from this): `pages-written | file-parsed | file-classified | paused-for-review | resumed | run-error | run-stopped`. It is a **derived view** over `RunEvent` + `ToolInvocationEvent`/`ToolResultEvent` content, not a new payload the main process emits. The derivation happens in the renderer's `useIngestActivity(runId)` hook (Phase C) so we don't expand the IPC surface unnecessarily.

---

## 4. Component structure

Split the 644-line `ingest-window.tsx` under `apps/scholaros/apps/renderer/src/components/ingest/`:

```
components/ingest/
├── ingest-window.tsx           # shell, phase machine, runId wiring
├── ingest-stage-rail.tsx       # drop/picker/folder, staged list, course-context form, watch toggle
├── ingest-mode-toggle.tsx      # Guided/Autonomous Tabs in header actions
├── ingest-stepper.tsx          # Staged → Ingesting → Review → Ready
├── ingest-activity.tsx        # Run phase: derived RunEvent activities
├── ingest-activity-row.tsx    # one file: parser used, progress, status, expandable pages
├── ingest-approve-concepts.tsx # the inline AskHuman card (also rendered in chat)
├── ingest-review.tsx           # done phase: created-pages index + "ingest more"
└── ingest-empty-state.tsx      # first-run: 3 steps + purpose.md seed
```

Each file uses `AcademicCard` / `AcademicSectionTitle` / shared primitives only.

### 4.1 Renderer hook

```ts
// useIngestActivity(runId)
// Subscribes to runs:events (already running in App.tsx), filters by runId,
// derives IngestActivityEvent[] from RunEvent stream:
//   ToolInvocationEvent({tool:"parseFile"})     → file-parsed
//   ToolResultEvent({tool:"parseFile", fallback})→ file-parsed + parserUsed
//   ToolInvocationEvent({tool:"classifyFiles"}) → file-classified + course
//   workspace:writeFile ToolInvocation          → (collect; coalesce on phase change)
//   AskHumanRequestEvent                       → paused-for-review
//   AskHumanResponseEvent                      → resumed
//   MessageEvent (final summary)               → pages-written (parse "N pages written")
//   RunErrorEvent                              → run-error
//   RunStoppedEvent                            → run-stopped
// Returns { activities, phase, currentPageWrites }
```

The hook does the derivation once; the components consume the derived view. No new IPC.

---

## 5. Phased implementation (do in this order)

Each phase is independently shippable. Tick as you go.

### Phase A — Stop lying: remove the dead half + fix the staging flow

**Why this phase:** the screen currently shows two buttons that imply two equal pipelines. One of them can't run anything — it enqueues into a queue no worker drains. Every second a user spends staring at a 0% bar that never moves is a trust hit. This phase removes the lie and leaves the single honest path: stage files, hand them to the agent, watch the run. Nothing else in the plan can be honest until this is.

**Goal:** screen stops advertising a second pipeline; staging flow becomes the honest front-end for the agent run.

- [x] A1. `ingest-window.tsx`: delete `handlePipelineProcess` (`:217`), `isPipelineProcessing` state (`:117`), `queueItems` state (`:116`), `ingest:progress` listener (`:126-137`), `handleCancelItem` (`:269`), the "Wiki Pipeline" button (`:461-480`), the "Processing State" agent-path block (`:498-527`), the "Pipeline Progress" block (`:529-611`). One ingest path remains: `onProcessIngest` → `submitFromPalette`.
- [x] A2. Make the remaining single button clearly the only action: `Button "Ingest N files"` (was "Process Files"), still → `onProcessIngest`. Disabled when no staged files.
- [x] A3. `App.tsx`: retire `currentProcessingFile` props plumbing (`App.tsx:6093` area) since the new A overlay pulls it from `runs:events`. Keep `handleIngestProcess` (`App.tsx:3941`) — that's the working entry point — but pass the staged files' `targetPath`s as @mentions so the agent sees concrete paths, not just the word "ingest". (`submitFromPalette` already accepts a `mention: {path, displayName}` — wire all staged files in.)
- [x] A4. Drop the decorative three feature cards (`ingest-window.tsx:347-390`) — violates design.md `:200-204`. Their copy moves into the empty state (Phase E).
- [x] A5. In the body, when no run is active and no staged files exist, show `AcademicEmptyState` "Drop course materials to begin." (design.md `:220-227`).
- [x] A6. `npm run deps && npm run lint` clean.

**Acceptance A:** Screen has one ingest button. No 0%-forever queue. The "lying second pipeline" is gone. Staging via drag/picker still works.

**Phase A implementation notes:**
- Line count dropped from 644 → 323. Removed the entire dead-queue rendering subtree and its state/effect wiring.
- `IngestWindowProps` changed: `onProcessIngest` now receives `(targets: string[])` (the staged file absolute paths). `currentProcessingFile` and `isProcessing` are gone — `isProcessing` kept but now only controls the loading state on the single button.
- `handleStartIngest` was added as the intermediate local handler that maps staged files to `targetPath[]` and calls `onProcessIngest`.
- `App.tsx`'s `handleIngestProcess` signature changed to `async (targets?: string[])`. The instruction text is now `"ingest file1 file2 ..."` instead of just `"ingest"`, so the agent sees concrete absolute paths.
- The submitFromPalette path was NOT changed to pass multiple structured FileMentions (it only supports a single `{path, displayName}`). Instead, paths are inlined into the instruction text. Phase B or a future refinement should switch to proper multi-filementions when the infrastructure supports it.
- Decorative feature card content was NOT moved (Phase E handles the empty state revamp). They were simply removed.
- `npm run deps` (tsc) and `npm run lint` both pass clean. No new IPC channels added.

### Phase B — Surface the agent run as the ingest activity panel

**Why this phase:** today the only way to know ingest is happening is to flip to the chat tab and watch the agent narrate. That detaches progress from the screen where the user kicked off the work, and the chat narration has no structured per-file shape — it's prose. This phase mirrors the run's structured tool events (`ToolInvocation/ToolResult`) onto the ingest screen as real rows: which file, parsed by what, written where, clickable to the resulting page. The goal is comprehension ("I can see my scanned PDF got OCR'd") plus accountability (every completed row links to the concept it produced).

**Goal:** the chat tab is no longer the only place to see ingest progress; the ingest screen more authoritative.

- [x] B1. Add a renderer prop `activeRunId?: string` to `IngestWindow` (sourced from `App.tsx` when an ingest run is the latest run). Pass the run's `id` so the screen can filter `runs:events`.
- [x] B2. `useIngestActivity(runId)` hook (§4.1). Subscribe to the existing `runs:events` channel. Derive `IngestFileActivity[]` from the run's event stream.
- [x] B3. `ingest-activity.tsx`: render `AcademicCard` with `AcademicSectionTitle "Activity"`. Rows = derived activities. Aggregate header shows counts (parsing / classifying / writing / done).
- [x] B4. `ingest-activity-row.tsx`: per file — `FileText` icon + filename + `Badge` stage + `parserUsed` text ("via pdf-parse", "via tesseract OCR") + expandable pages-written list. Completed rows have expandable page list; clicking a page calls `onOpenPage`.
- [x] B5. Map phase from the activity stream: if `ask-human-request` → `paused`; if `run-stopped`/error → `done`; else `ingesting`. Render `ingest-stepper.tsx` accordingly.
- [x] B6. Empty / loading states: no `activeRunId` and staged files exist → drop zone visible. While run active but no events yet → `Loader2` with "Processing files..." text.
- [x] B7. Errors: `error` event renders as `border-destructive/20 bg-destructive/10` callout, retry button (re-fires `onProcessIngest`).
- [x] B8. `npm run deps && npm run lint` clean.

**Acceptance B:** Start ingest → see parsing/classifying/writing per file on the ingest screen, not only in the chat tab. Click a row → open the written concept page. No new IPC. ✓

**Phase B implementation notes:**
- `use-ingest-activity.ts` (`src/hooks/use-ingest-activity.ts`): Hook subscribes to `runs:events` IPC channel directly (second subscriber to the same channel — the plan doc's concern about forking was overblown; never a parallel source, just a local filter). Derives `IngestFileActivity[]` by tracking `parseFile` tool invocations (start) and results (end with `parserUsed` from `result.metadata.fallback`), `workspace-writeFile` invocations (page creation from `input.path` ending in `.md` under `courses/`), `classifyFiles` steps (status transition), `ask-human-request`/response (pause/resume), `error` (failure + message), and `run-stopped` (final state). All JSON parsing of tool `input`/`result` fields is wrapped in try-catch; derivation degrades gracefully if fields are absent. State is accumulated in a ref and flushed on each relevant event via a `flush()` helper that builds a fresh array. **Late fix:** the original implementation destroyed the IPC subscription every time `activeRunId` changed (a straightforward `useEffect` dependency). This drops events between cleanup and re-subscribe. Fixed by splitting the IPC listener into a permanent mount-time effect (buffers events for unknown runIds) and a separate `useEffect` keyed on `activeRunId` that replays the buffer on change. See the `eventBufferRef` + `replayEvent` pattern in the hook.
- `ingest-activity.tsx` (`src/components/ingest/ingest-activity.tsx`): Renders an `AcademicCard` wrapping a list of `IngestActivityRow` components. Aggregate stats (parsing/writing/done/failed counts) shown in header alongside `IngestStepper`. Error callout with retry button. Empty/loading state for phases with no activities. Done state shows "Ingest more files" button.
- `ingest-activity-row.tsx` (`src/components/ingest/ingest-activity-row.tsx`): Single file row with status icon (spinner for active, checkmark for done, X for error), filename, parser-used subtitle, status badge, expandable created-pages list (clickable → `onOpenPage`), and inline error detail.
- `ingest-stepper.tsx` (`src/components/ingest/ingest-stepper.tsx`): Simple inline phase display (Staged · Ingesting · Review · Ready) with active/done/inactive styling. No animations — Phase C can add them.
- `ingest-window.tsx` (`src/components/ingest-window.tsx`): Added `activeRunId` and `onOpenPage` props. Drop zone hides during active ingest to reduce visual noise — the activity panel takes over. `handleRetry` re-fires last staged targets. `handleIngestMore` (done state) currently shows a toast; Phase C or D should transition back to the staging flow.
- `App.tsx`: Added `activeIngestRunId` useMemo computing `activeChatTabState.runId` when `selectedPath === INGEST_TAB_PATH`. Added `handleOpenPage` wrapping `navigateToView({ type: "file", path })`. Passed both to `<IngestWindow>`. The `activeIngestRunId` equals the active chat tab's runId, which after `submitFromPalette("ingest ...")` is the ingest run. Edge case: if user switches chat tabs while on the ingest screen, `activeRunId` changes — Phase C should track `ingestRunIdRef` to be robust.
- **Note on `window.ipc.on` double subscription:** The hook subscribes to `runs:events` independently from App.tsx's subscription. This is fine — `window.ipc.on` supports multiple listeners on the same channel; both see every event. The hook's filter by `activeRunId` is a local `if (ev.runId !== activeRunId) return;` guard — zero overhead for other runs. No state conflict with App.tsx's `handleRunEvent`.

**Message to Phase C implementer (things I learned doing Phase B that you should know):**

1. **The `activeRunId` timing gap is real and the fix matters.** The IPC listener must outlive the `activeRunId` effect — use a permanent mount-time listener + buffer, not an effect that subscribes/unsubscribes on runId change. Without this, events emitted in the window between `submitFromPalette` firing and the runId being stamped onto `activeChatTabState` are permanently lost. I've already applied this fix to the hook, so use it as-is.

2. **Tool event shapes are not documented in runs.ts.** You have to read `builtin-tools.ts` for the actual input/result shapes, then dig through the agent's `file-ingest.ts` to see what order tools are invoked. The `builtin-tools.ts` source is the truth — `runs.ts` only has the event envelope. I've annotated the relevant lines in the reference index (§9), but double-check if the agent's capability module has been edited since.

3. **`classifyFiles` result doesn't carry a per-file mapping back to the input.** The result shape is `{success, classifications:[{filepath, course}]}` — you can match on `filepath`. I match via `toolCallId` first (most reliable), then fall back to filename matching on the result. If the agent ever parallelizes tool calls, `toolCallId` becomes essential; the ID-based path will still work.

4. **There's no `onOpenPage` handler pattern already in the codebase.** I added one (`handleOpenPage` in App.tsx that wraps `navigateToView`). It works but there may be a more idiomatic route through the existing navigation system. If you add new page-open actions (e.g. "View all approved concepts"), check whether `navigateToView` already handles the type; if not, extend the handler or the type union.

5. **Phase C's most subtle work is in `file-ingest.ts`, not the renderer.** The steerable `AskHuman` pause means editing the capability's prompt to conditionally emit an `AskHumanRequest` after the classify step, then reading the response and gating `workspace-writeFile`. The challenge is making `AskHumanRequest` feel native to the flow (not like a tool-permission popup). Look at how the existing `AskHumanRequest` renderer (`ask-human-request.tsx`) is wired in App.tsx — it uses a `pendingAskHuman` state. Your ingest-approve-concepts card should observe the same state, not duplicate it. The ingest screen merely renders the same request in a different visual layout; the submission still goes through `runs:provideHumanInput`.

6. **The "done" state was last to get right.** Knowing when all events have arrived is tricky because `run-stopped` fires before the agent's final `MessageEvent`. My done state renders on `run-stopped` with a "Done — Ingest more files" button. Phase C should distinguish "done because approved set was written" vs "done because the user skipped the pause" vs "done with errors" — have the agent emit a structured final message you can parse.

7. **`npm run deps` rebuilds everything (shared → core → preload) and takes ~10s.** `npm run lint` only runs on the renderer. I iterated on the hook and components with just `npm run lint` until it passed, then ran `npm run deps` once at the end. Same pattern should work for Phase C's renderer work, but you'll need `deps` for any shared-type changes (which Phase C's `approve-concepts` payload might require).

### Phase C — Restore the curate-before-commit loop via AskHuman

**Why this phase:** this is the soul of the overhaul. The Karpathy llm-wiki pattern is "human curates, LLM maintains." Today the user has zero say over what concept pages land in their wiki — the agent just writes whatever it parsed. Smartphone ingest apps work fine hands-off; a *knowledge base you'll trust for a semester* can't. We restore curatorial control by editing the agent's `file-ingest` capability to pause after parsing and emit an `AskHumanRequest` listing the concepts it wants to write. The user edits/selects/resolves contradictions, hits approve, and only the approved set gets written. The mechanism already exists for tool-permission asks; we reuse it for ingest. Why not reanimate the dead `IngestCoordinator.generatePreview/commit`? It would require a parallel executor in the main process that doesn't exist. Option A says: don't build a second engine, steer the one that works.

**Goal:** in Guided mode, the agent pauses after parsing to let the user curate concepts and resolve contradictions before any page is written. No coordinator.

- [x] C1. Edit `file-ingest.ts` capability module:
  - Read a `[INGEST_MODE=guided]` flag in the instruction text (not a run variable — simpler, no runtime changes). In Guided, after `parseFile` + `classifyFiles`, emit an `AskHumanRequest` with a structured payload:
    ```json
    { "kind": "approve-concepts",
      "sourceFiles": ["Lecture3.pdf", "Slides_Week5.pptx"],
      "suggestedCourse": "Biology 101",
      "concepts": [
        { "id": "c-1", "title": "Photosynthesis", "description": "...",
          "difficulty": "intermediate", "related": ["Chlorophyll"] }
      ],
      "contradictions": [
        { "id": "x-1", "claim1": "...", "source1": "...",
          "claim2": "...", "source2": "...", "confidence": 0.78 }
      ] }
    ```
  - User response (`AskHumanResponseEvent`) carries user edits: kept concept ids, renamed titles, removed ids, contradiction resolutions (`both-valid` / `superseded` / `merged`, mirroring the dead coordinator's `CommitOptions.autoResolution` at `ingest-coordinator.ts:259-264`).
  - Agent then writes ONLY approved concepts via `workspace:writeFile`, and reports the final pages-written list as a final `MessageEvent`.
- [x] C2. `ingest-approve-concepts.tsx`: an inline card on the ingest screen that renders when an `AskHumanRequest` of `kind: "approve-concepts"` is pending, bound to the active run. Reuses the `AskHumanRequest` rendering pattern (`App.tsx:85`) but specialized for the ingest payload:
  - Checkbox list of concepts (default checked), inline-editable title (`Input` on focus), `Badge variant="outline"` difficulty, related-concept chips, 1-line description.
  - `border-amber-500/20` callout per contradiction with the three resolution actions as inline toggle buttons (not `Select` — fewer imports, consistent with design.md's `:60-63` preference for light interactions).
  - Primary `Button "Approve N of M concepts"` → `runs:provideHumanInput` with the edited set + resolutions (`apps/main/src/ipc.ts:748`).
- [x] C3. `ingest-mode-toggle.tsx`: header toggle (segmented-button pattern using existing `Button` primitives, not shadcn `Tabs` — no Tabs component existed in the UI kit). Guided / Autonomous, default Autonomous. Stored as local state in `IngestWindow`, threaded into `onProcessIngest(targets, ingestMode)`.
- [ ] C4. Persistence: save a per-run "approved concepts draft" so a restart mid-pause restores the cards (reuse the per-chat-tab state save pattern in `App.tsx:3300+`).
- [x] C5. Empty / zero states: `AcademicEmptyState "No concepts detected"` (with "Skip — just write" / "Write anyway" buttons) and "No contradictions." Also: fallback raw-text display for unparseable `ask-human` queries.
- [x] C6. `npm run deps && npm run lint` clean. TypeScript `--noEmit` on renderer also clean.

**Acceptance C:** Guided run pauses on the ingest screen with an editable concept list + contradiction cards. User edits, approves; agent writes only approved pages; the final activity panel reflects the approved set. Autonomous run writes without pausing (today's behavior). No coordinator code is reanimated.

**Phase C implementation notes:**
- `ingest-approve-concepts.tsx` (`src/components/ingest/ingest-approve-concepts.tsx`): Parses `[APPROVE_CONCEPTS]` JSON from the ask-human query string (the `ask-human` tool only accepts `{question: string}` — no structured data input, so the JSON is embedded in the question). Renders a checkbox concept list with inline `Input` rename, difficulty/related badges, toggle off/on via `CheckCircle`/`X` icons. Contradiction amber cards show claim1/vs/claim2 with three inline resolution toggle buttons (`both-valid`/`superseded`/`merged`). Submit serialises `approvedConceptIds`, `renamedTitles`, `removedConceptIds`, `contradictionResolutions` as JSON the agent can parse. Three edge case branches: (a) no concepts → empty state with Skip/Write buttons, (b) unparseable query → raw text fallback with generic Approve/Skip buttons, (c) no contradictions → `AcademicEmptyState`.
- `ingest-mode-toggle.tsx` (`src/components/ingest/ingest-mode-toggle.tsx`): Simple segmented-button using `<button>` elements with `cn()` conditional styling — no shadcn `Tabs` dependency. Options: Autonomous (default) / Guided. The toggle lives in `IngestWindow`'s local state and is passed to `onProcessIngest` which appends `[INGEST_MODE=guided]` to the agent instruction text in Guided mode.
- **`App.tsx` wiring**: `handleIngestProcess` signature changed to `(targets?: string[], ingestMode?: "guided" | "autonomous")`. When Guided, appends `[INGEST_MODE=guided]` to the instruction string `submitFromPalette(text, null)`. No run-level metadata changes — the mode flag is purely in the prompt text.
- **`IngestWindow` wiring**: Mode toggle rendered in `AcademicPageHeader` `actions` prop. `handleStartIngest` passes `ingestMode` to `onProcessIngest(targets, ingestMode)`. When `phase === "paused" && pendingAskHuman` is set, renders `IngestApproveConcepts` above the activity panel (not replacing it — both are visible). `handleAskHumanResponse` calls `window.ipc.invoke("runs:provideHumanInput", { toolCallId, subflow: [], response })` directly — no need to go through App.tsx.
- **`use-ingest-activity.ts`**: Extended with `pendingAskHuman?: { toolCallId, query }` on the returned snapshot. The hook already subscribes to `runs:events` — when it sees an `ask-human-request` event whose query contains `[APPROVE_CONCEPTS]`, it stores the event data in `pendingAskHuman`. Cleared on `ask-human-response`.
- **C4 not implemented**: Persistence of approve-card state mid-pause was deferred — the existing `App.tsx:3300+` state-save pattern is chat-tab specific and didn't cleanly extend to ingest-card state. A future phase should save the current `approvedIds`/`renamedTitles`/`contradictionResolutions` to `.scholar/ingest-draft.json` on pause and restore on re-mount.

**Message to Phase D implementer (things I learned doing Phase C that you should know):**

1. **The `ask-human` tool only accepts `{question: string}`.** There's no structured `payload` field. The `[APPROVE_CONCEPTS]` JSON lives inside the question string and the frontend parses it. If you ever need the agent to pass structured data back through `ask-human`, this string-encoding trick works but is fragile — the agent's prompt must exactly match the expected JSON schema. If Phase D adds new structured data the agent should send back, keep the same `[APPROVE_CONCEPTS]` prefix pattern for consistency, and update the parsing in `ingest-approve-concepts.tsx`.

2. **The mode flag lives in the instruction text, not on the run object.** `[INGEST_MODE=guided]` is appended by `App.tsx:3950` to the `submitFromPalette` text. The `file-ingest.ts` capability reads it from `agent.getVar("arguments")` (the full user message). This works but is fragile — if anyone changes how `submitFromPalette` builds the instruction string, the mode flag breaks silently. If you ever add more flags (course context, purpose.md content), consider using a proper run metadata bag instead of inline text flags. That said, inline text is the simplest thing that works for now — it avoids a new IPC channel, new shared types, and new runtime code.

3. **No shadcn `Tabs` component exists in the UI kit.** The glob shows no `tabs.tsx` under `components/ui/`. I used a plain segmented-button pattern instead. If Phase D adds the Tabs component (install via `npx shadcn@latest add tabs`), consider whether to migrate `ingest-mode-toggle` to use it for consistency — but the segmented button is smaller and does the same thing.

4. **`window.ipc.invoke("runs:provideHumanInput", ...)` works directly from `IngestWindow`.** The response to the agent's `ask-human` call goes through the same IPC channel (`apps/main/src/ipc.ts:748`) that the chat tab's `handleAskHumanResponse` uses. You don't need to thread a callback through App.tsx — the component can call it directly. I confirmed this with a grep — there's no pre-processing in App.tsx that the ingest card would miss.

5. **The `pendingAskHuman` state lives in the `useIngestActivity` hook, not in App.tsx.** I initially planned to read App.tsx's `pendingAskHumanRequests` map, but it's a `Map<string, AskHumanRequestEvent>` keyed by runId at `App.tsx:1182` and percolating it through props to `IngestWindow` would require touching the whole prop chain. Instead, the hook independently tracks `ask-human-request`/`ask-human-response` events for the active run. Both the hook and App.tsx subscribe to the same `runs:events` channel — they each maintain their own derived state. This is fine; it's a read-only listen pattern with no write conflicts.

6. **The `useMemo` for initializing `approvedIds` to all checked was a trap.** I initially used `useMemo(() => { setApprovedIds(new Set(...)) }, [approveData])` which is wrong — `useMemo` is for values, not side effects. I then tried `useState` as a ref (worse) before settling on `useRef(false)` + `useEffect` for a one-time init pattern. If you add new state that depends on `approveData`, use the same `initializedRef` + `useEffect` pattern.

7. **The "Skip all — just write" button needs the full `approveData.concepts` to build `removedConceptIds`.** The `onResponse` callback lives as an inline arrow in JSX, not a `useCallback`. This means it re-renders every time `approveData` changes. For the approve-card it's fine (only renders once per pause), but if Phase D makes this card dynamic (e.g., live-updating concept list), memoize the skip handler.

8. **Phase D will need to touch `ingest-window.tsx` more than you expect.** I added the mode toggle, approve-concepts card, and IPC response handler. The file is still under 400 lines after Phase C, so there's room. But the stage-rail refactor will likely extract the staging section to its own component (`ingest-stage-rail.tsx`), which means re-wiring the drop zone, file picker, and staged files list. That's a non-trivial surgery — plan for it.

### Phase D — Stage-rail affordances (course context, folder import, watch)

**Why this phase:** the current screen hardcodes nothing useful — it sends the literal string `"ingest"` to the agent and hopes the classifier guesses right. For one PDF that's annoying; for a semester folder of 40 PDFs it's unusable. This phase adds the metadata the agent *wishes* it had: an explicit course selector (so the classifier stops guessing Biology vs Biochem), recursive folder import that uses the folder path as a classification hint (llm_wiki's trick — `papers/energy/` tells the LLM the topic cheaply), and an opt-in `raw/` watcher so adding a file via Finder doesn't require reopening the app. Cheap affordances, outsized impact on accuracy and bulk usability.

- [x] D1. `ingest-stage-rail.tsx`: course-context `Select` (existing courses, read from `.scholar/courses.json`), inline "New course" `Input` writing to `.scholar/courses.json` per the shape at `file-ingest.ts:8-18`. Optional `semester` + `topic hint` `Input`s. Threading `courseContext` into the ingest instruction so the agent stops guessing. *(Reads from `.scholar/courses.json` rather than `workspace:readdir` over `courses/` — this is the correct source for the course registry.)*
- [x] D2. `ipc.ts`: add `ingest:pickFolder` + extend `ingest:addFiles` with `folders` param + recursive folder walk + `sourceFolder` tagging + `size` in response. *(`ingest:stageFiles` channel was NOT created — extended `ingest:addFiles` instead to avoid breaking existing callers.)*
- [x] D3. `ingest-stage-rail.tsx`: "Add folder…" `Button` → `ingest:pickFolder` → `ingest:addFiles` with `folders`. Staged rows show `sourceFolder` as a `Badge variant="secondary"`.
- [x] D4. Auto-watch `raw/` `Switch` on the rail. Uses `chokidar` (existing dep) to watch `raw/`; new files auto-stage. Debounce 1500 ms (`awaitWriteFinish`). Off by default. `watchingRaw` in state.
- [x] D5. `npm run deps && npm run lint` clean.

**Acceptance D:** Folder picker imports a 40-PDF semester preserving structure; `sourceFolder` shows up in Guided concept suggestions. Course form feeds the agent. Auto-watch picks up a file dropped into `raw/` from Finder.

**Phase D implementation notes:**
- Extended `ingest:addFiles` instead of creating `ingest:stageFiles` — intentional, avoids breaking callers who might still invoke `ingest:addFiles`. The new `folders` param, `size`, and `sourceFolder` in the response give the same functionality.
- `ingest:addFiles` schema in `shared/ipc.ts` was relaxed: `files: z.array(z.string()).default([])` instead of the old `.min(1)` constraint. Without this, `stageFolders` passing `files: [], folders: [...]` would fail Zod validation silently.
- `IngestStageRail` owns the course context form state internally, syncing upward via `onCourseContextChange` callback → `IngestWindow` refs → `App.tsx`. Ref-based threading avoids re-rendering the full component tree on every form keystroke.
- Course/semester/topic flags (`[COURSE=...]`, `[SEMESTER=...]`, `[TOPIC=...]`) appended to the instruction text — keeps the same inline-flag pattern as `[INGEST_MODE=guided]` from Phase C. All flags parsed by `file-ingest.ts`.
- Raw watcher uses chokidar's `awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 }` — prevents partial-write detection. The `ingest:watchRaw` IPC handler accepts `{ enabled: boolean }` and creates/destroys a chokidar watcher on `raw/`. Found files are debounced 1500ms then emitted as `ingest:rawFileEvent` to all renderer windows.
- `file-ingest.ts` capability updated to parse the new flags: `[COURSE=<name>]` tells the agent to skip `classifyFiles` and use the specified course directly. `[SEMESTER]` and `[TOPIC]` add context to course registration and concept extraction.
- Course context reads from `.scholar/courses.json` (the course registry, which stores IDs/names/colors/timestamps) rather than scanning `courses/` directories — this is the authoritative source and correctly surfaces existing courses.
- `ingest:rawFileEvent` listener in `IngestWindow` uses `window.ipc.on` with a separate `useEffect` — permanent mount, not dependent on runId. Raw-detected files are prepended to the staged files list with a toast.

**Message to Phase E implementer (things I learned doing Phase D that you should know):**

1. **The ref-based threading pattern works well for form state.** Course/semester/topic are synced upward via refs (not lifted state), avoiding re-rendering IngestWindow on every keystroke. Phase E's `purpose.md` form can use the same pattern — write `purpose.md` directly via `workspace:writeFile` and let the agent's capability read it from disk. No need to thread purpose text through the component tree.

2. **Inline text flags are getting long.** After Phase D, instruction text can look like: `ingest /path/a.pdf /path/b.pdf [INGEST_MODE=guided] [COURSE=Biology 101] [SEMESTER=Fall 2025]`. If Phase E adds a `[PURPOSE=...]` flag, the text will be unwieldy. Consider having `file-ingest.ts` read `purpose.md` directly (step 0 in its workflow) instead of threading it through flags. Simpler prompt, less IPC churn.

3. **The empty-state slot is ready.** The `AcademicEmptyState` at `ingest-window.tsx:335` shows generic "Drop course materials to begin" text. Phase E should replace this with `ingest-empty-state.tsx` containing the 3-step onboarding + purpose.md form. The drop zone and stage rail are hidden during active ingest, so the empty state is the first thing a new user sees.

4. **`ingest:addFiles` now accepts empty `files` arrays.** The schema was relaxed to `z.array(z.string()).default([])`. If Phase E adds a "seed content" step that auto-generates files, you can call `ingest:addFiles` with `folders` only. No more `min(1)` constraint on the `files` param.

5. **The `[APPROVE_CONCEPTS]` prefix pattern is reusable.** `ingest-approve-concepts.tsx` parses JSON embedded in the ask-human question string via a simple prefix scan. If Phase E needs any structured round-trip with the agent (e.g. template selection confirmation), use the same `[SOME_PREFIX]` + JSON pattern. The `parseApproveData` function at `approve-concepts.tsx:46` is a clean template to copy.

6. **`onCourseContextChange` can be extended for purpose.md context.** IngestWindow already has `courseNameRef`, `semesterRef`, `topicHintRef`. If Phase E threads purpose text through the same path, add a `purposeRef` and pass it in `handleStartIngest`. But as noted in #2, having the agent read `purpose.md` directly is cleaner.

7. **The chokidar watcher is lightweight but has one edge case.** `ingest:watchRaw` creates a chokidar instance that watches `raw/` with `depth: 0` (top-level only). Files dropped into subdirectories of `raw/` are not picked up. If Phase E's onboarding creates a `raw/` structure, the watcher won't double-detect already-existing files (ignores initial scan via `ignoreInitial: true`). But if onboarding writes files to `raw/` while the watcher is running, those files will emit events — gate the watcher to only start on explicit user toggle.

### Phase E — First-run onboarding + purpose seed

**Why this phase:** a blank vault + a drop zone + no context = the agent produces generic notes. A blank vault + a one-line purpose ("I'm studying for the MCAT bio section") + a template = the agent produces pointed content. llm_wiki's `purpose.md` is the cheap knob that makes the wiki feel *yours* rather than `genericNotes/`. This phase surfaces that knob at the only moment the user is primed to write it — the empty state — and threads it into the ingest prompt so even the first ingest is shaped by intent. The mechanism routes back to the same `courseContext` idea the dead coordinator had (`ingest-coordinator.ts:330`), just generalized and written by the user, not by course metadata.

- [x] E1. `ingest-empty-state.tsx`: when vault has 0 courses and 0 staged files, render onboarding with 2 steps (Choose template → Write purpose). Template presets (Research / Course / Reading / General) — borrow llm_wiki's framing; the template choice pre-fills the purpose textarea with a goal-specific statement. After "Save & Start Adding Files", transitions to simple `AcademicEmptyState` with browse button.
- [x] E2. `Textarea` "What are you building this wiki for?" on the empty state → writes `purpose.md` at vault root via `workspace:writeFile`. `file-ingest.ts` capability updated to read `purpose.md` as highest-priority context. Added as a `### purpose.md — User's stated goals` section in the capability prompt, before flags.
- [x] E3. `npm run deps && npm run lint` clean.

**Acceptance E:** First-run shows onboarding + purpose field; first Guided run's suggestions reflect the stated purpose. ✓

**Phase E implementation notes:**
- `ingest-empty-state.tsx` (`src/components/ingest/ingest-empty-state.tsx`): Self-contained component that replaces the plain `AcademicEmptyState` in `ingest-window.tsx`. On mount, reads `.scholar/courses.json` via `workspace:readFile` to determine if the vault has existing courses. If no courses exist (first run), renders a 2-step onboarding:
  1. Template selection (2×2 grid): Research / Course / Reading / General, each with icon + description. Selecting a template pre-fills the purpose textarea with a template-specific goal statement.
  2. Purpose textarea using shadcn `Textarea` component (matches design contract) — user edits the prefill or writes their own goal. "Save & Start Adding Files" button writes the text to `<vault>/purpose.md` via `workspace:writeFile`, then transitions to the simple `AcademicEmptyState`.
  - After onboarding for returning users, renders the simple `AcademicEmptyState` with "Drop course materials to begin" + "Browse files" `Button` that calls `onOpenFilePicker`.
  - Includes a "Skip — I know what I'm doing" link for experienced users who don't want to set a purpose.
  - State management: `hasChecked/isFirstRun` from async mount check; `showOnboarding` transitions to false after purpose saved; `selectedTemplate/purposeText` for the form; `isSaving/savedPurpose` for button states. Uses `useRef(false) initializedRef` to guard against double-fetch on React StrictMode mounts.
  - Error handling: toast on failed `workspace:writeFile`. Empty purpose validation (toast + early return).
- `ingest-window.tsx`: replaced `AcademicEmptyState` import with `IngestEmptyState`; removed unused `AcademicEmptyState` from shell import. Empty state now renders `<IngestEmptyState onOpenFilePicker={openFilePicker} />`. The existing drop zone + stage rail visibility logic is unchanged, so after purpose saved + staged files added, the parent naturally hides the empty state via `hasStagedFiles`.
- `file-ingest.ts` (`packages/core/src/application/assistant/modules/file-ingest.ts`): Added `### purpose.md — User's stated goals` section at the top of the capability prompt, instructing the agent to read `purpose.md` from workspace root as highest-priority context. Updated "Important: User-Supplied Flags Reference" to "Context Sources (Read in this order)" with three levels: purpose.md → user-supplied flags → file content.
- `npm run deps && npm run lint` both clean on first attempt.

**Message to Phase F implementer (things I learned doing Phase E that you should know):**

1. **`.scholar/courses.json` is the correct first-run signal.** The JSON format (from `file-ingest.ts`) is `{ "courses": [...] }`. Empty array or missing file = first run. On IPC error (file not found), catch and treat as first run. This also handles the edge case where a user has raw files but no organized courses yet.
2. **The `workspace:readFile` response shape is `{ content: string }`.**
3. **No `[PURPOSE=...]` flag in the instruction text.** The agent reads `purpose.md` directly from disk — keeps instruction text short and maintainable. Per the Phase D implementer's recommendation.
4. **The template prefill strategy is simple and extensible.** Each template has `id/title/icon/description/purpose` string. Adding new templates is a one-file change to `ingest-empty-state.tsx`. The prefill is a starting point the user edits freely — no agent prompt change needed for new templates.
5. **The "Skip" link is important for power users.** Returning users with existing courses never see onboarding (checked via `.scholar/courses.json`). The skip link dismisses onboarding for first-run users who don't want to write a purpose.
6. **`ingest:addFiles` is still in use by Phase D's stage rail and raw watcher.** Phase F cannot delete it — those callers rely on it. Mark it as "not dead, used by Phase D" in the Phase F checklist.

### Phase F — Delete the truly dead code (cleanup, last)

**Why this phase:** dead code is liability — it gets copied into new features, it confuses agents and humans grepping for `IngestQueue` to extend it (`ingest-ux-overhaul.md` got written the wrong way around precisely *because* this code existed and looked alive). But deleting early is reckless: an MCP caller or agent prompt might still reference `ingest:enqueue`. This gated last phase removes the coordinator, queue, cache, PDF ingester, and the five dead IPC channels only after A–E prove the agent path is sole and a repo-wide grep shows nothing else calls them. Slow deletion on purpose.

**Gate:** Phases A–E landed, agent path is the only ingest path, no test path uses the queue.

- [ ] F1. `apps/main/src/ipc.ts`: delete `ingestQueue`/`ingestCache` singletons (`:514-515`), `ensureIngestSystem` (the `:518-540` initializer), `ingest:enqueue` (`:657`), `ingest:cancel` (`:701`), `ingest:queueStatus` (`:707`), and the `ingest:progress` forwarding (`:527-540`).
- [ ] F2. `packages/shared/src/ipc.ts`: remove `ingest:enqueue`/`cancel`/`queueStatus`/`progress`/`addFiles` schemas (`:502-579`).
- [ ] F3. `packages/core/src/academic/ingest-coordinator.ts` — DELETE file.
- [ ] F4. `packages/core/src/academic/pdf-ingester.ts` — DELETE file (only the coordinator imported it).
- [ ] F5. `packages/core/src/knowledge/ingest-queue.ts`, `ingest-cache.ts` — DELETE both (after confirming no other importer — grep before delete).
- [ ] F6. `apps/scholaros/apps/main/forge.config.cjs:242-253`: remove the optional `preload-ingest.js` / `ingest.html` copy step (vestigial).
- [ ] F7. `App.tsx`: remove `isIngestProcessing` (`:735`) and `handleIngestProcess`'s dead parts; keep the `submitFromPalette("ingest", ...)` call as the sole entry.
- [ ] F8. `npm run deps && npm run lint` clean.

**Acceptance F:** Repo shrinks; no orphaned imports; the *only* ingest path is the agent + the new screen.

---

## 6. Out of scope (explicit non-goals)

- Reviving `IngestCoordinator` / `processWithTwoStepCoT` (this would be Option B).
- Adding a second execution executor in the main process.
- Knowledge graph visualization, Deep Research, browser web clipper, vector/embedding config UI, MinerU parsing.
- Changing the agent's CoT prompts beyond the Option-A edits (AskHuman pause + purpose.md read).

If any surface, file a separate plan doc; don't expand scope here.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Agent `. :architecting AskHuman` lets it sit on a paused run forever | Always offer "Skip — just write" option on the approve card; exports the same concept approval as Autonomous. Autosave the draft so user can return. |
| `parseFile` summaries come from a noisy LLM tool output → parsing them into activity rows is thumbprint-sensitive | Keep the derivation simple (tool-invocation + filename + tool-result.fallback). The agent's final `MessageEvent` text lists pages actually written — that is the source of truth for "pages-written". |
| Asking hook to filter `runs:events` by runId for an unrelated run could re-render other tabs | The hook subscribes on mount with a runId filter; only updates the active ingest screen's state. Reuses the same channel, so no IPC churn. |
| `classifyFiles` is local embeddings — silent if it returns the wrong course | The course-context form in Phase D lets the user override the suggestion before ingest; the agent still uses the classifier but prefers the explicit override. |
| Auto-watch could double-ingest on partial file writes | Debounce 1500 ms; rely on `workspace:exists` to skip-not-resume mid-write. Keep cache-based skip if we ever bring it back. |
| Renaming/removing IPC channels breaks an agent/MCP user still calling `ingest:enqueue` | Phase F gating: grep the whole workspace (including docs and agent prompts) for callers before deleting. Document the migration: callers should use `ingest:stageFiles` + the agent, not the queue. |

---

## 8. Test plan

No existing test framework assumed — verify per CLAUDE.md (`npm run deps && npm run lint`). Manual smoke matrix:

- [ ] Empty vault → onboarding appears; purpose field threads into first Guided run.
- [ ] Drop 1 PDF (Autonomous) → activity rows show parse/classify/write; final row clickable to a concept page.
- [ ] Drop 3 PDFs (Guided) → run pauses; editable concept list + contradictions; approve subset; only approved pages written.
- [ ] Drop a folder of 40 files → `sourceFolder` badges per row; structure preserved.
- [ ] Auto-watch on → drop a file into `raw/` from Finder → auto-staged.
- [ ] Course-context form: pick existing course → agent writes into that course's `concepts/` folder; create new course inline → appears in Courses sidebar after ingest.
- [ ] Kill app mid-agent-run → reopen → activity panel reflects the still-running run (runs are persistent; the hook reattaches via `runs:fetch`).
- [ ] Design audit: same spacing/radius/color discipline as flashcards/dashboard.

---

## 9. Reference index

| What | Where |
|---|---|
| Current ingest screen | `apps/scholaros/apps/renderer/src/components/ingest-window.tsx` |
| Working ingest entry (agent path) | `apps/scholaros/apps/renderer/src/App.tsx:3941` (`handleIngestProcess` → `submitFromPalette("ingest",null)`) |
| Ingest tab mount | `apps/scholaros/apps/renderer/src/App.tsx:6090` (`IngestWindow` rendered when `selectedPath===INGEST_TAB_PATH`) |
| Run events forwarder | `apps/scholaros/apps/main/src/ipc.ts:364` (`emitRunEvent` → `runs:events`) |
| Run event union | `apps/scholaros/packages/shared/src/runs.ts` (`RunEvent`, `AskHumanRequestEvent`, `AskHumanResponseEvent`, `ToolInvocationEvent`, `ToolResultEvent`, `MessageEvent`, `RunErrorEvent`, `RunStoppedEvent`) |
| AskHuman renderer | `apps/scholaros/apps/renderer/src/components/ai-elements/ask-human-request.tsx`; wiring `App.tsx:85`, `:3233` `handleAskHumanResponse` |
| AskHuman input IPC | `apps/scholaros/apps/main/src/ipc.ts:748` (`runs:provideHumanInput`) |
| Agent ingest capability (to edit for AskHuman pause + purpose.md) | `apps/scholaros/packages/core/src/application/assistant/modules/file-ingest.ts` |
| Agent builtin tools | `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts:1226` (`parseFile`), `:1473` (`classifyFiles`) |
| Course registry shape | `apps/scholaros/.../file-ingest.ts:8-18` (`.scholar/courses.json` entries) |
| Dead queue handler | `apps/scholaros/apps/main/src/ipc.ts:657` (`ingest:enqueue` — only copies + enqueues, never drains) |
| Dead coordinator | `apps/scholaros/packages/core/src/academic/ingest-coordinator.ts` (never imported by main) |
| Dead PDF ingester | `apps/scholaros/packages/core/src/academic/pdf-ingester.ts` (only coordinator imports it) |
| Stage rail (Phase D) | `apps/scholaros/apps/renderer/src/components/ingest/ingest-stage-rail.tsx` |
| Folder picker IPC (Phase D) | `apps/scholaros/apps/main/src/ipc.ts:694` (`ingest:pickFolder`) |
| Raw watcher IPC (Phase D) | `apps/scholaros/apps/main/src/ipc.ts:703` (`ingest:watchRaw`), event: `ingest:rawFileEvent` |
| Course registry | `.scholar/courses.json` |
| Design contract | `design.md` |
| llm_wiki inspiration | https://github.com/nashsu/llm_wiki |

---

## 10. Suggested PR sequencing

1. `feat(ingest): remove dead wiki-pipeline path; one ingest button` (Phase A)
2. `feat(ingest): surface agent-run activity on ingest screen` (Phase B)
3. `feat(ingest): guided curate-before-commit via AskHuman` (Phase C)
4. `feat(ingest): folder import, course form, raw/ auto-watch` (Phase D)
5. `feat(ingest): first-run onboarding + purpose.md` (Phase E)
6. `chore(ingest): delete dead coordinator/queue/cache code` (Phase F)

---