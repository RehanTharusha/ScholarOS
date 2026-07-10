# ScholarOS Knowledge Graph — Implementation Plan

A self-organising knowledge graph that accumulates what ScholarOS learns about the user from conversations: study habits, preferences, recurring question patterns, academic context, and standing instructions.

Adapted from `KNOWLEDGE_GRAPH.md` (Jarvis) to ScholarOS's existing architecture.

---

## Design Principles

- **Fail-open everywhere** — LLM failures at any step never break the system
- **Bounded token cost** — per-cycle and per-turn costs are capped regardless of graph size
- **Non-destructive** — purely additive; no existing code paths modified in a breaking way
- **Privacy-first** — all data local, stored in workspace directory

---

## Value Beyond LLM Context

The graph is more than a prompt injection — it's a **compiled model of the user's academic behaviour** that answers: what does this student care about, when do they work, what do they struggle with, how do they like to learn? This drives proactive features across the entire app. All items below derive from the same tree data with zero additional LLM calls — just query logic and math.

### Study Analytics & Insights

| Feature | Data Source | Value |
|---------|-------------|-------|
| **Study pattern dashboard** | Run timestamps + topic node access counts | Shows peak hours, most-studied subjects, weekly trends |
| **Knowledge gaps** | High-revisit-rate topics (same node accessed repeatedly = struggling) | "You've asked about cellular respiration 6 times — want to create flashcards?" |
| **Session continuity** | Last-accessed nodes per day | "Welcome back. Last session you were on Calculus derivatives." |
| **Retention tracking** | Time between accesses to same topic | Shows which concepts are decaying (spaced repetition signal) |
| **Struggle detection** | Same concept accessed with confusion markers → threshold trigger | Auto-suggest alternative explanations, videos, or tutor mode |
| **Adaptive interaction** | Graph learns preferred response style (detail level, tone, format) | Copilot adjusts automatically without explicit instructions |
| **Flashcard prompting** | Topic access count crosses threshold | "You've studied this 3 times — want Anki cards?" |
| **Study plan generation** | Graph tells us what they study, when, and for how long | Personalized schedule suggestions |

### UI-Facing Features

| Feature | Description |
|---------|-------------|
| **Graph explorer** | Interactive tree view of what the system knows about the user — browse, edit, delete facts |
| **Session recap** | On close, generate: "Studied X, Y, Z. Noticed you paused on W." |
| **Streak / consistency** | Track study streaks based on run activity |
| **Preference visualization** | "You study best 7-9pm, prefer bullet-point explanations" |
| **Most-accessed map** | Heatmap of the graph showing which branches get the most attention |

### Cross-System Integration

| Integration | Benefit |
|-------------|---------|
| **Calendar task prioritization** | Graph knows which courses the user is actively studying → auto-prioritize those tasks |
| **Knowledge base curation** | Topics the user frequently asks about → suggest creating a proper wiki note |
| **Exam prep routing** | Graph identifies most-accessed topics near exam dates → focus study plan |
| **Note suggestion** | If graph detects recurring questions on a topic not yet in the wiki → "Want me to create a note on this?" |

### Zero-Additional-LLM-Cost Principle

None of the above require extra LLM calls. They are all derived from:
- **Access counts** (pure counters)
- **Timestamps** (when nodes were created / accessed)
- **Tree structure** (which topics are related)
- **Node names/descriptions** (display-only, already stored)

The only ongoing LLM cost is the core pipeline (summarizer + extractor + merge). Everything else is a lightweight query against the structured tree.

---

## Triggers

| Trigger | When | Why |
|---------|------|-----|
| **Timer** | Every 15 minutes | Captures ongoing conversations |
| **App shutdown** | Before process exits | Captures last session's conversations |
| **Manual** | User clicks "Process Now" in settings | On-demand |

No startup trigger — nothing new has happened since last shutdown.

---

## Token Efficiency Design

