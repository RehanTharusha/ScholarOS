# LLM Wiki Analysis — Feature & UI/UX Comparison

A deep-dive comparison between [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) (13k⭐, GPL v3) and ScholarOS. The goal is to identify what we can learn, borrow, or implement to make ScholarOS better.

Both projects share the same intellectual lineage — Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — but take different architectural approaches.

---

## Part 1: Feature-by-Feature Comparison

### Legend

- **Already Have** — ScholarOS has this, possibly better
- **Partial** — exists but incomplete or limited
- **Missing** — doesn't exist

| #   | Feature                                                                                          | Status       | Details                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Two-Step CoT Ingest** (analyze → generate + SHA256 cache + persistent queue)                   | Partial      | `ingest-coordinator.ts` is academic-PDF-specific (courseId, semester, autoTag). No general-purpose source→wiki pipeline. No SHA256 cache — every ingest re-processes unchanged files. No persistent queue with crash recovery / retry / cancel. LLM Wiki's two-phase pattern (analysis LLM call → generation LLM call) produces better quality than single-pass.                                 |
| 2   | **Multimodal Image Ingestion** (extract embedded PDF images + VLM captioning)                    | Missing      | We don't extract images from PDFs/DOCX/PPTX binaries. No VLM captioning pipeline. Images in ingested documents are invisible to the LLM.                                                                                                                                                                                                                                                         |
| 3   | **MinerU Cloud PDF Parsing** (cloud API for complex tables/formulas)                             | Missing      | We have a solid 5-layer fallback chain (pdf-parse → pdftotext → tesseract.js → LLM vision) in `builtin-tools.ts`. No cloud-parsing option for complex academic PDFs with tables, formulas, multi-column layouts. LLM Wiki uses MinerU as an optional enhancement; falls back to local pdfium.                                                                                                    |
| 4   | **4-Signal Knowledge Graph** (wikilink edges + source overlap + Adamic-Adar + type affinity)     | Missing      | Our `knowledge/graph/` is branch-based: user / directives / world branches with a tree of facts. It's disconnected from our file-based wiki. LLM Wiki builds its graph from `[[wikilinks]]` in actual markdown files + frontmatter `sources[]` fields. The 4-signal model weights edges: direct link (×3), source overlap (×4), Adamic-Adar (×1.5), type affinity (×1.0). We have no equivalent. |
| 5   | **Louvain Community Detection**                                                                  | Missing      | Automatic discovery of knowledge clusters from link topology. Not present in ScholarOS at all.                                                                                                                                                                                                                                                                                                   |
| 6   | **Graph Insights** (surprising connections + knowledge gaps)                                     | Missing      | LLM Wiki auto-surfaces: cross-community edges (surprising), isolated nodes (degree≤1), sparse communities (cohesion<0.15), bridge nodes (connecting 3+ clusters). Click an insight card → highlights nodes in graph + offers Deep Research button. We have none of this.                                                                                                                         |
| 7   | **Vector Semantic Search** (LanceDB-backed)                                                      | Partial      | We store PDF embeddings per-course as JSON files (`pdf-embeddings.ts`) but they're never queried for cross-wiki search. No vector database integration. LLM Wiki uses LanceDB via Tauri IPC for ANN retrieval with cosine similarity + blended scoring (`max(score) + 0.3 * sum(tail)`).                                                                                                         |
| 8   | **Persistent Ingest Queue** (crash recovery, retry, progress UI)                                 | Partial      | Our `ingest-coordinator.ts` is synchronous — one file at a time, no persistence, no retry. LLM Wiki serializes the queue to disk, survives app restart, retries failed tasks 3×, shows real-time progress bar + cancel button.                                                                                                                                                                   |
| 9   | **Folder Import** (recursive, structure-preserving, LLM classification hint)                     | Missing      | No bulk folder import feature. LLM Wiki imports entire folders recursively and passes the folder path to the LLM as a classification hint (e.g. `papers/energy` → LLM categorizes content as energy-related).                                                                                                                                                                                    |
| 10  | **Source Folder Auto-Watch**                                                                     | Partial      | `watcher.ts` (chokidar) exists but is not wired into an auto-ingest pipeline. LLM Wiki detects file changes in `raw/sources/` and automatically enqueues them for ingest or cascade deletion.                                                                                                                                                                                                    |
| 11  | **Deep Research**                                                                                | Already Have | Ours is more sophisticated: multi-round with LLM planning, query generation, early stopping, category-specific report formatting (`deep-researcher.ts`). LLM Wiki adds Tavily/SerpApi/SearXNG as search providers (we only have DuckDuckGo) and auto-ingests research results into the wiki.                                                                                                     |
| 12  | **Async Review System** (LLM flags items, predefined actions, stable IDs)                        | Missing      | Our contradiction detector works but `commit()` has `// TODO: create contradiction note` — never completed. LLM Wiki has a production review system: content-stable FNV-1a IDs (survive re-ingests), 5 types (contradiction/duplicate/missing-page/confirm/suggestion), pre-generated search queries, merge-on-collision with resolved-wins semantics.                                           |
| 13  | **Chrome Web Clipper** (Readability.js + Turndown.js)                                            | Missing      | Nothing. LLM Wiki ships a complete Manifest V3 extension that extracts articles via Mozilla Readability.js, converts to markdown via Turndown.js, and sends to a local clip server (port 19827).                                                                                                                                                                                                 |
| 14  | **Local HTTP API + MCP Server**                                                                  | Partial      | We have MCP infra in `core/src/mcp/` but no local HTTP API for external tools to query the knowledge base. LLM Wiki ships both: a JSON API at `127.0.0.1:19828` (search, graph, files, reviews, sources) and a standalone MCP server in `mcp-server/` that proxies to the API. Also has a ready-made agent skill for Claude Code / Codex.                                                        |
| 15  | **Multi-format Document Support** (PDF, DOCX, PPTX, XLSX, EPUB, ODS)                             | Partial      | The `parseFile` builtin tool in `builtin-tools.ts` handles these for agent-toold use (mammoth for docx, XLSX for xlsx, pdf-parse for PDF). But there's no auto-ingest pipeline for non-PDF formats into the wiki. LLM Wiki auto-extracts these into wiki pages.                                                                                                                                  |
| 16  | **Cascade File Deletion** (cleanup wiki pages, preserve shared entities, update index/wikilinks) | Missing      | Deleting a source in ScholarOS just removes the file. No cascade into wiki pages, index, or wikilinks. LLM Wiki: 3-method matching finds related wiki pages, preserves shared entities (only removes deleted source from `sources[]`), removes dead wikilinks, purges index.                                                                                                                     |
| 17  | **Configurable Context Window** (slider 4K–1M, 60/20/5/15 budget split)                          | Missing      | No configurable context budget. LLM Wiki has a slider in settings that proportionally allocates: 60% wiki pages / 20% chat history / 5% index / 15% system prompt.                                                                                                                                                                                                                               |
| 18  | **Multi-Conversation Chat**                                                                      | Already Have | Our `App.tsx` has full multi-tab chat with per-conversation persistence, drafts, model switching, regenerate. More featured than LLM Wiki's implementation.                                                                                                                                                                                                                                      |
| 19  | **Thinking / Reasoning Display** (`<think>` block rendering in chat)                             | Missing      | Reasoning tokens tracked for cost display only. No collapsible `<think>` block rendering. LLM Wiki: streaming 5-line opacity-fade during generation, collapsed by default, distinct visual style.                                                                                                                                                                                                |
| 20  | **KaTeX Math Rendering** (inline + block math in chat/preview)                                   | Partial      | KaTeX deps exist in lockfile and are used in LLM-generated HTML artifacts (web-artifacts-builder, revision-guide skills). Not used in the chat message renderer or wiki preview.                                                                                                                                                                                                                 |
| 21  | **Cross-Platform**                                                                               | Already Have | Electron handles this. LLM Wiki uses Tauri v2 with macOS-close-to-hide, Windows/Linux close confirmation, path normalization, Unicode-safe string handling. Different stack, same outcome.                                                                                                                                                                                                       |

