# Deep Research Feature — ScholarOS Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   UI (Renderer)                      │
│  research-panel.tsx  |  chat integration (App.tsx)   │
└──────────────────────┬──────────────────────────────┘
                       │ window.ipc.invoke
┌──────────────────────▼──────────────────────────────┐
│              IPC Handlers (main/ipc.ts)              │
│  research:start | status | cancel | result | list    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           Core Research Engine (@x/core)             │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │           ResearchHandler                      │   │
│  │  - Task registry & lifecycle                  │   │
│  │  - Persistence (~/.rowboat/research/*.json)   │   │
│  │  - Progress events via Electron IPC send      │   │
│  └──────────┬───────────────────────────────────┘   │
│             │ calls                                  │
│  ┌──────────▼───────────────────────────────────┐   │
│  │           DeepResearcher                      │   │
│  │  Iterative LLM-driven research loop:         │   │
│  │  PLAN → THINK → SEARCH → EXTRACT →           │   │
│  │         SYNTHESIZE → DECIDE → FINAL_REPORT   │   │
│  │  Uses Vercel AI SDK for all LLM calls        │   │
│  │  Uses DuckDuckGo API for search (no setup)   │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Search Provider (DuckDuckGo)                │   │
│  │  Built into @x/core/src/research/            │   │
│  │  No API key needed, no user setup            │   │
│  │  Parallel via Promise.all across queries     │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  AcademicCategories                           │   │
│  │  Literature Review | Compare & Contrast |     │   │
│  │  Methodology | Fact Check | Concept Explore   │   │
│  │  Problem Solving                              │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Step 0 — DuckDuckGo Search Provider

**Create:** `packages/core/src/research/search-provider.ts`

This is the first thing to build since the engine depends on it. Uses DuckDuckGo's free API endpoint — no registration, no API key, no user setup needed.

```typescript
export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

export async function searchDuckDuckGo(
  query: string,
  maxResults: number = 10,
  signal?: AbortSignal,
): Promise<SearchResult[]> { ... }
```

**How it works:**
- DuckDuckGo has a `lite.duckduckgo.com/lite/` HTML endpoint (used by browsers) — we send a GET request with `?q=` param and parse the HTML table of results
- No rate limit issues for personal/desktop use at the scale of deep research (tens of queries per session)
- All queries run in parallel via `Promise.all` — each round fires 3-4 searches simultaneously
- Accepts `AbortSignal` so cancellation works instantly
- If DuckDuckGo fails (unlikely), the research loop detects empty results and stops gracefully after 2 consecutive empty rounds (already built into the engine logic)

**Why not the existing browser-based search?**
The embedded browser approach opens a real Chromium tab per search — too slow for 4 parallel searches per round × up to 8 rounds = 32 individual browser operations. The DuckDuckGo API is a simple HTTP request, responds in <1s, and works in parallel with zero user-visible overhead.

---

## Step 1 — Shared Types (`@x/shared`)

**Create:** `packages/shared/src/research.ts`

```typescript
export const ResearchCategory = z.enum([
  "literature-review",
  "compare-contrast",
  "methodology",
  "fact-check",
  "concept-exploration",
  "problem-solving",
]);

export const ResearchProgress = z.object({
  phase: z.enum(["planning", "searching", "extracting", "synthesizing", "deciding", "finalizing"]),
  round: z.number(),
  totalRounds: z.number(),
  queriesFound: z.number(),
  sourcesFound: z.number(),
  findingsCount: z.number(),
  message: z.string().optional(),
});

export const ResearchSource = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string().optional(),
});

export const ResearchFinding = z.object({
  url: z.string(),
  title: z.string(),
  summary: z.string(),
});

export const ResearchStats = z.object({
  duration: z.number(),
  rounds: z.number(),
  queries: z.number(),
  urls: z.number(),
  model: z.string(),
  searchProvider: z.string(),
  category: ResearchCategory,
});

export const ResearchSession = z.object({
  sessionId: z.string(),
  query: z.string(),
  status: z.enum(["running", "done", "error", "cancelled"]),
  category: ResearchCategory,
  progress: ResearchProgress.optional(),
  result: z.string().optional(),
  sources: z.array(ResearchSource),
  findings: z.array(ResearchFinding),
  stats: ResearchStats.optional(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
});
```

**Modify:** `packages/shared/src/index.ts`
- Add `export * as research from "./research.js"`

---

## Step 2 — Research Engine (`@x/core/src/research/`)

### Create: `packages/core/src/research/deep-researcher.ts`

Core iterative research loop — port of Odysseus's `deep_research.py` to TypeScript using Vercel AI SDK.

```
class DeepResearcher {
  constructor(query, category, options: {
    model, provider, maxRounds, abortSignal,
    onProgress: (progress) => void
  })

  async research(): Promise<ResearchResult>
}
```

**Internal phases (IterResearch loop):**

| Phase | Method | Description |
|-------|--------|-------------|
| PLAN | `_createPlan()` | LLM generates 3-6 sub-questions, key topics, success criteria |
| THINK | `_generateQueries()` | LLM generates 4 broad queries (round 1) or 3 targeted follow-ups (round 2+) |
| SEARCH | `_search()` | Runs all queries in parallel via DuckDuckGo API. Dedup URLs against previously seen. |
| EXTRACT | `_extract()` | Fetches top N new URLs, LLM extracts relevant info using goal-based prompt. Filters low-quality extractions. |
| SYNTHESIZE | `_synthesize()` | LLM merges new findings into evolving report using sliding window of last N findings (not full history) |
| DECIDE | `_shouldStop()` | After min 2 rounds, LLM decides YES/NO. Also stops on max rounds or 2 consecutive empty rounds. |
| FINALIZE | `_finalReport()` | LLM writes polished ≥1000 word report with executive summary, sections, citations |

**Slice window strategy (avoids context bloat):**
- Evolving report = last 4000 characters
- New findings = last 3 findings
- This prevents the LLM from drowning in accumulated text — the IterResearch "streamlined workspace" principle

**Error handling per phase:**
- Every LLM call retries 2x with exponential backoff (1s, 3s)
- If all retries fail → phase fails → research status = "error" with message
- If search returns 0 results → round is "empty" → count consecutive empty rounds → stop at 2

### Create: `packages/core/src/research/research-handler.ts`

```
class ResearchHandler {
  private activeTasks = new Map<string, ActiveTask>()
  private researchDir: string  // ~/.rowboat/research/

  constructor() {
    // Ensure research directory exists on instantiation
    mkdirSync(this.researchDir, { recursive: true })
  }

  async startResearch(query, category?, options?): Promise<string>
  cancelResearch(sessionId): void
  getProgress(sessionId): ResearchProgress | null
  getResult(sessionId): ResearchSession | null
  listCompleted(): ResearchSession[]
  deleteResearch(sessionId): void
}
```

**ActiveTask structure:**
```typescript
interface ActiveTask {
  promise: Promise<void>;        // The running research
  abortController: AbortController;
  query: string;
  status: ResearchSession['status'];
  progress: ResearchProgress;
  resolve: () => void;           // Called when done/cancelled
}
```

**Cancellation pattern:**
- Uses `AbortController` (native JS, no dependency needed)
- When cancelled, the `abortController.abort()` fires, which is passed to all LLM calls and search calls
- The research loop catches the abort signal and sets status to "cancelled"

### Create: `packages/core/src/research/academic-categories.ts`

Category-specific prompts and formatting rules:

| Category | Use When... | Report Structure |
|----------|-------------|-----------------|
| `literature-review` | "Summarize the research on..." | Executive summary → Key themes → Research gaps → Conclusion |
| `compare-contrast` | "Compare X and Y..." | Overview → Comparison table → Pros/cons each → Recommendation |
| `methodology` | "How do I perform X technique..." | Background → Required tools → Step-by-step → Best practices |
| `fact-check` | "Is it true that..." | Claim → Evidence for → Evidence against → Verdict |
| `concept-exploration` | "Explain X in depth..." | Definition → Historical origins → Core theory → Applications → Debates |
| `problem-solving` | "How to solve X problem..." | Problem definition → Possible approaches → Recommended solution → Implementation |

### Create: `packages/core/src/research/index.ts`

```
export { DeepResearcher } from './deep-researcher.js'
export { ResearchHandler } from './research-handler.js'
export { searchDuckDuckGo } from './search-provider.js'
export { ACADEMIC_CATEGORIES, type AcademicCategoryId } from './academic-categories.js'
```

### Modify: `packages/core/src/index.ts`

Add `export * as research from './research/index.js'`

---

## Step 3 — DI Registration

### Modify: `packages/core/src/di/container.ts`

```typescript
import { ResearchHandler } from "../research/index.js";

container.register({
  researchHandler: asClass(ResearchHandler).singleton(),
});
```

---

## Step 4 — IPC Handlers

### Modify: `packages/shared/src/ipc.ts`

Add Zod schemas for these channels:

| Channel | req | res |
|---------|-----|-----|
| `research:start` | ResearchQuery | `{ sessionId: string }` |
| `research:status` | `{ sessionId: string }` | ResearchProgress \| null |
| `research:stream` | `{ sessionId: string }` | null (send channel) |
| `research:cancel` | `{ sessionId: string }` | `{ success: boolean }` |
| `research:result` | `{ sessionId: string }` | ResearchSession \| null |
| `research:list` | null | `{ sessions: ResearchSession[] }` |
| `research:delete` | `{ sessionId: string }` | `{ success: boolean }` |
| `research:progress` | ResearchProgress | null (send channel) |

The `research:progress` send channel lets the main process push real-time progress updates to the renderer (same pattern as existing `runs:events` / `services:events` / `browser:didUpdateState`).

### Modify: `apps/main/src/ipc.ts`

Add handler implementations in `setupIpcHandlers()`:

```typescript
"research:start": async (_event, args) => {
  const handler = container.resolve<ResearchHandler>("researchHandler");
  const sessionId = await handler.startResearch(args.query, args.category, args);
  return { sessionId };
},
"research:status": async (_event, args) => {
  const handler = container.resolve<ResearchHandler>("researchHandler");
  return handler.getProgress(args.sessionId);
},
"research:result": async (_event, args) => {
  const handler = container.resolve<ResearchHandler>("researchHandler");
  return handler.getResult(args.sessionId);
},
"research:list": async () => {
  const handler = container.resolve<ResearchHandler>("researchHandler");
  const sessions = await handler.listCompleted();
  return { sessions };
},
"research:delete": async (_event, args) => {
  const handler = container.resolve<ResearchHandler>("researchHandler");
  await handler.deleteResearch(args.sessionId);
  return { success: true };
},
"research:cancel": async (_event, args) => {
  const handler = container.resolve<ResearchHandler>("researchHandler");
  handler.cancelResearch(args.sessionId);
  return { success: true };
},
```

Also add `emitResearchProgress()` helper (matching `emitRunEvent` / `emitServiceEvent` pattern):

```typescript
function emitResearchProgress(sessionId: string, progress: ResearchProgress): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("research:progress", { sessionId, progress });
    }
  }
}
```

The `ResearchHandler` receives this function and calls it whenever progress updates.

---

## Step 5 — Agent Skill Integration

### Create: `packages/core/src/application/assistant/skills/deep-research/skill.ts`

A skill definition that teaches the Copilot agent when and how to use deep research:

- **When to trigger deep research vs. simple web-search:** Deep research is for complex, multi-faceted topics that require synthesizing information from multiple sources. Use it for literature reviews, comparisons, methodology deep-dives, fact-checking claims, and concept exploration. Don't use it for simple factual lookups (use `web-search` instead).
- **Available categories** and when each is appropriate
- **How it works:** The research runs in the background and the user sees progress in the research panel. Return the `sessionId` so the user can track progress. The final report is available via the panel.
- **Best practice:** Explain to the user that deep research takes 1-5 minutes depending on depth. Suggest the appropriate category based on their question.

### Modify: `packages/core/src/application/assistant/skills/index.ts`

Register the skill:

```typescript
{
  id: "deep-research",
  title: "Deep Research",
  summary: "Perform iterative multi-round academic research with web search, source extraction, and report synthesis. Use for literature reviews, comparisons, methodology research, fact-checking, concept exploration, and problem-solving.",
  content: deepResearchSkill,
}
```

### Modify: `packages/core/src/application/lib/builtin-tools.ts`

Add a `deep-research` built-in tool:

```typescript
"deep-research": {
  description: "Perform deep multi-round academic research on a topic. Returns a sessionId for tracking progress in the research panel.",
  inputSchema: z.object({
    query: z.string(),
    category: ResearchCategory.optional(),
    rounds: z.number().min(2).max(12).optional().default(6),
  }),
  execute: async (input) => {
    const handler = container.resolve<ResearchHandler>("researchHandler");
    const sessionId = await handler.startResearch(input.query, input.category as any, input);
    return {
      sessionId,
      message: `I've started deep research on "${input.query}". You can track progress in the Deep Research panel. I'll let you know when it's complete.`
    };
  },
  isAvailable: async () => true,
},
```

**Important: The tool returns immediately with a sessionId.** The agent does NOT wait for research to complete — it tells the user to check the panel. The research panel handles progress events and completion.

---

## Step 6 — Main Process Lifecycle

### Modify: `apps/main/src/main.ts`

Wire up the research progress forwarding:

```typescript
export async function startResearchWatcher(): Promise<void> {
  const handler = container.resolve<ResearchHandler>("researchHandler");
  // Handler calls emitResearchProgress() internally during research
  // No additional setup needed — the IPC handlers already exist
}

export function stopResearchWatcher(): void {
  // No cleanup needed — ResearchHandler is a singleton
}
```

Research progress is pushed to the renderer via the IPC send channel `research:progress`. The renderer listens with `window.ipc.on("research:progress", ...)`.

---

## Step 7 — Research Panel UI Component

### Create: `apps/renderer/src/components/research/research-panel.tsx`

A side panel (using shadcn `Sheet` or `Sidebar`) with:

```
┌─────────────────────────────┐
│ Deep Research               │
├─────────────────────────────┤
│ Query input (textarea)      │
│ Category dropdown           │
│ [Literature Review      ▼]  │
│ Rounds: ○4 ○6 ●8 ○12       │
│                             │
│ [Start Research]            │
├─────────────────────────────┤
│ Running:                    │
│ ┌─────────────────────────┐ │
│ │ "Quantum Computing"     │ │
│ │ [████████░░] 75%        │ │
│ │ Round 3/8 · Synthesizing│ │
│ │ ⏱ 2:34                  │ │
│ │ [Cancel]                │ │
│ └─────────────────────────┘ │
│                             │
│ Completed:                  │
│ ┌─────────────────────────┐ │
│ │ "ML Architectures"      │ │
│ │ ✓ Done · 4 rounds       │ │
│ │   12 sources · 45s      │ │
│ │ [Copy] [Discuss] [×]    │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**States per job card:**

| Status | Shows |
|--------|-------|
| `queued` | Query text, "Waiting..." badge |
| `running` | Progress bar, phase text, round X/Y, timer, Cancel button |
| `done` | "Done" badge, stats (rounds, sources, duration), Copy/Discuss/Delete buttons |
| `error` | "Error" badge, error message, Dismiss + Retry buttons |
| `cancelled` | "Cancelled" badge, Dismiss button |

**Implementation notes:**
- Uses `AcademicPageShell`, `AcademicPageHeader`, `AcademicMetricCard` from `academic-shell.tsx`
- Uses existing `ui/*` components (`Button`, `Select`, `Textarea`, `Progress`, `Badge`, `Sheet`, `Skeleton`)
- Listens to `research:progress` via `window.ipc.on("research:progress", handler)`
- Calls IPC via `window.ipc.invoke("research:start", ...)`
- Timer starts on "running" status, pauses on completion
- "Discuss" creates a follow-up chat with the report pre-seeded

### Create: `apps/renderer/src/components/research/research-synapse.tsx`

SVG visualization showing research progress (port of Odysseus's `researchSynapse.js`):

- Central query node
- Sub-question branch nodes animate in as planning completes
- Source leaf nodes scatter around branches as sources are discovered
- Color-coded by round
- Smooth CSS transitions for animations

### Create: `apps/renderer/src/components/research/index.ts`

```
export { ResearchPanel } from './research-panel'
export { ResearchSynapse } from './research-synapse'
```

---

## Step 8 — Chat Integration

### Modify: `apps/renderer/src/App.tsx`

**Deep Research toggle:**
- Add a "Deep Research" toggle button to the chat input toolbar area (next to existing voice/search toggles)
- Visual states: inactive (default) / active (highlighted) / running (pulsing + "Researching..." text)

**Flow when toggle is on:**
1. User types a message and presses Enter
2. Chat sends: `window.ipc.invoke("research:start", { query: message })`
3. Chat displays a system chat bubble: *"🔍 Researching: [query]"* with live progress (phase + round + timer)
4. Each `research:progress` event updates the bubble in real-time
5. On completion, the system bubble is replaced with the final markdown report as an assistant message
6. Sources are shown as a collapsible link list below the report
7. The chat input gets re-enabled for follow-up questions

**What happens to the agent when research is running?**
The agent does NOT respond — the research replaces the agent's turn. If the user sends another message during research, it gets queued (or cancels the current research — TBD based on UX preference).

**Reconnection on app restart:**
On mount, check for any research sessions with "running" status in `~/.rowboat/research/`. If found, optionally re-run them or mark as "error" with "app was closed" message.

---

## Edge Cases and Defensive Design

These are added protections beyond what Odysseus implements, to handle the desktop environment:

### Search failures
- DuckDuckGo HTML endpoint may change format → wrap parsing in try/catch with regex fallback
- If search returns 0 results → "empty round" counter → after 2 consecutive empty rounds, stop gracefully with partial results
- Network offline → research moves to "error" with clear message (not a confusing spinner)

### LLM failures
- Every LLM call: 2 retries with exponential backoff (1s, 3s)
- If model endpoint is unreachable → fail fast in `startResearch()` before beginning the loop
- ResearchHandler probes the LLM endpoint before launching the full research task

### Process lifecycle
- If the app closes during research → next launch, the research panel shows "app was closed" on that session
- Research runs as an async Promise in the main process — it yields on every `await`, so IPC stays responsive
- No blocking of file reads, chat, or other features during research

### Context window management
- Evolving report truncated to last 4000 characters before synthesis
- Only last 3 findings fed to the LLM per round (not all findings from all rounds)
- Max 12 rounds hard cap regardless of LLM's "continue" decision
- Every LLM call capped with `maxTokens` to prevent runaway responses

---

## Implementation Order

```
Step 0 (DuckDuckGo search provider)
  │
  ▼
Step 1 (shared types in @x/shared)
  │
  ▼
Step 2 (core engine in @x/core/src/research/)
  │
  ▼
Step 3 (DI registration in container.ts)
  │
  ▼
Step 4 (IPC handlers in shared/ipc.ts + main/ipc.ts)
  │
  ├──────────────────────┬──────────────────────┐
  ▼                      ▼                      ▼
Step 5 (agent skill)   Step 6 (lifecycle)    Step 7 (UI panel)
  │                      │                      │
  └──────────────────────┼──────────────────────┘
                         ▼
                   Step 8 (chat integration)
```

Steps 5, 6, and 7 are independent and can be built in parallel after Step 4.

---

## File Inventory

### Files to Create
| # | File | Purpose |
|---|------|---------|
| 0 | `packages/core/src/research/search-provider.ts` | DuckDuckGo API search (no setup needed) |
| 1 | `packages/shared/src/research.ts` | Zod schemas for research types + IPC channels |
| 2 | `packages/core/src/research/deep-researcher.ts` | Iterative research loop engine |
| 3 | `packages/core/src/research/research-handler.ts` | Task registry, persistence, progress events |
| 4 | `packages/core/src/research/academic-categories.ts` | Category definitions, prompts, formatters |
| 5 | `packages/core/src/research/index.ts` | Module barrel export |
| 6 | `packages/core/src/application/assistant/skills/deep-research/skill.ts` | Agent skill definition |
| 7 | `apps/renderer/src/components/research/research-panel.tsx` | Side panel UI |
| 8 | `apps/renderer/src/components/research/research-synapse.tsx` | SVG progress visualization |
| 9 | `apps/renderer/src/components/research/index.ts` | Component barrel export |

### Files to Modify
| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/index.ts` | Add `export * as research` |
| 2 | `packages/shared/src/ipc.ts` | Add research channel schemas |
| 3 | `packages/core/src/di/container.ts` | Register `ResearchHandler` singleton |
| 4 | `packages/core/src/application/assistant/skills/index.ts` | Register deep-research skill |
| 5 | `packages/core/src/index.ts` | Add `export * as research` |
| 6 | `apps/main/src/ipc.ts` | Add research handler implementations |
| 7 | `apps/main/src/main.ts` | Add research watcher lifecycle |
| 8 | `apps/renderer/src/App.tsx` | Add panel + chat research toggle + progress listeners |

---

## Key Design Decisions

1. **DuckDuckGo API for search** — Zero setup, no API key, no Docker, no browser tabs. Parallel queries via `Promise.all`. Free forever.

2. **Vercel AI SDK for all LLM calls** — Reuses ScholarOS's existing model infrastructure. Supports all provider flavors (OpenAI, Anthropic, Google, Ollama, OpenRouter, ScholarOS gateway).

3. **Academic categories** — Literature reviews, compare/contrast, methodology, fact-checking, concept exploration, problem-solving. Not product reviews.

4. **IPC event streaming** — Following existing `runs:events` / `services:events` pattern. Main process pushes to renderer via `webContents.send()`.

5. **File-based persistence** — JSON files in `~/.rowboat/research/`. Directory auto-created on first use.

6. **AbortController for cancellation** — Simple, native JS, no additional dependencies.

7. **Sliding window context** — Last 4000 chars of report + last 3 findings fed to synthesis. Prevents IterResearch's "cognitive suffocation."

8. **LLM probes before starting** — Tests endpoint reachability before launching the full research loop. Fail fast if model is unavailable.