| Optimization | Mechanism | Impact |
|-------------|-----------|--------|
| **Run filter** | Skip runs with <5 messages, no user messages, or purely tool interactions | No LLM call for irrelevant runs |
| **Batch limits** | Max 5 runs, max 10 facts per cycle | Bounded per-cycle cost |
| **Warm profile cap** | Top-N facts by access-decay score, max 800 tokens | Flat per-turn cost regardless of graph size |
| **Single-pass traversal** | One LLM call per fact, not per-depth | 3-5× reduction in traversal LLM calls |
| **Keyword pre-filter** | Deterministic keyword match before LLM fallback | Zero-cost dedupe for ~60% of facts |
| **Cold archive** | Nodes untouched 90d → moved to archive file | Active tree stays lean |
| **Access-decay scoring** | `access_count / (1 + age_days / 14)` | Most relevant facts surface first |

---

## File Map

```
apps/x/packages/shared/src/
  ├── ipc.ts                          # + knowledge-graph IPC channels (additive)
  └── service-events.ts              # + 'knowledge_graph' service name (additive)

apps/x/packages/core/src/knowledge/graph/
  ├── types.ts                        # GraphNode, Fact, Branch, MergeResult
  ├── graph.ts                        # KnowledgeGraph class — tree, CRUD, traversal
  ├── state.ts                        # Processed-run tracking (JSON state file)
  ├── summarizer.ts                   # Run conversation → ≤200 word summary + topics
  ├── extractor.ts                    # Summary → {(branch, fact)} tuples
  ├── traversal.ts                    # Single-pass LLM descent for fact placement
  ├── merge.ts                        # Supersede, dedupe, consolidate into node
  ├── split.ts                        # Auto-split when node >1500 tokens
  ├── warm-profile.ts                 # Build warm profile from User + Directives
  ├── service.ts                      # init(), processNewRuns(), lifecycle hooks
  └── index.ts                        # Barrel exports

apps/x/packages/core/src/
  ├── application/assistant/instructions.ts  # + warm profile injection in buildCopilotInstructions()
  └── di/container.ts                       # + KnowledgeGraph singleton registration

apps/x/apps/main/src/
  └── ipc.ts                          # + knowledge-graph IPC handler registration
```

---

## Phase 1: Data Layer — Graph Tree (File-Based)

### 1.1 `types.ts` — Core Types

```typescript
export type Branch = 'user' | 'directives' | 'world';

export interface GraphNode {
  id: string;
  name: string;
  description: string;      // 1-2 sentences for traversal decisions
  facts: string[];           // The actual stored knowledge (line-separated strings)
  parentId: string | null;   // null for root
  branch: Branch | null;     // null for root, set on fixed branches
  accessCount: number;
  lastAccessed: string;      // ISO 8601
  createdAt: string;
  updatedAt: string;
  archived: boolean;         // true = moved to cold archive
}

export interface MergeResult {
  success: boolean;
  incorporatedIndices: number[];
}

export interface WarmProfile {
  userFacts: string[];       // max ~1200 chars total
  directivesFacts: string[]; // max ~600 chars total
  buildTime: string;
}
```

### 1.2 `graph.ts` — KnowledgeGraph Class

**Persistence**: JSON file at `WorkDir/.knowledge-graph/graph.json`

```typescript
export class KnowledgeGraph {
  // ── Tree structure ──
  private nodes: Map<string, GraphNode> = new Map();

  // ── Lifecycle ──
  load(): Promise<void>        // Read JSON from disk
  save(): Promise<void>        // Write JSON to disk

  // ── CRUD ──
  createNode(parentId: string | null, name: string, branch?: Branch): string
  getNode(id: string): GraphNode | undefined
  getChildren(parentId: string): GraphNode[]
  updateNode(id: string, updates: Partial<GraphNode>): void
  deleteNode(id: string): void
  appendFacts(id: string, facts: string[]): void

  // ── Navigation ──
  getRoots(): GraphNode[]      // Returns root + 3 fixed branches
  getPath(id: string): string[]  // Ancestor chain from root
  bfs(startId: string): GraphNode[]
  findNodeByPath(path: string[]): GraphNode | undefined

  // ── Scoring ──
  touch(id: string): void      // Increment accessCount, update lastAccessed
  getTopNodes(count: number, excludeRoot?: boolean): GraphNode[]
  getRecentNodes(count: number): GraphNode[]

  // ── Cold Archive ──
  archiveNodes(olderThanDays: number): Promise<void>

  // ── Bootstrap ──
  ensureSeeded(): void         // Create root + 3 fixed branches if missing
}
```