---

## Part 2: Architecture Comparison

### LLM Wiki's Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Desktop App (Tauri v2)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ React 19 + Vite + Tailwind v4 + shadcn/ui               │ │
│ │                                                         │ │
│ │  App.tsx (orchestrator only)                            │ │
│ │    ├── AppLayout (3-column layout + resize)             │ │
│ │    │   ├── IconSidebar        (mode navigation)         │ │
│ │    │   ├── SidebarPanel       (file/knowledge tree)     │ │
│ │    │   ├── ActivityPanel      (ingest progress)         │ │
│ │    │   ├── ContentArea        (view router)             │ │
│ │    │   └── ResearchPanel      (right sidebar)           │ │
│ │    ├── WelcomeScreen                                    │ │
│ │    └── CreateProjectDialog                              │ │
│ │                                                         │ │
│ │  Stores (Zustand): wiki, chat, review, lint, research,  │ │
│ │                     activity, zoom, update, file-sync   │ │
│ │  Lib: ingest, graph, embedding, review, deep-research,  │ │
│ │       file-sync, auto-save, clip-watcher, project-store │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Rust Backend (Tauri Commands)                            │ │
│ │  fs ops, file watching, LanceDB vector store,            │ │
│ │  PDF extraction (pdfium), clipboard, dialog, autostart   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  MCP Server (separate Node.js process)                      │
│    → HTTP (127.0.0.1:19828) → Rust backend                  │
│                                                             │
│  Clip Server (separate, port 19827)                         │
│    ← Chrome Extension (Readability + Turndown)              │
└─────────────────────────────────────────────────────────────┘
```

### ScholarOS Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Electron App (apps/x)                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Main Process (Electron)                                 │ │
│ │  main.ts → initConfigs → setupIpcHandlers → services    │ │
│ │  Services: workspace watcher, runs watcher, research,   │ │
│ │            local sites, knowledge graph, agent notes     │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Renderer (React 19 + Vite + Tailwind)                   │ │
│ │  App.tsx (~6800 lines, monolithic)                      │ │
│ │    ├── Titlebar toolbar (view switches)                 │ │
│ │    ├── File sidebar (left)                              │ │
│ │    ├── Chat sidebar (right, toggleable)                 │ │
│ │    ├── Chat tabs (horizontal)                           │ │
│ │    ├── Content: file editor / chat / graph / canvases / │ │
│ │    │           browser / artifacts / calendar / research │ │
│ │    └── Components: sidebar-content, chat-sidebar,       │ │
│ │                    graph-view, version-history, ingest,  │ │
│ │                    research-panel, canvas, etc.          │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Packages (monorepo workspace)                            │ │
│ │  shared/   → types, validators, IPC schemas             │ │
│ │  core/     → business logic, AI, knowledge, search,     │ │
│ │              research, MCP, workspace, config, auth      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  Preload (contextBridge for IPC)                            │
│  MCP infra (core/src/mcp/, through main process)            │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Differences

| Dimension        | LLM Wiki                                                             | ScholarOS                                                                                                |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Desktop shell    | Tauri v2 (Rust backend)                                              | Electron (Node.js main process)                                                                          |
| State management | Zustand stores per domain                                            | React state (useState/useRef) in App.tsx                                                                 |
| Source↔wiki sync | Two LLM calls (analyze → generate), SHA256 cache                     | One LLM call (extract → suggest → commit), no cache                                                      |
| Graph data model | From `[[wikilinks]]` in markdown files                               | Separate in-memory tree (user/directives/world branches)                                                 |
| File formats     | PDF, DOCX, PPTX, XLSX, ODS, images, audio, video — all auto-ingested | PDF-focused with multi-fallback; other formats supported in agent `parseFile` tool but not auto-ingested |
| Vector search    | LanceDB (Rust, embedded)                                             | JSON files per-course, not queried for cross-wiki search                                                 |
| External access  | MCP server + HTTP API + agent skill                                  | MCP infra (no HTTP API)                                                                                  |
| Layout           | Clean 3-column, purpose-built layout files                           | Single 6800-line App.tsx                                                                                 |
| Error handling   | Error boundaries around content areas                                | None                                                                                                     |

---

## Part 3: UI/UX Comparison

### Layouts Side by Side

**LLM Wiki:**

```
┌──┬──────────────┬──────────────────┬────────────┐
│IC│  LEFT PANEL  │   CENTER AREA    │RIGHT PANEL │
│ON│ (resizable   │ (view changes    │(resizable,  │
│ S│  150-400px)  │  per mode)       │ optional)   │
│ID│ ┌──────────┐ │                  │            │
│EB│ │File Tree │ │ Chat / Wiki /    │  Research  │
│AR│ │   or     │ │ Search / Graph / │  Panel     │
│  │ │Knowledge │ │ Settings / etc.  │            │
│  │ │  Tree    │ │                  │            │
│  │ ├──────────┤ │                  │            │
│  │ │ Activity │ │                  │            │
│  │ │  Panel   │ │                  │            │
│  │ │(progress)│ │                  │            │
│  │ └──────────┘ │                  │            │
└──┴──────────────┴──────────────────┴────────────┘
```

**ScholarOS:**

```
┌─────────────────────────────────────────────────┐
│  Titlebar: [New Chat] [Version] [Focus] [Views] │
├─────────┬───────────────────────────────────────┤
│LEFT     │              CENTER                    │
│SIDEBAR  │                                       │
│(File    │  Chat Tabs (horizontal)               │
│ Tree)   │  ┌──┬──┬──┐                           │
│         │  │  │  │  │                           │
│         │  ├──┴──┴──┤  ───┐                    │
│         │  │        │  R  │                    │
│         │  │ Chat / │  I  │ (chat sidebar       │
│         │  │ File / │  G  │  toggleable)        │
│         │  │ Graph  │  H  │                    │
│         │  │        │  T  │                    │
└─────────┴──┴────────┴──────┘
```

### What Each Does Better

| Aspect                | ScholarOS Advantage                                                       | LLM Wiki Advantage                                             |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Navigation**        | Titlebar toolbar with view toggles                                        | Dedicated icon sidebar — always visible, one-click, 48px width |
| **File management**   | Full CRUD, rename with backlink rewrite, drag-drop                        | Read-only file tree + knowledge-aware tree (toggle)            |
| **Chat**              | Multi-tab with persistence, model switching, drafts                       | Single session but persistent across restarts                  |
| **Ingest UX**         | Overlay window with staging, review, commit steps                         | Docked activity panel — non-blocking, real-time progress       |
| **Research**          | Multi-round with planning (separate view)                                 | Side panel — research alongside current content                |
| **Design system**     | Comprehensive (`design.md`), documented primitives, neutral surfaces      | Standard shadcn/ui, less opinionated                           |
| **Layout**            | Feature-rich workspace (canvas, browser, flashcards, artifacts, calendar) | Clean 3-column focus — does fewer things better                |
| **Code organization** | Feature-rich but monolithic App.tsx (6800 lines)                          | Clean component decomposition (~120 lines per file)            |
| **Error resilience**  | No error boundaries                                                       | Error boundaries around content areas                          |

---

## Design Principle: Academic Specialization Over Generalization

**ScholarOS is not trying to be LLM Wiki.** LLM Wiki is a general-purpose personal knowledge base — it ingests anything (PDFs, DOCX, web clips, audio, video) into a flat wiki. ScholarOS is a **student's study operating system**. Every design decision must serve that mission.

When we "borrow" LLM Wiki patterns, we do so **selectively** — only where the pattern makes learning faster, knowledge retention stronger, or study workflows smoother. The pipeline stays **academic-first**:

- **Course structure is preserved** — notes organized by course/semester/module, not dumped into a flat wiki
- **Concept extraction is curriculum-aware** — the LLM knows you're studying CS201, not just ingesting random PDFs
- **Ingest hints are contextual** — folder paths like `courses/CS201/lectures/week-3/` inform the LLM how to categorize content
- **Output is study-optimized** — concept pages with prerequisites, difficulty levels, mastery tracking, not generic wiki pages
- **Academic metadata is mandatory** — frontmatter includes course, semester, difficulty, prerequisites, related concepts

**What we take from LLM Wiki:** the engineering quality — two-step CoT for better extraction, SHA256 caching to avoid redundant work, persistent queues for reliability, review systems for quality control, cascade deletion for consistency. These are **infrastructure improvements** that make the academic pipeline faster and more reliable.

**What we keep:** our academic domain model, course hierarchy, mastery tracking, study-focused UI, and the understanding that a student's knowledge base has structure (courses → modules → concepts → facts), not just a bag of markdown files.

### Tier 1 — High Impact, Build On What Exists

#### 1. Wiki-Link Knowledge Graph + Louvain

**What:** Build a graph from `[[wikilinks]]` in actual markdown files. Run Louvain community detection. Surface insights.

**Why:** Our `graph-view.tsx` already renders a force-directed SVG graph with zoom, pan, node drag, search, and folder-based legend. It's just orphaned — not fed from real wikilink data.

**Implementation:**

- New module: `core/src/knowledge/wiki-link-graph.ts`
  - Scan all `.md` files for `[[target]]` links (reuse existing regex from `wiki-link-rewrite.ts`)
  - Build undirected graph with edges weighted by co-occurrence
  - Run Louvain via `graphology-communities-louvain` (add dep)
  - Compute: 4-signal relevance, surprising connections (cross-community edges, hub-peripheral), knowledge gaps (isolated, sparse communities, bridge nodes)
- Wire `graph-view.tsx` to fetch from this module instead of manually constructed data
- Color nodes by community, size by degree, edge thickness by relevance weight

**Files to create/modify:**

- `packages/core/src/knowledge/wiki-link-graph.ts` (new)
- `packages/core/src/knowledge/graph-insights.ts` (new)
- `apps/renderer/src/components/graph-view.tsx` (wire to real data)
- Add IPC handler to serve graph data to renderer

**Effort:** ~2-3 days

---

#### 2. Strengthen Academic Ingest Pipeline

**What:** Upgrade `ingest-coordinator.ts` with LLM Wiki's engineering patterns (two-step CoT, SHA256 cache, persistent queue) while keeping and strengthening our academic domain model.

**Why:** Our ingest is currently single-pass (no analysis step), uncached (re-processes unchanged files), and synchronous (one file at a time, no crash recovery). These are engineering gaps, not domain gaps — fixing them makes the academic pipeline faster and more reliable without changing what makes it academic.

**What stays academic:**
- Course/semester/module hierarchy preserved
- Lecture notes, assignments, papers, concepts all keep their type-specific frontmatter
- Folder structure (`courses/CS201/lectures/`) still informs LLM categorization
- Output pages still have difficulty levels, prerequisites, course context

**What improves (from LLM Wiki):**
- Two-step CoT: analysis LLM call (extract concepts/connections) → generation LLM call (write structured pages)
- SHA256 cache: hash source content, skip re-ingest for unchanged files
- Persistent queue: serialize to disk, survive app restart, retry 3× on failure, progress events to UI
- Aggregate repair: after each ingest, repair `index.md`/`overview.md` for concurrent-write safety

**Files to create/modify:**

- `packages/core/src/academic/ingest-coordinator.ts` (refactor with two-step CoT + cache + queue)
- `packages/core/src/knowledge/ingest-cache.ts` (new — SHA256 check)
- `packages/core/src/knowledge/ingest-queue.ts` (new — persistent queue)
- `apps/renderer/src/components/ingest-window.tsx` (add progress)

**Effort:** ~3-4 days

---

#### 3. Review System

**What:** Async review queue where LLM flags items needing human judgment during ingest.

**Why:** Our contradiction detector works but never writes results anywhere. This is a small completion of existing work that unlocks significant value.

**Implementation:**

- LLM emits `---REVIEW: <type>---` blocks during ingest
- Content-stable IDs: FNV-1a hash of `type::normalizedTitle` (dependency-free, survives re-ingests)
- 5 types: contradiction, duplicate, missing-page, confirm, suggestion
- Persist to disk, merge-on-collision with resolved-wins semantics
- UI panel in renderer showing unresolved items with action buttons

**Files to create/modify:**

- `packages/core/src/knowledge/review-item.ts` (new — types + FNV-1a ID)
- `packages/core/src/knowledge/review-store.ts` (new — persistence + merge logic)
- `apps/renderer/src/components/review-panel.tsx` (new — UI)
- Wire into ingest pipeline after generation step

**Effort:** ~1-2 days

---

### Tier 2 — Moderate Effort

#### 4. Chrome Web Clipper

**What:** Browser extension that clips web pages to the wiki. Readability.js + Turndown.js, one-click.

**Why:** The `extension/` directory in LLM Wiki is essentially standalone and reusable. It's a Manifest V3 extension with Readability.js and Turndown.js bundled. No external API calls needed.

**Implementation:**

- Create `extension/` in ScholarOS (can largely copy from LLM Wiki — it's GPL v3, compatible)
- Implement a clip server in ScholarOS main process on a local port (e.g. 19827)
- Clip server receives POST with title + URL + markdown content → writes to `raw/sources/clips/`
- Auto-trigger ingest on new clip

**Files to create/modify:**

- `extension/manifest.json` (new)
- `extension/popup.html` + `popup.js` (new)
- `apps/main/src/clip-server.ts` (new — local HTTP server)
- `packages/core/src/academic/ingest-coordinator.ts` (wire clip ingestion)

**Effort:** ~2-3 days

---

#### 5. Cascade File Deletion

**What:** When a source is deleted, clean up associated wiki pages while preserving shared entities.

**Why:** Currently deleting a file just removes it. Leaves dangling references, orphaned pages, and stale index entries.

**Implementation:**

- On file delete event from watcher:
  1. Check frontmatter `sources[]` for all wiki pages
  2. If page's only source is the deleted file → remove entire page
  3. If page has multiple sources → remove this source from `sources[]` array only
  4. Remove dead `[[wikilinks]]` pointing to deleted pages
  5. Purge from index.md
  6. Remove embeddings from vector store

**Files to create/modify:**

- `packages/core/src/workspace/cascade-delete.ts` (new)
- `packages/core/src/workspace/watcher.ts` (wire cascade on delete)

**Effort:** ~1 day

---

### Tier 3 — Small Polish

#### 7. Think Block Rendering

Strip `<think>`...</think> from response text. Render in a collapsible section with distinct style (muted background, monospace, smaller text). Auto-collapse on completion, show "Show reasoning" label. ~50 lines of UI code in the chat message component.

**Effort:** ~1 hour

#### 8. KaTeX Math in Chat

Add `remark-math` + `rehype-katex` to the message renderer. Dependencies already in lockfile. Just need to add the plugins to the markdown rendering pipeline in the chat component.

**Effort:** ~1 hour

---

### Tier 4 — Patterns to Steal (Not Full Features)

#### a. Purpose.md Concept

A `purpose.md` file in the wiki that describes _why_ the wiki exists (goals, key questions, scope). The LLM reads it on every ingest and query for context. Different from schema — schema is structural rules, purpose is directional intent. ScholarOS has no equivalent. Easy to add — just create the file and reference it in system prompts.

#### b. Aggregate Repair Pass

After every ingest, do a fourth LLM call that reads + repairs `index.md` and `overview.md` to fix stale writes from concurrent ingests. Our `knowledge_index.ts` has the same race problem: when two ingests both read `index.md`, modify it, and write back, the second writer clobbers the first's entries. A repair pass after each ingest compensates.

#### c. Heading-Enriched Embeddings

Before embedding a chunk, prepend `pageTitle / headingPath` to the text. This gives each chunk structural context. Simple change to `pdf-embeddings.ts` that significantly improves retrieval quality for short chunks.

#### d. Content-Stable IDs for Review Items

FNV-1a hash of `type::normalizedTitle`. Deterministic, dependency-free, survives re-ingests. Use instead of UUIDs or counter-based IDs for any persistent entity that needs to remain stable across runs.

---

## Part 5: UI/UX Improvement Plan

### 1. Icon Sidebar (Mode Navigation)

Replace the titlebar view buttons with a persistent 48px icon sidebar on the leftmost edge.

```
Current:  [Titlebar buttons: Graph | Artifacts | Calendar | ...]
Proposed: [Icon strip: Wiki | Sources | Search | Graph | Lint | Review | Research | Settings]
```

Each icon is a tooltip-button. Active mode is highlighted with a filled icon + accent background. Switching calls `navigateToView()`. The icon sidebar is always visible regardless of view state — no more hunting for the right button.

**Why better:** Always visible, one-click, zero cognitive overhead. Takes minimal space.

### 2. Docked Activity Panel

Replace the modal `IngestWindow` with a persistent activity panel at the bottom of the left column.

```
Current:  [Overlay dialog: "Importing "lecture-3.pdf"..."]
Proposed: [Bottom of left sidebar: "3 files processing" with expandable progress]
```

Show a compact status bar when idle ("Ready") or a progress bar + file names + cancel button when active. Click expands to show full queue history with per-file status.

**Why better:** Non-blocking. Continue working while files ingest. Progress is always visible.

### 3. Knowledge Tree View

Add a toggle in the left panel header to switch between the filesystem tree and a knowledge-aware view organized by type.

```
Current:  courses/CS101/concepts/tcp-ip.md
Proposed: Concepts → TCP/IP → links to [Transport Layer] [OSI Model]
```

The knowledge tree reads the `knowledge_index.ts` categorization (entities, concepts, syntheses, resources, etc.) and renders `type:` frontmatter as collapsible groups. Each page's `[[wikilinks]]` are shown as expandable children.

**Why better:** Semantic navigation instead of raw filesystem. "What concepts do I have?" becomes instantly visible.

### 4. Non-Modal Research Panel

Show research results in a right-side panel alongside the current view, not as a separate screen that replaces content.

```
Current:  [Navigates to research view ← leaves current note]
Proposed: [Research panel slides in from right ← current content stays visible]
```

When research starts, a panel opens on the right showing real-time streaming progress. When complete, the report is shown in the panel. User can click "Save to wiki" or "Discuss" to bring findings into chat.

**Why better:** Context retention. You can research while looking at your current note.

### 5. Cleaner Component Architecture

Split `App.tsx` (6800 lines) into focused components:

| Current                                   | Proposed                                         |
| ----------------------------------------- | ------------------------------------------------ |
| App.tsx (layout + views + chat + toolbar) | App.tsx (orchestrator only)                      |
| —                                         | AppLayout (3-column layout + resize handles)     |
| —                                         | IconSidebar (mode navigation)                    |
| —                                         | SidebarPanel (file tree / knowledge tree toggle) |
| —                                         | ActivityPanel (ingest progress)                  |
| —                                         | ContentArea (routes to correct view)             |
| —                                         | ResearchPanel (right sidebar)                    |
| —                                         | Toolbar (new chat, zoom, history, focus)         |

Each component gets its own file, its own error boundary, and can be lazy-loaded independently.

---

## Quick Reference: File Mapping

| LLM Wiki Feature | LLM Wiki File                          | Our Existing Analog                  | What We'd Create                  |
| ---------------- | -------------------------------------- | ------------------------------------ | --------------------------------- |
| Wiki-link graph  | `src/lib/wiki-graph.ts`                | `knowledge/graph/graph.ts`           | `knowledge/wiki-link-graph.ts`    |
| Graph insights   | `src/lib/graph-insights.ts`            | —                                    | `knowledge/graph-insights.ts`     |
| Ingest pipeline  | `src/lib/ingest.ts` (2000 lines)       | `academic/ingest-coordinator.ts`     | `knowledge/ingest-pipeline.ts`    |
| Ingest cache     | `src/lib/ingest-cache.ts`              | —                                    | `knowledge/ingest-cache.ts`       |
| Review items     | `src/stores/review-store.ts`           | `academic/contradiction-detector.ts` | `knowledge/review-item.ts`        |
| Chrome extension | `extension/popup.js`                   | —                                    | `extension/` (new dir)            |
| Cascade delete   | `src/lib/project-file-sync.ts`         | `workspace/watcher.ts`               | `workspace/cascade-delete.ts`     |
| MCP server       | `mcp-server/src/index.ts`              | `mcp/mcp.ts`                         | Extend existing                   |
| HTTP API         | `src/lib/api-server-constants.ts`      | —                                    | `main/src/api-server.ts`          |
| App layout       | `src/components/layout/app-layout.tsx` | `App.tsx` (inlined)                  | `renderer/src/components/layout/` |

---

## Appendix: Key LLM Wiki Source Files

These are the most instructive files to read for implementation reference:

| Purpose                       | URL                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Ingest pipeline (the big one) | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/lib/ingest.ts`                      |
| Wiki graph construction       | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/lib/wiki-graph.ts`                  |
| Graph insights + 4-signal     | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/lib/graph-insights.ts`              |
| Embedding + vector search     | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/lib/embedding.ts`                   |
| Text chunker                  | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/lib/text-chunker.ts`                |
| Deep research (auto-ingest)   | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/lib/deep-research.ts`               |
| Review store + stable IDs     | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/stores/review-store.ts`             |
| File sync + cascade delete    | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/lib/project-file-sync.ts`           |
| MCP server (Node.js)          | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/mcp-server/src/index.ts`                |
| Chrome extension              | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/extension/popup.js`                     |
| App layout                    | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/components/layout/app-layout.tsx`   |
| Icon sidebar                  | `https://raw.githubusercontent.com/nashsu/llm_wiki/main/src/components/layout/icon-sidebar.tsx` |