**Bootstrap structure** (on first run):

```
root/
├── user/          (branch: "user")
├── directives/    (branch: "directives")
└── world/         (branch: "world")
```

### 1.3 `state.ts` — Processed-Run Tracking

```typescript
// State file: WorkDir/.knowledge-graph/state.json

export interface GraphState {
  processedRuns: Record<string, { processedAt: string }>;
  lastRunTime: string;
}

export function loadGraphState(): GraphState
export function saveGraphState(state: GraphState): void
export function markRunProcessed(runId: string, state: GraphState): void
```

---

## Phase 2: LLM Pipeline — Conversation → Facts

### 2.1 `summarizer.ts` — Run Summarization

**Input**: A `Run` (from `WorkDir/runs/<id>.jsonl`)
**LLM call**: Chat model
**Output**: `{ summary: string, topics: string[] }` | `null`

- Filters: skip runs with <5 messages, no user messages, or purely tool interactions
- Extracts user messages + assistant text responses as conversation text
- Sends to LLM with summarizer prompt (≤200 words, 3-5 topic keywords)
- **Hygiene**: no deflection narration, preserve attribution, separate topics
- Fail → return `null` (skip this run)

### 2.2 `extractor.ts` — Fact Extraction

**Input**: Summary text
**LLM call**: Chat model (temperature=0)
**Output**: `Array<{ branch: Branch, fact: string }>` | `[]`

- Classifies each fact into `user`, `directives`, or `world`
- Banned forms: meta-narrative, transient weather/time, assistant recommendations, common knowledge, offers to search
- Fail → return `[]` (no facts this cycle)

### 2.3 `traversal.ts` — Node Placement

**Input**: A single `{ branch, fact }`
**LLM call**: Router → chat model (single call, not per-depth)
**Output**: Target node ID

**Algorithm**:
1. Start at branch root (e.g., `user`)
2. Collect all child nodes at current depth
3. Send fact + child node names/descriptions to LLM in one shot
4. LLM picks best matching child (or "none" → stop)
5. If child picked, recurse into that child
6. Max depth: 8

**Keyword pre-filter**: Before any LLM call, compare fact tokens against node names using casefold+NFKC normalization. If exact match found, place there directly — no LLM call.

### 2.4 `merge.ts` — Fact Consolidation

**Input**: Target node + array of new facts
**LLM call**: Chat model (batched per target node)
**Output**: `MergeResult`

**Rules** (LLM decides):
1. **Supersession** — contradictions drop the old line
2. **Near-duplicate dedupe** — different wordings collapse to one
3. **Consolidation** — repeated patterns fold ("ate sushi Mon, Thu" → "regularly eats sushi")
4. **Meta-narrative pruning** — narration of assistant's own behaviour dropped
5. **Independence preservation** — uncontradicted facts coexist
6. **Hallucination guard** — rejects rewrites longer than `existing + new + 2` lines

Fail-open on any error → plain append.

### 2.5 `split.ts` — Auto-Split

**Trigger**: When a node's total fact character count > 1500 tokens (len/4 heuristic)
**LLM call**: Chat model
**Output**: 2-5 child categories with fact assignments

1. LLM proposes categories
2. Each fact assigned to exactly one child
3. Consolidation + pruning applied
4. Parent data cleared; parent description → summary
5. Safeguards: min 2 categories, each must have ≥1 fact
6. Fail → retain data, retry on next write

---

## Phase 3: Warm Profile Injection

### `warm-profile.ts`

```typescript
export function buildWarmProfile(graph: KnowledgeGraph): WarmProfile | null
```

- BFS walk User and Directives branches
- Sort collected facts by access-decay score
- Truncate: user facts ≤ 1200 chars, directives ≤ 600 chars
- Return `null` if graph empty or unseeded

### Integration in `instructions.ts`

```typescript
// In buildCopilotInstructions():
const warmProfile = buildWarmProfile(knowledgeGraph);
if (warmProfile) {
  result += formatWarmProfileBlock(warmProfile);
}
```

**Rendered format** (denial-template mirroring):

```
## INFORMATION THE USER HAS SHARED IN PRIOR CONVERSATIONS
- fact 1
- fact 2
...

## STANDING INSTRUCTIONS FROM THE USER
- directive 1
- directive 2
...
```

---

## Phase 4: Service

### `service.ts`

```typescript
export class KnowledgeGraphService {
  private graph: KnowledgeGraph;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isProcessing: boolean = false;

  async init(): Promise<void>     // Load graph, start 15min interval
  async shutdown(): Promise<void> // Process remaining runs, save, stop interval

  async processNewRuns(trigger?: 'timer' | 'shutdown' | 'manual'): Promise<void>
  // 1. Load state → find unprocessed runs
  // 2. Filter runs (copilot agent only, min message count)
  // 3. For each run: summarize → extract → traverse → merge
  // 4. Update state
  // 5. Emit service events via serviceLogger
}
```

### Event emission (via `ServiceLogger`):

- `run_start` with trigger type
- `progress` per run processed
- `run_complete` with summary (runs processed, facts extracted, nodes created)
- `error` on failure

---

## Phase 5: IPC & Integration

### 5.1 IPC Channels (`shared/src/ipc.ts`)

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `knowledge-graph:query` | invoke | Search graph for matching nodes |
| `knowledge-graph:getStats` | invoke | Node count, fact count, last run time |
| `knowledge-graph:getWarmProfile` | invoke | Get current warm profile text |
| `knowledge-graph:processNow` | invoke | Trigger manual processing cycle |

### 5.2 DI Registration (`container.ts`)

```typescript
container.register({
  knowledgeGraph: asClass(KnowledgeGraph).singleton(),
});
```

### 5.3 Main Process (`apps/main/src/ipc.ts`)

- Import `KnowledgeGraphService`
- Init on app ready, shutdown on `before-quit`
- Register IPC handlers for knowledge-graph channels

### 5.4 Service Name (`service-events.ts`)

```typescript
export const ServiceName = z.enum([
  'graph',          // Already exists
  'knowledge_graph',
  ...
]);
```

---

## Non-Goals (Phase 1)

| Feature | Why Not |
|---------|---------|
| SQLite | Project is file-based; JSON tree is simpler and sufficient |
| Vector embeddings | Adds complexity; LLM-based traversal is adequate for scale |
| Real-time graph UI | Follow-up; wireframe first |
| Auto-diary enrichment | Query-driven enrichment from conversation summaries is Phase 2 |
| Multi-user | Single-user desktop app |
| Migration from `agent-notes` | Separate systems; can coexist |

---

## Rollout Order

```
Phase 1 ── Core data layer ────────────────────────── Duration: ~1 session
  ├── types.ts
  ├── graph.ts (KnowledgeGraph class)
  └── state.ts

Phase 2 ── LLM pipeline ───────────────────────────── Duration: ~1-2 sessions
  ├── summarizer.ts
  ├── extractor.ts
  ├── traversal.ts
  ├── merge.ts
  └── split.ts

Phase 3 ── Warm profile + service ─────────────────── Duration: ~1 session
  ├── warm-profile.ts
  ├── service.ts
  ├── instructions.ts integration
  └── main process lifecycle

Phase 4 ── IPC + settings UI ──────────────────────── Duration: ~1 session
  ├── IPC channels
  ├── DI registration
  └── Settings tab (graph stats)
```

---

## Verification

```bash
cd apps/x && npm run deps && npm run lint
```

- Verify graph persists across app restarts (check JSON file created)
- Verify warm profile appears in copilot system prompt (debug log)
- Verify service processes runs on timer and shutdown
- Verify IPC returns graph stats
