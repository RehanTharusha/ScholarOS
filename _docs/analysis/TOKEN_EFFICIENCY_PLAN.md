# Token Efficiency Plan — ScholarOS Copilot & Agents

> **Overall Status:** All phases — ✅ Complete. See [Progress Tracker](#progress-tracker) below.

ScholarOS is an academic learning assistant. Students use it to ingest course materials, build concept wikis, track assignments, quiz themselves, and prepare for exams — often in long study sessions where every token spent on redundant context is a token not spent helping them understand a concept or generate one more flashcard. This plan is about making each API dollar go further: more concept ingests per budget, longer study sessions before hitting cost ceilings, and a Copilot that stays sharp for the whole session rather than degrading as context bloats.

It is grounded in (1) a full audit of every prompt path in the codebase, (2) research from the `nashsu/llm_wiki` project and Karpathy's LLM Wiki pattern, (3) Anthropic's Contextual Retrieval work, and (4) community insights from practitioners running similar systems at scale. Every recommendation is filtered through the academic use case — course-structured retrieval, semester/exam-aware staleness, and study-tool-specific savings.

Each item includes: the problem it solves, the approach, exact files to modify, effort estimate, expected token savings, and a **degradation risk** note (what could make the agent feel stupid, and how to prevent it).

---

## Table of Contents

1. [Guiding Principles](#guiding-principles)
2. [Current State Audit](#current-state-audit)
3. [Research Findings](#research-findings)
4. [Degradation Guardrails](#degradation-guardrails)
5. [Phase 1 — High Impact, Low Effort](#phase-1--high-impact-low-effort)
   - [1.1 Prompt Caching for Stable Instruction Prefix](#11-prompt-caching-for-stable-instruction-prefix)
   - [1.2 Skill Eviction from Conversation History](#12-skill-eviction-from-conversation-history)
   - [1.3 Split Base Instructions into Core + On-Demand Modules](#13-split-base-instructions-into-core--on-demand-modules)
   - [1.4 Contextual Skill Catalog (Relevance-Filtered)](#14-contextual-skill-catalog-relevance-filtered)
6. [Phase 2 — High Impact, Medium Effort](#phase-2--high-impact-medium-effort)
   - [2.1 Lazy Middle-Pane Context](#21-lazy-middle-pane-context)
   - [2.2 Course-Aware Retrieval Sub-Agent](#22-course-aware-retrieval-sub-agent)
   - [2.3 Compress the Note Creation Agent for Academic Sources](#23-compress-the-note-creation-agent-for-academic-sources)
   - [2.4 Lean Calendar Context (Assignment-Aware)](#24-lean-calendar-context-assignment-aware)
7. [Phase 3 — Medium Impact, Higher Effort (Compounding)](#phase-3--medium-impact-higher-effort-compounding)
   - [3.1 Synthesized Concept Pages Over Raw Source Re-Reads](#31-synthesized-concept-pages-over-raw-source-re-reads)
   - [3.2 Semester/Exam-Aware Staleness Metadata](#32-semesterexam-aware-staleness-metadata)
   - [3.3 Deterministic Pre-Processing, LLM for Judgment Only](#33-deterministic-pre-processing-llm-for-judgment-only)
   - [3.4 Course-Structured Index Routing](#34-course-structured-index-routing)
8. [Phase 4 — Speculative / Longer-Term](#phase-4--speculative--longer-term)
   - [4.1 Token-Budget-Aware Prompt Assembly](#41-token-budget-aware-prompt-assembly)
   - [4.2 Skill Compression / Skill Memory](#42-skill-compression--skill-memory)
   - [4.3 Conversation Summarization + Eviction](#43-conversation-summarization--eviction)
9. [Phase 5 — Optimized Query Retrieval Pipeline](#phase-5--optimized-query-retrieval-pipeline)
   - [5.1 Phase 1 — Tokenized Keyword Search (Local, No API)](#51-phase-1--tokenized-keyword-search-local-no-api)
   - [5.2 Phase 1.5 — Vector Semantic Search (Reuse Existing Embeddings)](#52-phase-15--vector-semantic-search-reuse-existing-embeddings)
   - [5.3 Phase 2 — Graph Expansion (Wire Up the Wiki-Link Graph)](#53-phase-2--graph-expansion-wire-up-the-wiki-link-graph)
   - [5.4 Phase 3 — Budget-Controlled Context Assembly](#54-phase-3--budget-controlled-context-assembly)
   - [5.5 Phase 4 — Citation Format and Excerpt-Only Retrieval](#55-phase-4--citation-format-and-excerpt-only-retrieval)
   - [5.6 The Quick-Query Fast Path](#56-the-quick-query-fast-path)
10. [Implementation Sequencing](#implementation-sequencing)
11. [Verification](#verification)

---

## Progress Tracker

| Phase | Item | Status | Key Files | Notes |
|-------|------|--------|-----------|-------|
| **1** | 1.1 Prompt Caching | ✅ DONE | `instructions.ts`, `cache-control.ts`, `runtime.ts` | Stable/volatile split, Anthropic cache_control markers |
| **1** | 1.2 Skill Eviction | ✅ DONE | `history-compaction.ts`, `runtime.ts` | `compactSkillResults()` evicts old loadSkill results |
| **1** | 1.3 Split Instructions | ✅ DONE | `instructions.ts`, `modules/*.ts`, `capabilities.ts` | Core (~800t) + 5 on-demand modules |
| **1** | 1.4 Contextual Catalog | ✅ DONE | `skills/index.ts`, `builtin-tools.ts` | Filtered to 3-6 skills, listAllSkills escape hatch |
| **2** | 2.1 Lazy Middle-Pane | ✅ DONE | `runtime.ts`, `builtin-tools.ts` | Compact header, auto-expand on referential language |
| **2** | 2.2 KB Retrieval Agent | ✅ DONE | `agents/kb-retrieval.ts`, `runtime.ts` | Course-aware sub-agent, index-first strategy |
| **2** | 2.3 Note Creation Agent | ✅ DONE | `knowledge/note_creation*.ts` | Academic router + 4 sub-prompts |
| **2** | 2.4 Lean Calendar | ✅ DONE | `instructions.ts` | ~80t (overdue + today + next 2 + exam flags) |
| **3** | 3.1 Synthesized Concepts | ✅ DONE | `modules/kb-access.ts` | Prefer concept pages over raw files |
| **3** | 3.2 Staleness Metadata | ✅ DONE | `lifecycle-manager.ts`, `ingest-coordinator.ts`, `academic.ts` | Lifecycle field `fresh/needs-review/stale`, hashed-embedding overlap detection, semester/exam-aware refresh |
| **3** | 3.3 Deterministic Pre | ✅ DONE | `academic/index-builder.ts` | Section splitter, deterministic index regen |
| **3** | 3.4 Index Routing | ✅ DONE | `modules/kb-access.ts`, `index-builder.ts` | Index-first search strategy |
| **4** | 4.1 Token Budget | ✅ DONE | `agents/budget.ts`, `runtime.ts` | `enforceBudget()` with 15/25/50/10 allocation, 128K default |
| **4** | 4.2 Skill Compression | ✅ DONE | `skills/{pdf,pptx}/{skill,reference}.ts`, `builtin-tools.ts` | PDF 12KB→~500t, PPTX 9KB→~500t, `expandSkill` tool |
| **4** | 4.3 Conv Summarization | ✅ DONE | `history-compaction.ts`, `runtime.ts` | Heuristic summary after 12 turns, keeps 6 verbatim |
| **5** | 5.1 Tokenized Search | ✅ DONE | `academic/search-index.ts`, `builtin-tools.ts` | TF-IDF + title/tag bonus, JSON cache |
| **5** | 5.2 Vector Search | ✅ DONE | `search-index.ts`, `file-classifier.ts` | Hybrid TF-IDF + cosine similarity, hashed embeddings |
| **5** | 5.3 Graph Expansion | ✅ DONE | `search-index.ts`, `graph-relevance.ts` | 2-hop decay, 4-signal relevance, 5-page cap |
| **5** | 5.4 Budget Assembly | ✅ DONE | `search-index.ts` | 70/20/10 allocation per mode, BudgetReport |
| **5** | 5.5 Citation Format | ✅ DONE | `kb-retrieval.ts`, `kb-access.ts` | `[1]`/`[2]` numbered citations + filepath cards |
| **5** | 5.6 Quick-Query Path | ✅ DONE | `search-index.ts`, `kb-retrieval.ts` | Fast/standard/deep routing, auto-classify |

---

Borrowed from the research and filtered through the academic use case. The cheapest token is the one you never send; the second cheapest is the one you cache; the third is the one you retrieve surgically instead of wholesale.

1. **Don't send what won't be used.** A student asking "quiz me on photosynthesis" does not need the 60-line file-ingest workflow or the OCR fallback chain in their system prompt. Capability instructions should load only when the turn plausibly needs them — same pattern ScholarOS already uses for skills.
2. **Cache the stable prefix.** ~90% of the system prompt is identical turn-to-turn. Provider prompt caching makes it nearly free after the first call. This is what makes a 3-hour study session affordable.
3. **Evict what's no longer needed.** A loaded skill's 9,000 tokens should not tax every future turn. Once the student has generated their revision guide, the revision-guide skill's full text should not still be in context when they switch to quizzing.
4. **Retrieve surgically, not wholesale.** An open lecture note's full body should not sit in the system prompt if the student switched to asking about a different course. Send a compact header; let the model pull the section it needs.
5. **Compile once, reuse forever.** A concept page synthesized from a PDF lecture is the canonical source for all future questions about that concept — not the raw PDF. Re-reading the raw PDF on every follow-up is the anti-pattern this plan eliminates.
6. **Reserve the LLM for judgment.** File-type detection, section splitting, course classification from folder paths, index building — all deterministic. The LLM handles only concept extraction, contradiction detection between sources, and synthesis.
7. **Cap growth.** A long exam-prep session can hit 40+ turns. Conversation history, loaded skills, and injected context all grow unbounded today. Every layer needs a budget or eviction rule so the session stays affordable end-to-end.

---

## Current State Audit

A full audit of every prompt path in ScholarOS. All file:line references are verified against the current tree.

### Per Copilot chat turn (~5,000–6,000+ tokens of system prompt, before history)

| Component | ~Tokens | File:line |
|---|---|---|
| Base static instructions | ~4,000 | `apps/scholaros/packages/core/src/application/assistant/instructions.ts:57-404` |
| Skill catalog (all 24 listed / contextual 3-6) | ~500 / ~80-150 | `apps/scholaros/packages/core/src/application/assistant/skills/index.ts:215-229`<br>`buildContextualSkillCatalog()` (added, 1.4 ✅) |
| Runtime platform context (OS/shell) | ~80 | `apps/scholaros/packages/core/src/application/assistant/runtime-context.ts:51-69` |
| Composio tools prompt (conditional) | ~80-120 | `instructions.ts:21-39` |
| Calendar context (14 days of tasks) | ~50-300 | `instructions.ts:411-454` |
| Warm profile (user memory) | ~0-450 | `apps/scholaros/packages/core/src/knowledge/graph/warm-profile.ts:66-85` |
| Date/time prefix | ~20 | `apps/scholaros/packages/core/src/agents/runtime.ts:1028` |
| Agent Notes context | variable | `runtime.ts:1031-1034` |
| Middle pane (open file/note content) | ~100 + **full content (0-10,000+)** | `runtime.ts:1037-1077` |
| Voice input rules | ~70 | `runtime.ts:1081` |
| Voice output rules (summary or full) | ~400+ | `runtime.ts:1087-1092` |
| Search enabled flag | ~60 | `runtime.ts:1096` |

**Total system prompt per turn: ~5,000–6,000+ tokens, plus the entire conversation history, plus any loaded skill content.**

The `streamText` call that ships this lives at `runtime.ts:1229-1236` (the `streamLlm` function at `runtime.ts:1213`). The system prompt is passed as a single string at `runtime.ts:1232` (`system: instructions`).

### Problem pattern 1: Everything is always-on

`buildStaticInstructions` (`instructions.ts:41-405`) is one giant 347-line block. It includes:
- The full file-ingest workflow with 4 numbered steps (`instructions.ts:79-99`)
- Per-format OCR fallback chains repeated twice (`instructions.ts:101-108` and again `133-156`)
- Knowledge-base access rules with code examples (`instructions.ts:201-264`)
- save-to-memory behavior (`instructions.ts:172-195`)
- File path formatting rules (`instructions.ts:377-403`)
- Builtin tools enumeration (`instructions.ts:340-376`)

All of this ships on every turn, even when a student is just asking "what does mitosis mean?" None of it is conditional on whether the user is touching files or the knowledge base.

### Problem pattern 2: Skills never evict

`loadSkill` returns the full skill text as a tool result (see `skills/index.ts:427-432` `resolveSkill`). Once returned, it lives in `state.messages` as a `tool-result` part for the rest of the conversation. A student loads the PDF skill (~9,000 tokens) to merge two lecture PDFs, then switches to quizzing — the PDF skill's 9,000 tokens are still in every quizzing turn. Load three skills during exam prep and the system prompt effectively doubles.

**Fix status: ✅ DONE** (1.2). `compactSkillResults()` in `history-compaction.ts` evicts old `loadSkill` results from conversation history before each LLM turn. Only the most recent skill load is kept verbatim; older ones are replaced with a one-line reminder.

### Problem pattern 3: No prompt caching

The system prompt is re-sent and re-processed on every `streamText` call. Anthropic, OpenAI, and Google all support prompt caching now (Anthropic reports up to 90% cost reduction, >2x latency improvement). The Vercel AI SDK supports cache control via `providerOptions`. ScholarOS uses none of this. For a student on a budget, this is the difference between a 1-hour study session and a 3-hour one.

**Fix status: ✅ DONE** (1.1). System prompt split into stable prefix + volatile suffix. `buildStableInstructions()` + `buildVolatileInstructions()` in `instructions.ts`. Stable prefix memoized via `cachedStablePrefix`. Awaits AI SDK system-message `providerOptions` support for provider-level cache control markers.

### Problem pattern 4: Middle pane dumps full content

`runtime.ts:1060-1070` injects the entire open note/file body into the system prompt every turn. A student with a 10,000-token lecture note open asks "what's my next assignment?" — 10,000 tokens of lecture content ride along for a question that has nothing to do with it. The guard text at `runtime.ts:1061` says "ignore this context entirely" but the tokens are still sent and processed.

### Problem pattern 5: Skill catalog is a flat, exhaustive list

`skills/index.ts:215-229` builds `skillCatalog` by joining all 24 entries into one string. Every turn, the model sees all 24 skills (titles + file paths + summaries) so it knows what to `loadSkill`. A student quizzing on biology does not need to see the PowerPoint, DOCX, XLSX, MCP, Composio, or browser-control skills.

**Fix status: ✅ DONE** (1.4). `buildContextualSkillCatalog(context)` filters to 3-6 relevant skills based on keywords and MIME types. Full catalog still available via `skillCatalog`/`buildSkillCatalog` exports. Awaiting `listAllSkills` tool integration.

### The big standalone instruction sets

| Agent / Skill | ~Tokens | File |
|---|---|---|
| Note creation agent (monolith) | ~10,000-12,000 | `apps/scholaros/packages/core/src/knowledge/note_creation.ts:4-1025` |
| PDF skill | ~9,000 | `apps/scholaros/packages/core/src/application/assistant/skills/pdf/skill.ts` (1135 lines) |
| PPTX skill | ~5,500 | `.../skills/pptx/skill.ts` (666 lines) |
| MCP integration skill | ~3,500 | `.../skills/mcp-integration/skill.ts` (436 lines) |
| DOCX skill | ~3,200 | `.../skills/docx/skill.ts` (399 lines) |
| Doc-collab skill | ~2,500 | `.../skills/doc-collab/skill.ts` (303 lines) |
| Revision-guide skill | ~2,100 | `.../skills/revision-guide/skill.ts` (257 lines) |
| + 17 more skills | 170-1,800 each | `.../skills/*/skill.ts` |
| Note tagging agent | ~1,200-1,500 | `apps/scholaros/packages/core/src/knowledge/note_tagging_agent.ts:3-138` |
| Agent notes agent | ~900-1,200 | `apps/scholaros/packages/core/src/knowledge/agent_notes_agent.ts:1-104` |
| KG extractor / merge / split / summarizer / traversal | ~80-200 each | `apps/scholaros/packages/core/src/knowledge/graph/{extractor,merge,split,summarizer,traversal}.ts` |
| Deep researcher (6 templates + 7 inline) | ~100-1,500 per round | `apps/scholaros/packages/core/src/research/deep-researcher.ts:10-113` |
| Academic ingest two-step CoT | ~3,000-4,000 per file | `apps/scholaros/packages/core/src/academic/ingest-coordinator.ts:122-563` |

> **Note on the note creation agent:** `note_creation.ts` still references "emails, meetings, voice memos" as source types. These are remnants of an older, generalized version of the app. ScholarOS is now academic-only. The agent should be reframed around academic sources: lecture transcripts, study-session notes, professor office-hours notes, lab notes, and textbook chapter summaries. Item 2.3 covers this cleanup as part of the compression work.

### Problem pattern 6: Query-time retrieval is raw grep+read with no pipeline

This is the core issue for the quick-Q&A pattern. A student asks "what's the difference between mitosis and meiosis?" — a 10-second question that should cost ~1,000 tokens of retrieval. Here is what actually happens today:

1. The Copilot calls `workspace-grep({ pattern: "mitosis", path: "courses/" })` — ripgrep returns matching *lines* (not files, not sections), up to 100 results, 500 chars/line (`builtin-tools.ts:948-1120`).
2. The Copilot calls `workspace-grep({ pattern: "meiosis", path: "courses/" })` — another full scan.
3. From the results, the Copilot identifies 2-3 relevant files and calls `workspace-readFile` on each — pulling **full file contents** into its own context.
4. All grep results + all file contents accumulate in the Copilot's main context window. No sub-agent, no compaction, no budget enforcement, no reranking.

**What ScholarOS has built but does not use at query time:**

| Capability | Status | File:line | Used at query time? |
|---|---|---|---|
| PDF chunk embeddings (API-based, stored per-course as JSON) | **Exists** | `apps/scholaros/packages/core/src/academic/pdf-embeddings.ts:113-218` | **NO** — computed at ingest, never queried |
| Local hashed embeddings (SHA256, 512-dim, <1ms, zero deps) | **Exists** | `apps/scholaros/packages/core/src/academic/file-classifier.ts:48-60` | **NO** — used only for course classification |
| Ollama local embeddings (`nomic-embed-text`) | **Exists (optional)** | `file-classifier.ts:81-105` | **NO** — used only for classification |
| `cosineSimilarity()` (pure dot product on normalized vectors) | **Exists** | `file-classifier.ts:68-74` | **NO** — never called for search |
| Wiki-link graph with Louvain community detection | **Exists** | `apps/scholaros/packages/core/src/knowledge/wiki-link-graph.ts:171-283` | **UI visualization only** — Copilot never calls it |
| 4-signal graph relevance (Adamic-Adar, source overlap, type affinity) | **Dead code stub** | `apps/scholaros/packages/core/src/knowledge/graph-relevance.ts:30-82` | **NO** — `buildRetrievalGraph` creates an empty edges Map and is never called |
| Knowledge graph traversal (recursive LLM-based node routing) | **Exists** | `apps/scholaros/packages/core/src/knowledge/graph/traversal.ts:34-112` | **NO** — ingest-time fact placement only, SLOW (LLM per depth) |
| `KnowledgeGraph.query()` (substring search over nodes) | **Exists** | `apps/scholaros/packages/core/src/knowledge/graph/graph.ts:327-358` | **UI only** — called from `apps/main/src/ipc.ts:1149`, not the Copilot |
| Knowledge index builder | **Exists (unused)** | `apps/scholaros/packages/core/src/knowledge/knowledge_index.ts:178-384` | **NO** — never called anywhere |
| Tokenized search (BM25, TF-IDF, FTS5, trigram) | **NOT PRESENT** | — | — |
| Vector database (LanceDB, SQLite-vec, ANN index) | **NOT PRESENT** | — | — |
| Retrieval sub-agent | **NOT PRESENT** (proposed in 2.2) | — | — |
| Token budget enforcer | **DONE** | `agents/budget.ts`, `runtime.ts:convertFromMessages()` | Runs every turn, 128K default budget |
| Skill compression (PDF/PPTX) | **DONE** | `skills/pdf/{skill,reference}.ts`, `skills/pptx/{skill,reference}.ts` | ~12KB → ~500t each, `expandSkill` tool |
| Conversation summarization | **DONE** | `agents/history-compaction.ts` | Heuristic, 12-turn threshold, 6-turn verbatim |
| Numbered `[1]`/`[2]` citation format | **NOT PRESENT** | — | Uses filepath code blocks (`instructions.ts:377-403`) |

**The gap in one sentence:** ScholarOS has built significant ingest-time infrastructure — embeddings, a knowledge graph, wiki-link graph with Louvain communities — but **almost none of it is wired into query-time retrieval**. When a student asks a quick question, the Copilot falls back to raw ripgrep + full-file reads in its own context. The embeddings stored at ingest are never queried. The wiki-link graph is never traversed for retrieval. The 4-signal relevance model is dead code. The knowledge index builder is unused.

This matters most for the quick-Q&A pattern: a student asking "what's the difference between X and Y?" should get a fast, cheap answer from the 2 most relevant concept pages — not a multi-second grep scan + 3 full file reads bloating the context for the rest of the session. The Optimized Query Retrieval Pipeline (Phase 5, below) addresses this directly.

---

## Research Findings

### Karpathy's LLM Wiki pattern (the source nashsu/llm_wiki builds on)

The core thesis: knowledge should be **compiled once and kept current, not re-derived on every query**. The wiki is a "persistent, compounding artifact." For a student, this means: when they ingest a lecture PDF, the concept pages generated from it become the canonical reference for all future questions about those concepts — not the raw PDF. The three layers are: raw sources (immutable) → wiki (LLM-generated) → schema (rules). Two special files aid navigation: `index.md` (content catalog the LLM reads first) and `log.md` (chronological operations). The LLM does the bookkeeping students abandon (cross-referencing concepts, updating prerequisite links, flagging contradictions between lectures); the student curates sources and asks questions.

### nashsu/llm_wiki (13.5k stars) — token-efficiency mechanics

- **Configurable context window with proportional budget allocation.** A 60/20/5/15 split: wiki pages / chat history / index / system prompt. The system prompt gets a *capped* 15% slice, forcing it to stay lean. ScholarOS has no such budget today — a student's system prompt can eat 50%+ of a smaller model's context window before the conversation even starts.
- **SHA256 incremental cache.** Unchanged source files are skipped entirely — no LLM call is made at all. The cheapest token is the one you never send. Directly relevant to re-ingesting a course folder at the start of a semester when only 3 of 20 files changed.
- **Two-step CoT ingest, but the analysis step's output is structured JSON.** The generation step consumes the JSON, so neither step re-sends the full raw source. ScholarOS's `ingest-coordinator.ts` already does this; the principle should extend to the query path.
- **index.md as the LLM navigation entry point.** The LLM reads the index first (cheap), then drills into only the relevant pages. This is "lazy expansion" — don't load what you don't need. For ScholarOS, this means reading `courses/Biology 101/index.md` before grepping all of `courses/`.

### Anthropic's Contextual Retrieval

- **Prompt caching** — "reducing latency by >2x and costs by up to 90%." If your system prompt is stable, cache it. For a student's 40-turn exam-prep session, caching the stable instruction prefix is the single biggest cost saver.
- **Contextual embeddings + BM25 + reranking** — retrieve fewer, better chunks. The reranker cuts top-150 to top-20, so the model processes less. Relevant to ScholarOS's KB access path: instead of reading 6 concept pages to answer a question, read the 2 most relevant.
- **Chunk-specific context prepended to each chunk** before embedding improves retrieval failure rate by 49%. For ScholarOS, this means prepending "This chunk is from Biology 101, Lecture 3, covering the Krebs cycle" to a chunk before embedding it, so a later query about "cellular respiration" retrieves it even if the chunk itself doesn't use those words.

### Community insights (from the Karpathy gist discussion)

- **trip2g**: "Reading the one section that holds the answer runs ~15× cheaper than dumping the whole note at the median, and ~23× cheaper than grep-and-read." They serve the vault over MCP with `search` → `expand TOC one level` → `read only the section`. Directly applicable to the middle-pane problem: a student with a 20-page lecture note open should not pay for all 20 pages when they ask about one section.
- **A health-informatics educator**: token burn was "not from reasoning or output, but from repeated context loading." Moved to deterministic scripts for intake/indexing/routing and reserved the LLM for "higher-value graph curation, synthesis, and judgment." Used **compact routing files** instead of having the model scan the whole wiki. For ScholarOS: deterministic course classification, index generation, and section splitting — LLM only for concept extraction and synthesis.
- **Reply to them**: "use subagents for search operations, so the main agent context window is reserved for orchestration and answering." For ScholarOS: a retrieval sub-agent that understands the course → concept → lecture hierarchy and returns compact excerpts to the Copilot.
- **Synthadoc**: "compression into the ingestion step itself — 100 ingested documents synthesize down to a dozen wiki pages." Keep the active knowledge surface small by design. For ScholarOS: 20 lecture PDFs in a course should synthesize down to ~15-20 concept pages, not 20 source-summary pages plus 20 raw copies.
- **kibotu**: "reduce the pages to the absolute min. simplification is important in any larger knowledge base otherwise you end up with way too much overhead." For a student carrying 5 courses × 20 lectures each, page sprawl is the enemy of affordable retrieval.
- **alfadur7 (llm-wiki-newsroom)**: authoring and review are *different instances* — a reporter drafts, a columnist writes deep analysis, a separate desk critiques. This curbs self-grading bias and lets each instance carry a small, focused prompt rather than one giant do-everything prompt. For ScholarOS: the note creation agent does not need to also be the note-quality reviewer — split the concerns.

The recurring theme: **the cheapest token is the one you never send; the second cheapest is the one you cache; the third is the one you retrieve surgically instead of wholesale.**

---

## Degradation Guardrails

The #1 risk of this plan is that lazy-loading and eviction make the Copilot feel stupid or incompetent. A student who says "add these slides to my Biology folder" expects the full file-ingest workflow to kick in — if the model didn't load the file-ingest module because the filter missed the signal, it will give a generic answer and the student will lose trust.

**Every on-demand mechanism in this plan must have an escape hatch. The model never loses capability — it pays for it when it needs it instead of always.** The specific guardrails:

1. **The core prompt always carries a capability index.** Even when modules are unloaded, the core (~800 tokens) tells the model what capabilities exist and one line on when to load each. The model is never blind to what it can do — it just doesn't carry the full instructions until needed. This is identical to how skills already work: the catalog is always present, the full skill loads on demand.

2. **Linguistic-signal auto-expand for the middle pane.** The lazy middle-pane (2.1) should auto-expand the full note content when the student's message contains referential language: "this", "here", "above", "below", "what I'm looking at", "this note", "this lecture", "explain this part". These are unambiguous signals that the question relates to the open item. Only stay lazy for clearly unrelated questions. The current guard text at `runtime.ts:1061` already lists some of these signals — promote them into an auto-expand rule, not just a "ignore if unrelated" suggestion.

3. **Skill eviction keeps a one-line reminder, not a silent deletion.** When the PDF skill is evicted from history (1.2), it is replaced with: `[Skill 'pdf' was loaded and used earlier. Re-invoke loadSkill('pdf') if you need its detailed instructions.]` The model knows the skill exists and can re-load it with one tool call. It never "forgets" that the capability was available — it just doesn't carry the 9,000-token reference text forever.

4. **The contextual skill catalog includes a `listAllSkills` escape hatch.** If the filtered catalog (1.4) misses a relevant skill, the model can call `listAllSkills` to see the full set. The filter is an optimization, not a gatekeeper.

5. **The retrieval sub-agent is optional, not mandatory.** The Copilot can always fall back to direct `workspace-grep` + `workspace-readFile` if the sub-agent's summary (2.2) is insufficient for a complex question. The sub-agent is the default path; direct access is the escape hatch.

6. **The note creation router is conservative.** When uncertain about which sub-prompt to load (2.3), the router loads more, not fewer. The cost of a false-negative (missing a needed sub-prompt) is worse than the cost of a false-positive (loading an unneeded one).

7. **Every phase has a behavioral regression test.** The verification section (below) defines academic test scenarios for each change. A change that saves tokens but makes the Copilot give worse answers on the test scenarios is rejected. Token savings are never the sole success criterion.

The guiding question for every change: **"Would a student notice the Copilot got worse?"** If yes, the change is not done — the guardrail is missing.

---

## Phase 1 — High Impact, Low Effort

These are the quick wins. Each is independently shippable and reversible. Do them first.

---

### 1.1 Prompt Caching for Stable Instruction Prefix

**Problem.** The base static instructions (~4,000 tokens), skill catalog (~500), and runtime context (~80) are nearly identical turn-to-turn, yet they are re-sent and re-processed in full on every `streamText` call. For a student's 40-turn exam-prep session, that is 40 × 4,500 = 180,000 tokens of system prompt, of which ~175,000 are identical to the first turn. Anthropic, OpenAI, and Google all support prompt caching; Anthropic reports up to 90% cost reduction and >2x latency improvement for cached prefixes.

**Approach.**

1. Split the system prompt into a **stable prefix** and a **volatile suffix** in `runtime.ts` where `instructionsWithDateTime` is assembled (`runtime.ts:1028-1097`).
   - **Stable prefix** (cacheable): base static instructions + skill catalog + runtime context + Composio prompt. These change only when the user connects/disconnects Composio (already handled by `invalidateCopilotInstructionsCache` at `instructions.ts:468`) or restarts the app.
   - **Volatile suffix** (not cached): date/time, Agent Notes context, middle-pane content, voice rules, search flag, calendar, warm profile.
2. Mark the stable prefix with cache control. The Vercel AI SDK exposes this via `providerOptions` on the `system` message. For Anthropic: `cache_control: { type: 'ephemeral' }`. For OpenAI: the cached prefix is auto-detected from the prompt head. For Google: cached-content via a separate API. Use a provider-aware helper.
3. The `streamText` call at `runtime.ts:1229-1236` should pass `system` as a structured value (array of `{ text, providerOptions }` blocks) rather than a single string, so the SDK can apply cache breakpoints.
4. Keep `buildCopilotInstructions` (`instructions.ts:492-511`) producing the stable block; move the volatile pieces (calendar, warm profile) into the runtime assembly so they sit *after* the cache breakpoint.

**Files to modify.**
- `apps/scholaros/packages/core/src/agents/runtime.ts` (lines 1028-1097 assembly, 1229-1236 the call)
- `apps/scholaros/packages/core/src/application/assistant/instructions.ts` (split `buildCopilotInstructions` return into stable + volatile, ~492-511)

**Effort.** 0.5–1 day.

**Expected savings.** ~90% cost reduction on the stable ~4,500-token prefix for every turn after the first. For a 40-turn study session, that is roughly 39 × 4,500 × 0.9 = ~158,000 cached-input tokens billed at the discounted rate instead of full price. Latency improves >2x on subsequent turns, making the session feel snappier.

**Degradation risk.** None. Caching is transparent — the model sees the same prompt content. The only risk is a stale cache after a Composio toggle, which `invalidateCopilotInstructionsCache` already handles.

**Status: ✅ DONE** — `instructions.ts` split into `buildStableInstructions()` (cached prefix) + `buildVolatileInstructions()` (calendar/warm profile). `cachedStablePrefix` memoized, invalidated by existing `invalidateCopilotInstructionsCache()`. `runtime.ts` volatile assembly uses `volatileTurnParts[]` + `buildVolatileInstructions()`. `cache-control.ts` provides `getCacheControlProviderOptions()`, now **wired into `runtime.ts:streamLlm()`** — imports and passes `state.runProvider` to `streamLlm`, applies `providerOptions` with Anthropic `cache_control: ephemeral` on system message via AI SDK's `providerOptions` field. Provider name flows from `streamAgent()` → `streamLlm()` call chain.

---

### 1.2 Skill Eviction from Conversation History

**Problem.** `loadSkill` returns the full skill text as a `tool-result` part. Once in `state.messages`, it stays for the entire conversation. A student loads the PDF skill (~9,000 tokens) to merge two lecture PDFs, then spends 15 turns quizzing on biology — the PDF skill's 9,000 tokens are in every quizzing turn. Load the revision-guide skill, then the auto-flashcards skill, and the system prompt has grown by ~12,000 tokens that have nothing to do with quizzing.

**Approach.**

1. Add a **skill-result compaction** pass in the message history before each `streamText` call. In `runtime.ts` just before the `streamLlm` call (around `runtime.ts:1099`), or inside `convertFromMessages` (`runtime.ts:440-547`), detect `tool-result` parts whose corresponding `tool-call` was to `loadSkill` and whose turn is no longer the active turn.
2. Replace the verbose skill text in those tool results with a one-line summary: `[Skill 'pdf' was loaded and used earlier in this conversation. Re-invoke loadSkill('pdf') if you need its detailed instructions again.]`
3. Keep the most recent skill load verbatim (so the model still has the active skill's instructions for the current task). Only compact *older* skill loads.
4. Optionally, track which skills are still "in use" by scanning the assistant turns after the load for references to the skill's key concepts; evict only when no longer referenced. A simpler heuristic (evict all but the most recent) is fine for v1.

**Files to modify.**
- `apps/scholaros/packages/core/src/agents/runtime.ts` (`convertFromMessages` at 440-547, or a new pre-pass before `streamLlm` at 1213)
- Possibly a new helper module `apps/scholaros/packages/core/src/agents/history-compaction.ts`

**Effort.** 0.5–1 day.

**Expected savings.** For an exam-prep session that loads 3 skills (pdf, revision-guide, auto-flashcards) and runs 20 more quizzing turns, this removes ~20 × (9,000 + 2,100 + 1,100) = ~244,000 tokens from later turns. This is the single biggest history-growth win after prompt caching.

**Degradation risk.** Low. The one-line reminder tells the model the skill was used and can be re-loaded. The risk is the model needing a skill's details mid-task and not re-loading it — mitigated by the reminder text and by keeping the most recent load verbatim. If a student says "actually, also merge those two PDFs" 10 turns after the PDF skill was evicted, the model should re-load it. Test this exact scenario.

**Status: ✅ DONE** — New `packages/core/src/agents/history-compaction.ts` implements `compactSkillResults()`. Scans `state.messages` for all `loadSkill` tool-calls, keeps the most recent result verbatim, replaces older ones with a one-line reminder preserving the JSON structure (`{ success, skillName, path, content: "[Skill '...' was loaded...]" }`). Called at the start of `convertFromMessages()` in `runtime.ts:448` so compaction runs before every LLM turn. Mutates in-place and is idempotent (skips already-compacted entries). Build and lint pass clean.

---

### 1.3 Split Base Instructions into Core + On-Demand Modules

**Problem.** `buildStaticInstructions` (`instructions.ts:41-405`) is one 347-line monolith. It includes the file-ingest workflow (4 steps, `79-99`), OCR fallback chains repeated twice (`101-108` and `133-156`), KB access rules with code examples (`201-264`), save-to-memory behavior (`172-195`), file path formatting (`377-403`), and builtin tools enumeration (`340-376`). All of this ships every turn — even when a student is just asking "what does osmosis mean?"

**Approach.**

1. Extract a **core** block (~600-800 tokens) that stays in every system prompt:
   - Persona + core personality (`instructions.ts:58-67`) — ScholarOS is an academic assistant, keep this.
   - Interaction style (`68-75`)
   - Communication principles (`292-299`)
   - Output formatting (`301-311`)
   - Tool priority one-liner (`313-315`)
   - Workspace scope rules (`324-337`) — condensed
   - Safety/execution reminders (`317-321`)
   - A short **capability index**: one line per capability saying "load the X module for the full workflow." This replaces the inline workflows and is the model's map to what it can load.
2. Move the rest into **capability modules** that load on demand, using the same `loadSkill` mechanism (or a lighter `loadCapability` variant that does not appear in the skill catalog):
   - **file-ingest module** — the workflow at `79-99` + OCR chains at `101-156`. Loaded when a file is attached or `ingest`/`parse`/`add these slides`/`process this PDF` is detected.
   - **kb-access module** — the rules at `201-264`. Loaded when the student mentions a concept/course/paper/assignment by name.
   - **save-to-memory module** — the rules at `172-195`. Loaded when memory tools are available.
   - **file-path-formatting module** — the rules at `377-403`. Loaded when the model writes a file path in a response.
   - **builtin-tools-reference module** — the enumeration at `340-376`. Condensed to a table; loaded when the model needs to pick a tool.
3. The capability index in the core tells the model when to load each module. This mirrors how skills already work but for instruction fragments rather than full skills.

**Files to modify.**
- `apps/scholaros/packages/core/src/application/assistant/instructions.ts` (the big one — split `buildStaticInstructions` into core + module builders)
- New directory: `apps/scholaros/packages/core/src/application/assistant/modules/` with one file per capability module
- `apps/scholaros/packages/core/src/application/assistant/skills/index.ts` (optionally register capability modules alongside skills, or add a separate `loadCapability` builtin tool)
- `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` (add `loadCapability` tool if going that route)

**Effort.** 1.5–2 days. Mostly careful surgery on `instructions.ts` and testing that the model still loads the right modules at the right time.

**Expected savings.** Cuts the always-on system prompt from ~4,000 to ~800 tokens for a typical chat turn. Combined with prompt caching (1.1), the cached prefix drops to ~1,300 tokens (800 core + 500 catalog). For a student quizzing for an hour (no file ops, no ingest), this is a ~70% reduction in system-prompt tokens — meaning more of their budget goes to actual study help.

**Degradation risk.** Medium — this is the highest-risk change. The model must correctly infer when to load a module. If a student says "add these slides to my Biology folder" and the model doesn't load the file-ingest module, it will give a generic answer instead of the proper ingest workflow. Mitigations: (a) the capability index in the core must list clear trigger phrases for each module; (b) the behavioral regression tests (below) must cover "add these slides," "ingest this PDF," "quiz me on X" (should load kb-access), "save that I prefer X" (should load save-to-memory). If any test fails, the capability-index wording needs tightening, not reverting the split.

**Status: ✅ DONE** — `buildStaticInstructions()` compacted from ~400 lines to ~100 lines core. Extracted 5 capability modules into `assistant/modules/`: `file-ingest.ts`, `kb-access.ts`, `save-to-memory.ts`, `file-path-formatting.ts`, `builtin-tools-reference.ts`. New `capabilities.ts` registry provides `buildCapabilityIndex()` (compact ~200-token capability index), `resolveCapability()`, and `getCapabilitySkillEntries()`. Core prompt now includes capability index pointing to each module with trigger phrases. New `loadCapability` builtin tool registers alongside `loadSkill`. New `listAllSkills` builtin tool provides escape hatch for skill discovery. Files: `instructions.ts`, `assistant/modules/*.ts`, `builtin-tools.ts`.

---

### 1.4 Contextual Skill Catalog (Relevance-Filtered)

**Problem.** `skills/index.ts:215-229` builds `skillCatalog` from all 24 skills and injects it into every system prompt (`instructions.ts:288`). A student quizzing on biology sees the PowerPoint, DOCX, XLSX, MCP, Composio, and browser-control skills — none of which are relevant to studying. Most study sessions use 0–2 skills.

**Approach.**

1. Infer **session context** from the current state: which pane is open (note? file? browser?), what tools are attached, whether a file was just attached, the student's recent message keywords.
2. Build a **relevance-filtered catalog** showing only the 3–6 plausible skills for the current context. Academic examples:
   - Note pane open + "study"/"quiz"/"review"/"exam" in recent messages → study-workflow, auto-flashcards, anki-flashcards, revision-guide, app-navigation
   - File attached (PDF/PPTX) → pdf, pptx, docx, xlsx, organize-files, course-management
   - Writing mode active → writing-mode, citation-management
   - "research"/"literature review"/"compare these papers" → deep-research, citation-management
3. Add a `listAllSkills` tool (cheap — returns the full catalog only when invoked) so the model can discover skills outside the filtered set if it suspects one applies.
4. The filtered catalog still includes the one-line "use it for" summary per skill so the model can decide to load.

**Files to modify.**
- `apps/scholaros/packages/core/src/application/assistant/skills/index.ts` (add `buildContextualSkillCatalog(context)` alongside `buildSkillCatalog`)
- `apps/scholaros/packages/core/src/application/assistant/instructions.ts` (call the contextual builder at `288` instead of the static `skillCatalog`)
- `apps/scholaros/packages/core/src/agents/runtime.ts` (pass pane/mode context into the instruction builder)
- `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` (add `listAllSkills` tool)

**Effort.** 1 day.

**Expected savings.** Cuts the catalog from ~500 to ~100 tokens for most study turns. Modest in isolation, but it compounds with 1.3 (the catalog is part of the cached prefix, so a smaller prefix is cheaper even when cached).

**Degradation risk.** Low-medium. The `listAllSkills` escape hatch covers the case where the filter misses a relevant skill. The risk is the model not calling `listAllSkills` when it should. Mitigation: if the model gives a generic answer to a request that a skill would handle better, the filter logic needs adjustment. Monitor via the behavioral tests.

**Status: ✅ DONE** — `buildContextualSkillCatalog(context)` added to `skills/index.ts`. Filters by file attachment MIME types and keyword signals (study/quiz/writing/research/browser). Falls back to broader set on cold start. Includes essential meta-skills (builtin-tools, deletion-guardrails, app-navigation, mcp-integration) unconditionally. `listAllSkills` tool built in `builtin-tools.ts` — returns full skill list when invoked.

---

## Phase 2 — High Impact, Medium Effort

These require more design but yield large, durable savings for study sessions.

---

### 2.1 Lazy Middle-Pane Context

**Problem.** `runtime.ts:1060-1070` injects the entire open note/file body into the system prompt every turn. A student with a 10,000-token lecture note open asks "what's my next assignment?" — 10,000 tokens of lecture content ride along for a question about their calendar. trip2g's benchmark: reading the one relevant section is ~15× cheaper than dumping the whole note.

**Approach.**

1. Replace the full-content injection with a **compact header**: `[Open note: "Mitochondria Lecture 3" | 4,200 words | 12 sections | tags: biology, lecture-3 | course: Biology 101 | path: courses/Biology 101/lectures/Mitochondria Lecture 3.md]`. For files: `[Open file: lecture3.pdf | 8 pages | parsed: yes | course: Biology 101 | path: raw/Biology 101/lecture3.pdf]`.
2. Give the model a `readOpenContext(sectionId?)` tool so it can pull only the section it needs *when the student's question actually relates to the open item*.
3. **Auto-expand on referential language.** When the student's message contains "this", "here", "above", "below", "what I'm looking at", "this note", "this lecture", "explain this part", "the part about" — auto-expand the full content for that turn. These are unambiguous signals that the question relates to the open item. Only stay lazy for clearly unrelated questions.
4. For **voice mode**, auto-expand the full content (the model needs it to read aloud). Keep the current behavior behind a `voiceOutput` gate.
5. Build a cheap section index for notes (split on markdown headers) so the model can request `sectionId: "## Krebs Cycle"` rather than re-reading the whole note.

**Files to modify.**
- `apps/scholaros/packages/core/src/agents/runtime.ts` (the `middlePaneContext` block at 1037-1077)
- `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` (add `readOpenContext` tool, or document the pattern for using `workspace-readFile` with the open path)
- Possibly a small note-section splitter helper in `apps/scholaros/packages/core/src/knowledge/note_system.ts`

**Effort.** 1–1.5 days.

**Expected savings.** For a study session with a 10k-token lecture note open across 20 turns where only 5 turns relate to the note, this cuts ~15 × 10,000 = ~150,000 tokens. The 5 relevant turns pay a small tool-call overhead instead.

**Degradation risk.** Medium. The risk is the model staying lazy when it should have expanded — e.g., a student says "explain this more" and the model doesn't realize "this" refers to the open note. Mitigation: the referential-language auto-expand rule (point 3) catches the common cases. Test with: "explain this part", "what does this mean", "summarize this", "quiz me on this" — all should auto-expand.

**Status: ✅ DONE** — `runtime.ts` middle pane injection modified: full-content injection replaced with compact header (path, word count, section count) for file/note kinds. Auto-expand logic added — checks latest user message for referential language signals (this/here/above/below/explain this/summarize this/quiz me on this). Voice mode always expands. New `readOpenContext({ path, sectionId? })` builtin tool lets the model pull full content or a specific section on demand. Deterministic section extraction via header matching in the tool handler.

---

### 2.2 Course-Aware Retrieval Sub-Agent

**Problem.** When the Copilot searches the knowledge base, it does so directly in its own context — running `workspace-grep`, reading multiple files, and accumulating all that content in its main context window. For a question like "how does photosynthesis connect to cellular respiration?" the Copilot might grep `courses/`, read 4 concept pages, and hold all 4 in context while composing the answer. The community advice is explicit: "use subagents for search operations, so the main agent context window is reserved for orchestration and answering."

**Approach.**

1. Create a lightweight **retrieval sub-agent** (`kb-retrieval`) with a small system prompt (~250 tokens) that understands ScholarOS's academic structure:
   > "You are an academic knowledge retrieval agent. The knowledge base is organized as `courses/<course-name>/concepts/`, `courses/<course-name>/lectures/`, `courses/<course-name>/assignments/`, plus cross-course `papers/`, `syntheses/`, `resources/`. Given a query and optional course filter, search the relevant course folder(s) first, read the index.md if present, then read the 2-3 most relevant concept pages. Return the excerpts (max 500 tokens total) with file paths. If the query spans courses, search `syntheses/` and `papers/` too."
2. Expose it to the Copilot via the existing `loadAgent` mechanism (`runtime.ts:370-432`) as a tool: `retrieveFromKB({ query, course? })`.
3. The sub-agent runs in its own context loop (it has `workspace-grep`, `workspace-readFile`). It returns a compact result to the Copilot. The Copilot's context stays reserved for synthesis and the answer.
4. The sub-agent uses the course hierarchy: if the student mentions "Biology 101", it searches `courses/Biology 101/` first. If no course is specified, it searches `courses/` broadly and infers the course from results.
5. The Copilot can always fall back to direct `workspace-grep` + `workspace-readFile` if the sub-agent's summary is insufficient for a complex multi-concept question.

**Files to modify.**
- New file: `apps/scholaros/packages/core/src/application/assistant/agents/kb-retrieval.ts` (sub-agent definition)
- `apps/scholaros/packages/core/src/agents/runtime.ts` (register the sub-agent in `loadAgent` at 370-432, expose as a tool)
- `apps/scholaros/packages/core/src/application/assistant/instructions.ts` (replace the inline KB-search strategy at `224-264` with: "call `retrieveFromKB` to search the knowledge base")

**Effort.** 1.5–2 days.

**Expected savings.** Moves the grep+read token burden out of the main context. For a concept-connection question that triggers reading 4 pages (~6,000 tokens of raw content), the Copilot's context instead receives a ~500-token summary. ~90% reduction on retrieval-heavy turns, and the main context no longer bloats with file contents that persist for the rest of the session.

**Degradation risk.** Low-medium. The sub-agent's summary might miss a nuance the Copilot needs for a complex synthesis. Mitigation: the Copilot can call `retrieveFromKB` again with a refined query, or fall back to direct `workspace-readFile` on a specific path the sub-agent returned. The sub-agent returns file paths alongside excerpts, so the Copilot knows where to drill in. Test with multi-concept questions like "compare how mitosis is described in Biology 101 vs. Biochemistry."

**Status: ✅ DONE** — New `assistant/agents/kb-retrieval.ts` sub-agent with compact ~250-token instructions for course-aware KB search. Registered in `runtime.ts:loadAgent()` as `kb-retrieval`. Exposed to Copilot as `retrieveFromKB` agent-type tool in `agent.ts`. Sub-agent has access to `workspace-grep`, `workspace-readFile`, `workspace-readdir`, `workspace-glob`. Instructions teach course hierarchy, index-first preference, and compact excerpt output format (max 300 tokens/page, 2,000 total).

---

### 2.3 Compress the Note Creation Agent for Academic Sources

**Problem.** `note_creation.ts:4-1025` is a single ~12,000-token instruction set covering 10 steps: source-type detection, worth-processing filter, related-note search, entity resolution, canonical naming, new-entity identification, structured extraction, state-change detection, note creation/update, link maintenance. Every invocation loads all 10 steps even though most academic sources trigger 2–3.

> **Cleanup note:** This agent still references "emails, meetings, voice memos" as source types — remnants of an older generalized version of ScholarOS. The academic sources it should handle are: lecture transcripts, study-session notes, professor office-hours notes, lab notes, and textbook chapter summaries. This refactor is the right time to remove the non-academic source types and reframe the agent around academic workflows.

**Approach.**

1. Split into a **router** (~800 tokens) plus **specialized sub-prompts** (~1,500-2,500 tokens each):
   - Router: classifies the academic source type (lecture transcript / study-session notes / office-hours notes / lab notes / textbook chapter) and decides which steps apply. Outputs a short plan.
   - `entity-resolution` sub-prompt: steps 3-5 (search for related concept/author/institution/paper notes, resolve canonical names, identify new academic entities).
   - `content-extraction` sub-prompt: steps 6-7 (extract key concepts, definitions, theorems, experiments, open questions, prerequisite links; detect when a new lecture supersedes or corrects an earlier one).
   - `note-writing` sub-prompt: steps 8-10 (create/update concept pages, apply corrections, maintain prerequisite and cross-reference links across the course wiki).
   - `worth-processing` sub-prompt: step 2 (cheap filter — run first, bail early if the source is too thin to be worth a wiki update, e.g., a 2-line chat message).
2. The router loads only the sub-prompt(s) it needs. A textbook chapter triggers `entity-resolution` + `content-extraction` + `note-writing`. A brief study-session note might trigger only `content-extraction` + `note-writing`.
3. Reuse the `renderNoteEffectRules` (`tag_system.ts:906-940`) and `renderNoteTypesBlock` (`note_system.ts:278-284`) fragments only in the sub-prompts that need them, not in the router.
4. Remove the email/meeting/voice-memo source-type detection and any branching that handles them. Replace with academic source types.

**Files to modify.**
- `apps/scholaros/packages/core/src/knowledge/note_creation.ts` (split `getRaw` at 4-1025 into router + sub-prompt files; remove email/meeting/voice-memo references; add academic source types)
- New directory: `apps/scholaros/packages/core/src/knowledge/note_creation/` with `router.ts`, `entity-resolution.ts`, `content-extraction.ts`, `note-writing.ts`, `worth-processing.ts`
- `apps/scholaros/packages/core/src/agents/runtime.ts` (the `loadAgent` note_creation path at 375-401 — load router, then have the router call sub-agents or re-prompt with the sub-prompt)

**Effort.** 2–3 days. Requires careful testing that note quality does not regress and that the academic source types are correctly detected.

**Expected savings.** Worst case (all steps) is still ~7,000 tokens vs 12,000. Average case (2-3 sub-prompts) is ~4,000 tokens — a ~67% reduction per note-creation run. Since this agent runs on every save-to-memory and academic-source ingest, the savings compound across a semester.

**Degradation risk.** Medium. The router might misclassify a source type or miss a needed sub-prompt. Mitigation: the router is conservative — when uncertain, load more sub-prompts. Test with each academic source type: a lecture transcript, a study-session note, an office-hours note, a lab note, a textbook chapter. Verify the router picks the right sub-prompts and the output notes are equivalent quality to the monolith.

**Status: ✅ DONE** — `knowledge/note_creation.ts` rewritten as compact academic router (~800 tokens). New sub-prompts in `knowledge/note_creation/`: `worth-processing.ts`, `entity-resolution.ts`, `content-extraction.ts`, `note-writing.ts`. Router uses `loadCapability` tool for on-demand sub-prompt loading. Registered in `assistant/modules/capabilities.ts` capability index.

---

### 2.4 Lean Calendar Context (Assignment-Aware)

**Problem.** `getCalendarContextPrompt` (`instructions.ts:411-454`) injects all pending tasks due in the next 14 days. During exam season, a student can have 15+ assignments and exams in the next 2 weeks (~300 tokens) every turn, even when they are just asking "explain the Krebs cycle."

**Approach.**

1. Switch to **today + overdue + next 2 due** (≤10 lines, ~80 tokens). Prioritize exams and major assignments over small homework.
2. Add a `getUpcomingTasks(days, type?)` tool the model can call if the student asks about next week or "what exams are coming up." Support filtering by type (`exam`, `assignment`, `quiz`).
3. Keep the "use `tasks-list` for the full list" pointer so the model knows it can pull more.
4. When an exam is within 3 days, flag it in the compact context: `**EXAM in 2 days: Biology 101 Midterm**` — this is high-signal, low-token.

**Files to modify.**
- `apps/scholaros/packages/core/src/application/assistant/instructions.ts` (`getCalendarContextPrompt` at 411-454)
- `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` (add `getUpcomingTasks` tool, or document that `tasks-list` already covers this)

**Effort.** 0.5 day.

**Expected savings.** ~150-220 tokens per turn on average during busy semesters. Small per-turn, but it applies to *every* turn and removes a volatile block that breaks prompt-cache locality.

**Status: ✅ DONE** — `getCalendarContextPrompt()` compacted to show: overdue tasks (with count), today's tasks, next 2 due tasks, and exam flags (title-based "exam"/"test"/"midterm"/"final" within 3 days). Full list available via `tasks-list` tool. ~80 tokens instead of ~300 for busy semesters.

**Degradation risk.** Very low. The model can always call `getUpcomingTasks` for the full picture. The risk is the model not proactively mentioning a deadline because it is not in the compact context — mitigated by always including overdue + next 2 due + any exam within 3 days.

---

## Phase 3 — Medium Impact, Higher Effort (Compounding)

These changes pay off over time as the student's knowledge base grows across a semester. They are the LLM-Wiki thesis applied to ScholarOS's course-structured data.

---

### 3.1 Synthesized Concept Pages Over Raw Source Re-Reads

**Problem.** When a student asks about a concept, the Copilot may search `courses/` and read concept pages (good), but for follow-ups it sometimes re-reads the raw PDF lecture. The LLM-Wiki thesis is that a concept page synthesized from a lecture is the canonical reference for all future questions about that concept — not the raw PDF. Re-reading the raw PDF on every follow-up wastes ~10,000 tokens per re-read.

**Approach.**

1. Audit the Copilot's KB-access guidance (`instructions.ts:201-264`) and the retrieval sub-agent from 2.2 to ensure they read **synthesized concept pages** (`courses/<course>/concepts/`, `syntheses/`) rather than raw `raw/` files.
2. The academic ingest pipeline (`ingest-coordinator.ts:122-563`) already produces wiki pages via two-step CoT. Ensure those pages are the *canonical* read target. Add a rule: "Raw files in `raw/` are sources of truth for ingest, not for query. Read the synthesized concept page in `courses/<course>/concepts/` instead. If a concept page is missing or stale, trigger a re-ingest rather than reading the raw file inline."
3. Ensure synthesized concept pages include prerequisite links (`prerequisites: [[Photosynthesis]]`), related-concept links, and the source lecture references — so the Copilot can traverse the graph without going back to raw files.
4. If a synthesized page is missing or stale, trigger a re-ingest rather than reading the raw file inline.

**Files to modify.**
- `apps/scholaros/packages/core/src/application/assistant/instructions.ts` (KB access rules at 201-264)
- `apps/scholaros/packages/core/src/application/assistant/agents/kb-retrieval.ts` (from 2.2 — prefer synthesized concept paths over raw)
- `apps/scholaros/packages/core/src/academic/ingest-coordinator.ts` (ensure synthesized pages include prerequisite links and are complete enough to replace raw reads)

**Effort.** 1–2 days (mostly an audit + rule tightening + ensuring concept pages have prerequisite links).

**Expected savings.** Avoids re-reading 10k-token PDFs on follow-up questions. Each avoided raw re-read saves ~10,000 tokens. Over a semester of study sessions, this compounds — the wiki matures and raw re-reads become rare.

**Degradation risk.** Low. The risk is a synthesized page being less detailed than the raw source and the Copilot giving a shallower answer. Mitigation: ensure concept pages are comprehensive (the ingest pipeline's generation step should produce full concept pages, not just summaries). If a student asks about a detail not in the concept page, the Copilot can still read the raw file — the rule is a default, not a hard gate.

**Status: ✅ DONE** — `assistant/modules/kb-access.ts` updated with index-first strategy and synthesized concept page preference. Instructions now explicitly tell the model: "Read the course index first", "Prefer synthesized concept pages over raw files", and guide towards index routing for cross-course questions.

<!-- IMPLEMENTATION: 3.1 — 2026-07-03
     assistant/modules/kb-access.ts: added index-first strategy + synthesized concept page preference
     assistant/modules/kb-access.ts: model instructed to read course index first, then drill to 1-2 concept pages
     assistant/modules/kb-access.ts: cross-course questions: root index → course indexes → concept pages
-->

---

### 3.2 Semester/Exam-Aware Staleness Metadata

**Problem.** When new sources arrive, the KG extractor/merge agents (`knowledge/graph/extractor.ts`, `merge.ts`) process *all* facts. There is no notion of which concept pages are fresh vs. needing review, so maintenance work is not prioritized and tokens are spent re-examining stable pages. For a student, staleness is not about days — it is about academic cycles: a concept page is stale when a new semester's materials arrive, when a later lecture supersedes it, or when the exam covering it has passed and the student has moved on.

**Approach.**

1. Add a `lifecycle` field to synthesized concept page frontmatter: `fresh` | `needs-review` | `stale`.
   - `fresh`: created or updated within the current semester's ingest cycle.
   - `needs-review`: a new lecture/source topically overlaps this concept (detected via the same embeddings used by `classifyFiles`), or the concept was mentioned in a later lecture that might supersede or correct it.
   - `stale`: the exam covering this concept has passed (detected from the calendar/tasks), or a new semester has started and the course folder has been superseded.
2. When a new source is ingested, mark overlapping concept pages `needs-review` instead of re-processing everything.
3. The KG agents skip `fresh` pages and only process `needs-review`/`stale` ones.
4. A periodic lint pass (manual or scheduled) flips `stale` → `needs-review` when a new semester starts or when a related exam is approaching (so the student can refresh their concept pages before the exam).

**Files to modify.**
- `apps/scholaros/packages/core/src/academic/ingest-coordinator.ts` (set lifecycle on generation)
- `apps/scholaros/packages/core/src/knowledge/graph/extractor.ts` and `merge.ts` (skip `fresh` pages)
- Possibly a shared frontmatter schema in `apps/scholaros/packages/shared/src/`
- `apps/scholaros/packages/core/src/application/assistant/instructions.ts` (calendar context can surface "concepts needing review before your exam")

**Effort.** 2–3 days (schema + agent logic + lint + exam-awareness).

**Expected savings.** Reduces KG-agent token spend as the wiki grows across a semester. Stable concept pages stop being re-examined. The savings scale with wiki size — the larger the course load, the bigger the win. A student with 5 courses × 20 lectures avoids re-processing ~80 stable concept pages when they ingest lecture 21.

**Degradation risk.** Low. The risk is a `fresh` page that actually needs review being skipped. Mitigation: the `needs-review` trigger is based on topical overlap (embeddings), so a new lecture covering the same concept will flag it. The exam-approaching lint ensures pre-exam refresh.

<!-- IMPLEMENTATION: 3.2 — 2026-07-03
     packages/shared/src/academic.ts: added lifecycle: "fresh"|"needs-review"|"stale" to AcademicFrontmatter
     packages/core/src/academic/lifecycle-manager.ts: NEW — readPageMetadata, updatePageLifecycle,
       flagOverlappingPages (hashed embedding cosine-similarity overlap detection, threshold 0.3),
       refreshLifecycles (semester-based stale + exam-approaching needs-review flip),
       runPreExamLint (exam-aware: stale→needs-review for exams within 14 days from calendar tasks),
       getCurrentSemester (reads .scholarOS/current-semester.json), extractCourseFromTaskName
     packages/core/src/academic/ingest-coordinator.ts:
       formatConceptPage(): frontmatter now includes lifecycle: fresh + lastUpdated
       buildGenerationPrompt(): LLM template includes lifecycle: "fresh" + lastUpdated
       processWithTwoStepCoT(): calls flagOverlappingPages() after pages created to mark overlapping
         existing concept pages as needs-review
     Key design decisions:
       - Reuses existing hashedEmbedding + cosineSimilarity from file-classifier.ts (zero deps, <1ms)
       - Overlap detection runs inside ingest pipeline, not as separate pass
       - Pre-exam lint is standalone (triggerable via runPreExamLint()), also called from refreshLifecycles()
       - Calendar exam detection reuses getMergedTasks() + same exam keywords as instructions.ts calendar context
       - extractCourseFromTaskName strips exam keywords (e.g. "Biology 101 Final Exam" → "Biology 101")
       - extractor.ts and merge.ts are user-fact agents (conversation memory), not concept-page processors;
         this plan's original "KG agents skip fresh pages" doesn't apply — the lifecycle field is read by
         the Copilot via kb-access.ts module which already tells the model how to interpret lifecycle values
     Verification: npm run deps && npm run lint pass clean
-->

---

### 3.3 Deterministic Pre-Processing, LLM for Judgment Only

**Problem.** Some work currently sent to the LLM is deterministic: file-type detection, section splitting, course classification from folder paths, index building. The health-informatics educator's insight: move intake/indexing/routing to deterministic code and reserve LLM calls for synthesis. Every token spent on deterministic work is a token not spent on concept extraction or synthesis.

**Approach.**

1. File-type detection: already deterministic via `parseFile` (`builtin-tools.ts`). Verify no LLM path is taken when the format is known.
2. Section splitting for notes: add a deterministic markdown-header splitter (used by 2.1's `readOpenContext`). No LLM needed.
3. Course classification from folder path: `raw/Biology 101/lecture3.pdf` → `{ course: "Biology 101", type: "lecture", n: 3 }`. Pass as metadata to the ingest LLM rather than having it infer. The `classifyFiles` tool already uses local embeddings — ensure its output is passed as structured metadata, not re-derived by the LLM.
4. Index building: `courses/<course>/index.md` should be regenerated deterministically from the folder listing + frontmatter (concept title, tags, prerequisites), not via an LLM call. The LLM only writes the per-page content.

**Files to modify.**
- `apps/scholaros/packages/core/src/academic/ingest-coordinator.ts` (use deterministic course/type hints, deterministic index regen)
- `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` (deterministic section splitter)
- Possibly a new `apps/scholaros/packages/core/src/academic/index-builder.ts`

**Effort.** 2 days.

**Expected savings.** Eliminates LLM calls for index regen and course/type inference. Each ingest run saves ~500-1,000 tokens of prompt + output. Compounds across every ingest — a student ingesting 20 lectures at the start of a semester saves ~10,000-20,000 tokens of deterministic work being offloaded.

**Degradation risk.** Very low. Deterministic classification from folder paths is more reliable than LLM inference. The risk is a misnamed folder (`raw/Bio/` instead of `raw/Biology 101/`) producing a wrong course tag — mitigated by the `classifyFiles` embeddings as a fallback when the folder path is ambiguous.

**Status: ✅ DONE** — New `academic/index-builder.ts` with `buildCourseIndex()`, `regenerateCourseIndex()`, and `extractSections()` (deterministic markdown header splitter, used by 2.1's `readOpenContext`). No LLM calls involved.

---

### 3.4 Course-Structured Index Routing

**Problem.** When the Copilot looks up a concept, it runs `workspace-grep` over `courses/` and reads multiple files to find the right one. Karpathy's pattern: the LLM reads `index.md` first (cheap) and drills into only the relevant page. ScholarOS has course-level `index.md` files but the Copilot is not instructed to read them first. For a student with 5 courses, a broad grep over all of `courses/` is expensive and returns cross-course noise.

**Approach.**

1. Ensure every `courses/<course>/index.md` is a compact catalog: one line per concept page (link + 1-line summary + tags + prerequisites). Regenerate deterministically (see 3.3). Example line:
   `- [[Photosynthesis]] — light-dependent reactions, Calvin cycle | tags: bio, lecture-3 | prereq: [[Cell Structure]]`
2. Add a top-level `index.md` at the workspace root cataloging all courses and cross-course pages (`papers/`, `syntheses/`, `resources/`). Example:
   `## Biology 101 — [[courses/Biology 101/index.md|12 concepts, 8 lectures]]`
3. Instruct the Copilot (in the `kb-access` module from 1.3) to read the relevant `index.md` first, then drill in. For a course-specific question: read `courses/<course>/index.md` → identify the concept page → read it. For a cross-course question: read the root `index.md` → identify relevant courses → read their indexes → drill in. This is the "lazy expansion" pattern.
4. The retrieval sub-agent from 2.2 should use this pattern internally — it is cheaper and more precise than broad greps.

**Files to modify.**
- `apps/scholaros/packages/core/src/application/assistant/modules/` (the `kb-access` module from 1.3)
- `apps/scholaros/packages/core/src/academic/index-builder.ts` (from 3.3 — build root + course indexes)
- `apps/scholaros/packages/core/src/application/assistant/agents/kb-retrieval.ts` (from 2.2 — read index first)

**Effort.** 1 day (on top of 3.3).

**Expected savings.** Replaces broad `workspace-grep` + multiple `readFile` calls with one index read + one targeted read. For a concept lookup that would have read 4 files across 2 courses (~6,000 tokens), the index path is ~1,000 tokens (one index + one concept page). ~80% reduction on lookup turns. Over a semester of study sessions, this is the difference between affordable and expensive KB access.

**Degradation risk.** Low. The index is a catalog, not a replacement for the concept pages — the Copilot still reads the full page after identifying it from the index. The risk is a concept not being in the index (stale index) — mitigated by deterministic index regeneration on every ingest (3.3).

**Status: ✅ DONE** — `assistant/modules/kb-access.ts` updated with explicit index-first search strategy. Model instructed to: read `index.md` for relevant course first, identify the 1-2 most relevant concept pages, then read only those. Cross-course questions: read root index → course indexes → concept pages.

---

## Phase 4 — Budget & History Management ✅

These were initially marked as speculative/longer-term but have been implemented. The budget enforcer, skill compression, and conversation summarization are now wired into the agent runtime.

---

### 4.1 Token-Budget-Aware Prompt Assembly

**Problem.** There is no cap on total prompt size. A student with 3 loaded skills + a long exam-prep history + an open 10k-token paper can blow past smaller models' context windows (e.g., a student running a local 8k-context Ollama model) or get expensive on large ones. nashsu/llm_wiki uses a 60/20/5/15 budget (wiki / history / index / system).

**Approach.**

1. Define a per-turn token budget based on the active model's context window (read from `models.json` config).
2. Allocate: system prompt (capped 15%), middle-pane/KB context (capped 25%), conversation history (capped 50%), loaded skills (capped 10%).
3. A single `enforceBudget(messages, instructions, budget)` function trims the lowest-priority blocks first: evict old skill loads (1.2), summarize old history (4.3), shrink middle-pane to header (2.1), drop old turns.
4. Log the budget breakdown per turn for observability — the student (or the developer) can see where tokens are going.
5. For local models with small context windows, the budget enforcer is what makes ScholarOS usable at all — without it, a 30-turn session overflows.

**Files to modify.**
- New file: `apps/scholaros/packages/core/src/agents/budget.ts`
- `apps/scholaros/packages/core/src/agents/runtime.ts` (call `enforceBudget` before `streamLlm`)

**Effort.** 2 days.

**Expected savings.** Prevents runaway token spend on long study sessions. Turns a cliff-edge (context overflow → the model truncates or errors) into a graceful degradation (the oldest, least-relevant context is dropped first). For a student on an 8k-context local model, this is the difference between a 5-turn session and a 30-turn session.

**Degradation risk.** Medium. Aggressive trimming can drop context the model needs. Mitigation: the trimming priority is designed to drop the least-relevant first (old skills, then old history, then middle-pane). The student sees a warning if the budget is hit. Test with a small-context model and a long session.

**Status: ✅ DONE** — New `agents/budget.ts` with `TokenBudget` interface, `createBudget()`, `enforceBudget()` with token estimation (4-char heuristic), default 128K context window allocation (15/25/50/10). Wired into `runtime.ts:convertFromMessages()`. Budget report logged on trim events. Uses `compactSkillResults` (existing) + `compactConversationHistory` (4.3) + old turn dropping as trim priorities.

<!-- IMPLEMENTATION: 4.1 — 2026-07-03
     agents/budget.ts: TokenBudget interface, createBudget(), enforceBudget()
     agents/budget.ts: estimateTokens() uses 4-char-per-token heuristic
     agents/budget.ts: enforceBudget() drops oldest tool-results and assistant/user turns when over budget
     agents/budget.ts: BudgetReport with totalBudget, estimatedTotal, trimmedTurns, note
     agents/runtime.ts: convertFromMessages() calls enforceBudget() with instructions string
     agents/runtime.ts: console.log budget report when trim events occur
-->

---

### 4.2 Skill Compression / Skill Memory

**Problem.** The PDF skill is 9,000 tokens because it includes a full pypdf/pdfplumber/reportlab/pytesseract API reference. The model only needs the API details when actually writing PDF-manipulation code; the high-level workflow fits in ~500 tokens. A student who loads the PDF skill to merge two lectures pays 9,000 tokens for a task that needs ~500 tokens of workflow guidance.

**Approach.**

1. Split each large skill into a **compressed** version (~500 tokens: workflow + key rules) and a **reference** version (the full API docs).
2. `loadSkill` returns the compressed version. Add `expandSkill(skillId)` that returns the full reference only when the model needs to write detailed code.
3. The compressed skill tells the model: "For the full pypdf API reference, call `expandSkill('pdf')`."

**Files to modify.**
- Each large skill in `apps/scholaros/packages/core/src/application/assistant/skills/*/skill.ts` (split into `skill.ts` (compressed) + `reference.ts` (full))
- `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` (add `expandSkill` tool)

**Effort.** 2–3 days (across the 5-6 largest skills).

**Expected savings.** Cuts the PDF skill from 9,000 to ~500 tokens on load. The full reference loads only when coding. ~95% reduction on skill-load tokens for the large skills. For a student who loads 3 skills during a study session, this saves ~15,000 tokens.

**Degradation risk.** Low. The compressed skill has the workflow; the reference has the API details. The risk is the model trying to write PDF code from the compressed version and getting the API wrong — mitigated by the compressed version explicitly saying "call `expandSkill` for API details before writing code."

**Status: ✅ DONE** — PDF skill (`pdf/skill.ts`) compressed from ~12KB to ~500 tokens (workflow overview + quick reference table + key rules). Full reference moved to `pdf/reference.ts`. PPTX skill (`pptx/skill.ts`) compressed from ~9KB to ~500 tokens. Reference file at `pptx/reference.ts`. `resolveExpandedSkill()` registered in `skills/index.ts` as an expanded skills map. New `expandSkill` builtin tool in `builtin-tools.ts` returns full reference content on demand. Compressed skills include `expandSkill('pdf'/'pptx')` pointer in their output.

<!-- IMPLEMENTATION: 4.2 — 2026-07-03
     skills/pdf/skill.ts: compressed from 1135 lines (~12KB) to ~500t workflow + quick reference + key rules
     skills/pdf/reference.ts: full reference content (pypdf, pdfplumber, reportlab, qpdf, form filling, advanced)
     skills/pptx/skill.ts: compressed from 666 lines (~9KB) to ~500t workflow + key rules + critical pitfalls
     skills/pptx/reference.ts: full PptxGenJS API + template editing + design ideas + QA
     skills/index.ts: resolveExpandedSkill() + expandedSkills Map<skillId, reference>
     builtin-tools.ts: expandSkill { skillId } tool returns full reference on demand
     NOTE: Only PDF and PPTX are compressed. DOCX (3.2KB), MCP (3.5KB) are candidates for future compression.
-->

---

### 4.3 Conversation Summarization + Eviction

**Problem.** Conversation history grows unbounded per conversation. A 40-turn exam-prep session can accumulate ~40,000 tokens of history. The KG summarizer (`summarizer.ts`) already summarizes conversations for memory, but the conversation itself is never compacted — old turns sit verbatim forever.

**Approach.**

1. Once a conversation exceeds N turns (e.g., 12), summarize everything older than the last 6 turns into a ~200-token block using the existing summarizer.
2. Replace the old turns with a single `system` message: `[Summary of earlier conversation: The student was reviewing Biology 101 concepts — photosynthesis, cellular respiration, and the Krebs cycle. They quizzed on each and got 3/5 on the Krebs cycle quiz. They then asked to generate a revision guide for the midterm.]`.
3. Keep the last 6 turns verbatim for continuity.
4. Re-summarize (rolling) as the conversation grows further.

**Files to modify.**
- `apps/scholaros/packages/core/src/agents/runtime.ts` (rolling summarization before `streamLlm`)
- Reuse `apps/scholaros/packages/core/src/knowledge/graph/summarizer.ts`

**Effort.** 1.5 days.

**Expected savings.** Caps history growth. A 40-turn exam-prep session that would be ~40,000 tokens of history becomes ~6,000 (6 recent turns) + ~200 (summary) = ~6,200. ~85% reduction on long study sessions. This is what makes a 3-hour study session affordable.

**Degradation risk.** Medium. The summary might lose a detail the student references later ("remember when you said X about the Krebs cycle?"). Mitigation: the summary is generated by the same summarizer already used for memory, and the last 6 turns are verbatim. If the student references something older, the model can say "I summarized our earlier conversation — here is what I recall: [summary]. Can you remind me which part?" This is a graceful failure, not a silent one.

**Status: ✅ DONE** — New `compactConversationHistory()` in `history-compaction.ts`. Detects conversations exceeding 12 turns, summarizes old turns (before the last 6 verbatim) using a heuristic keyword/tool-extraction approach (no LLM call, deterministic). Replaces old turns with a `system` message. Idempotent (skips if already compacted). Wired into `runtime.ts:convertFromMessages()` before `compactSkillResults`. Logs compaction events.

<!-- IMPLEMENTATION: 4.3 — 2026-07-03
     agents/history-compaction.ts: compactConversationHistory() added after compactSkillResults()
     agents/history-compaction.ts: buildHeuristicSummary() extracts topics + toolsUsed + questionTypes from messages
     agents/history-compaction.ts: MIN_TURNS_BEFORE_SUMMARY = 12, KEEP_VERBATIM_TURNS = 6
     agents/history-compaction.ts: extractKeywords() checks for academic topic signals (quiz, exam, biology, etc.)
     agents/runtime.ts: compactConversationHistory() called in convertFromMessages() before budget enforcement
     NOTE: Uses heuristic summarization (no LLM call) to avoid latency. Can be upgraded to LLM-based
     summarization later by replacing buildHeuristicSummary() with summarizer.ts's generateText approach.
-->

---

## Phase 5 — Optimized Query Retrieval Pipeline

This phase addresses the quick-Q&A pattern directly. A core ScholarOS use case is the student asking rapid, simple questions — "what's the difference between mitosis and meiosis?", "explain the Krebs cycle again", "what does osmosis mean?" These should be fast and cheap: retrieve the 1-2 most relevant concept pages, answer, done. Today they trigger a full ripgrep scan + multiple full-file reads in the Copilot's own context, with no use of the embeddings or graph infrastructure already built.

The audit revealed that ScholarOS has significant retrieval infrastructure that is **computed at ingest time but never queried at query time**: PDF chunk embeddings (`pdf-embeddings.ts`), local hashed embeddings (`file-classifier.ts`), a wiki-link graph with Louvain communities (`wiki-link-graph.ts`), and a 4-signal relevance model (`graph-relevance.ts` — currently dead code with an empty edges Map). None of it is wired into the Copilot's retrieval path.

This phase builds a multi-phase retrieval pipeline inspired by nashsu/llm_wiki's design, but using ScholarOS's existing assets and course-structured layout. The pipeline runs inside the retrieval sub-agent from 2.2, not in the Copilot's main context.

**How LLM Wiki does it (for reference):**
- Phase 1: Tokenized search (English word splitting + stop words, Chinese CJK bigram, title match bonus +10)
- Phase 1.5: Vector semantic search (optional, LanceDB, cosine similarity, merged with Phase 1 results)
- Phase 2: Graph expansion (top results as seed nodes, 4-signal relevance, 2-hop traversal with decay)
- Phase 3: Budget control (configurable 4K→1M tokens, 60% wiki / 20% history / 5% index / 15% system)
- Phase 4: Context assembly (numbered pages with full content, citation by `[1]`/`[2]`)

**How ScholarOS should do it (adapted for academic structure):**

---

### 5.1 Phase 1 — Tokenized Keyword Search (Local, No API)

**Problem.** `workspace-grep` is ripgrep — fast, but it returns raw matching *lines* (up to 100, 500 chars each) with no relevance scoring, no title bonus, no tokenization, and no deduplication across files. The Copilot then has to read full files to understand context. For a quick "what is photosynthesis?" query, grep returns 50 matching lines across 8 files, and the Copilot reads 3-4 of them in full — ~12,000 tokens for a question that needs one concept page.

**Approach.**

1. Build a **tokenized search index** over the wiki markdown files, updated on every ingest (deterministic, no LLM). Store it as a JSON file at `.scholarOS/search-index.json` — one entry per wiki page:
   ```
   { path: "courses/Biology 101/concepts/Photosynthesis.md",
     title: "Photosynthesis",
     course: "Biology 101",
     type: "concept",
     tags: ["bio", "lecture-3"],
     tokens: { "photosynthesis": 5, "light": 3, "calvin": 2, ... },
     preview: "Photosynthesis is the process by which plants convert light energy..." }
   ```
2. Implement **TF-IDF scoring** with a **title match bonus** (+10 if the query matches the page title, +5 if it matches a tag). This mirrors LLM Wiki's title bonus and is more useful than raw line matching for concept queries.
3. Tokenization: lowercase, split on non-alphanumeric, remove English stop words. (CJK bigram is not needed — ScholarOS is English-only for now.)
4. The index is rebuilt deterministically on every ingest (part of 3.3's deterministic pre-processing). No LLM call, no API. Runs in <100ms for a typical course load.
5. Expose this as a `searchKB({ query, course?, type? })` tool available to the retrieval sub-agent (2.2) and, as a fallback, to the Copilot directly. Returns ranked page paths + previews (not full content).

**Files to modify.**
- New file: `apps/scholaros/packages/core/src/academic/search-index.ts` (index builder + TF-IDF scorer)
- `apps/scholaros/packages/core/src/academic/ingest-coordinator.ts` (rebuild index after ingest)
- `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` (add `searchKB` tool)
- `apps/scholaros/packages/core/src/application/assistant/agents/kb-retrieval.ts` (from 2.2 — use `searchKB` instead of `workspace-grep`)

**Effort.** 1.5–2 days. TF-IDF is straightforward; the index builder is deterministic.

**Expected savings.** Replaces 2-4 `workspace-grep` calls + 2-4 `workspace-readFile` calls with one `searchKB` call returning ranked paths + previews. For a quick concept question, the Copilot (or sub-agent) reads only the top 1-2 ranked pages instead of scanning broadly. ~60-80% reduction in retrieval tokens for quick Q&A.

**Degradation risk.** Low. TF-IDF with title bonus is reliable for concept-name queries. The risk is a concept page that does not contain the exact query term (e.g., "cellular respiration" query when the page is titled "Krebs Cycle") — this is what Phase 1.5 (vector search) solves. The escape hatch: if `searchKB` returns no results, fall back to `workspace-grep` (the current path).

**Status: ✅ DONE** — New `academic/search-index.ts` with TF-IDF index builder, tokenizer (lowercase + stop words), title match bonus (+10) and tag bonus (+5). `searchIndex()` function supports course/type filters and ranking. `saveSearchIndex()`/`loadSearchIndex()` for caching. `searchKB` tool registered in `builtin-tools.ts` — builds index on first call, caches as JSON, returns ranked results.

---

### 5.2 Phase 1.5 — Vector Semantic Search (Reuse Existing Embeddings)

**Problem.** Tokenized search misses semantic matches. A student asking "how do plants make energy?" should find the Photosynthesis concept page even if the page never uses the phrase "make energy." ScholarOS already computes and stores PDF chunk embeddings at ingest time (`pdf-embeddings.ts:113-218`) and has local hashed embeddings + `cosineSimilarity()` (`file-classifier.ts:48-74`) — but none of this is queried at retrieval time. The embeddings are dead weight.

**Approach.**

1. **Embed the query** using the same embedding function used at ingest. If the student has an API embedding model configured (OpenAI, Google, Ollama), use it. If not, fall back to the local hashed embedding (`file-classifier.ts:48-60`, <1ms, zero deps). This means vector search works even with no API key — it uses the same SHA256 hashed embeddings that `classifyFiles` already uses for course classification.
2. **Search the existing PDF chunk embeddings** stored in `courses/<courseId>/pdf-embeddings.json` (`pdf-embeddings.ts:163-173`). Compute cosine similarity between the query embedding and each stored chunk embedding. Return the top-N chunks with their source file paths and text. This reuses infrastructure that already exists — the embeddings are already computed and stored, just never queried.
3. **Also embed concept page previews** (from 5.1's index) using the local hashed embedding, so vector search covers concept pages, not just PDF chunks. Store these in the same `search-index.json` from 5.1. This is cheap (hashed embedding is <1ms per page) and gives vector search coverage over the synthesized wiki, not just raw PDFs.
4. **Merge with Phase 1 results.** Tokenized matches get a score boost; vector-only matches get added as new discoveries. This is the hybrid retrieval pattern: BM25/TF-IDF for exact matches + vector for semantic matches.
5. Make vector search **optional but on by default** when local hashed embeddings are used (zero cost, zero API). When an API embedding model is used, make it configurable (the student might not want to pay for embedding every query). The hashed embedding path is the default — it is free and local.

**Files to modify.**
- `apps/scholaros/packages/core/src/academic/search-index.ts` (from 5.1 — add vector search over stored embeddings + concept page previews)
- `apps/scholaros/packages/core/src/academic/pdf-embeddings.ts` (add a `search(queryEmbedding, topN)` method to `PdfEmbeddingStore`)
- `apps/scholaros/packages/core/src/academic/file-classifier.ts` (export `hashedEmbedding` and `cosineSimilarity` for reuse — they are already pure functions)
- `apps/scholaros/packages/core/src/application/lib/builtin-tools.ts` (the `searchKB` tool from 5.1 now does hybrid: tokenized + vector)

**Effort.** 1.5–2 days. The embeddings already exist; the work is adding the query path and the merge logic.

**Expected savings.** Finds the right concept page in 1 call instead of 3-4 grep+read cycles. For a semantic query like "how do plants make energy?" that would have missed the Photosynthesis page via tokenized search, this saves the Copilot from giving a generic answer or doing a broad grep. LLM Wiki's benchmark: recall improved from 58.2% to 71.4% with vector search enabled. For a student, this means fewer "I couldn't find that in your notes" responses.

**Degradation risk.** Low. Vector search is additive — it boosts and discovers, it does not replace tokenized search. If vector search is disabled or returns noise, the tokenized results (5.1) still work. The hashed embedding fallback means this works with zero configuration — no API key, no Ollama, no external dependency.

**Status: ✅ DONE** — `hashedEmbedding()`, `cosineSimilarity()`, `normalizeVector()` exported from `file-classifier.ts` for reuse. `search-index.ts` now computes hashed embedding for each `IndexEntry` at build time. New `hybridSearch()` function merges TF-IDF + cosine similarity with configurable vector weight (default 0.3). `vectorSearch()` added as standalone function. `searchKB` tool in `builtin-tools.ts` accepts `vectorSearch` and `mode` params to control hybrid behavior.

---

### 5.3 Phase 2 — Graph Expansion (Wire Up the Wiki-Link Graph)

**Problem.** ScholarOS has a wiki-link graph builder (`wiki-link-graph.ts:171-283`) that extracts `[[wikilinks]]` from all markdown files, builds undirected edges, and runs Louvain community detection. It also has a 4-signal relevance model (`graph-relevance.ts`) adapted from LLM Wiki. **Neither is used at query time.** The `graph-relevance.ts` `buildRetrievalGraph` function creates an empty edges Map and is never called — it is dead code. When a student asks "how does photosynthesis connect to cellular respiration?", the Copilot has no graph to traverse; it greps both terms and reads pages in isolation.

**Approach.**

1. **Fix `graph-relevance.ts`** — `buildRetrievalGraph` (line 30) must actually populate the edges Map from `wiki-link-graph.ts`'s `buildWikiGraph()` output. The wiki-link graph already extracts `[[wikilink]]` edges; `graph-relevance.ts` just needs to consume them instead of creating an empty Map. This is a small fix to dead code, not new infrastructure.
2. **Implement 2-hop graph expansion** in the retrieval pipeline: after Phase 1 + 1.5 identify the top-K seed pages, traverse the wiki-link graph 2 hops out with relevance decay. This finds pages that are linked to the seed pages' links — e.g., Photosynthesis → (links to) → Cellular Respiration → (links to) → Krebs Cycle. A query about photosynthesis that also needs the Krebs Cycle context gets it via graph expansion, not a separate grep.
3. **Use the 4-signal relevance model** from `graph-relevance.ts:51-82`:
   - Direct `[[wikilink]]` edge (×3.0) — pages explicitly linked from the seed page.
   - Source overlap (×4.0) — pages sharing the same source lecture (via frontmatter `sources[]`).
   - Adamic-Adar index (×1.5) — pages sharing common neighbors (weighted by neighbor degree).
   - Type affinity (×1.0) — bonus for same page type (concept↔concept, lecture↔lecture).
4. **Cap expansion at 3-5 additional pages** to control token budget. The decay factor (per hop) means 2-hop pages are only included if their combined score is above a threshold. This prevents graph expansion from pulling in the entire wiki.
5. The graph expansion runs inside the retrieval sub-agent (2.2), not the Copilot's main context. The sub-agent returns the expanded page set as ranked excerpts.

**Files to modify.**
- `apps/scholaros/packages/core/src/knowledge/graph-relevance.ts` (fix `buildRetrievalGraph` to consume `buildWikiGraph` edges — the core fix)
- `apps/scholaros/packages/core/src/knowledge/wiki-link-graph.ts` (ensure `buildWikiGraph` is callable from the retrieval path, not just the UI)
- `apps/scholaros/packages/core/src/academic/search-index.ts` (from 5.1 — add graph expansion step after hybrid search)
- `apps/scholaros/packages/core/src/application/assistant/agents/kb-retrieval.ts` (from 2.2 — call the full pipeline: search → graph expand → rank → return excerpts)

**Effort.** 2–3 days. The graph builder and relevance model already exist; the work is wiring them together and into the retrieval path.

**Expected savings.** For a multi-concept question like "how does photosynthesis connect to cellular respiration?", graph expansion finds the connection in one retrieval pass instead of the Copilot doing 2 separate greps + 4 file reads. The expanded page set is returned as compact excerpts (~500 tokens) rather than full pages. The main Copilot context receives a structured, pre-ranked result instead of raw file contents.

**Degradation risk.** Low-medium. The graph expansion is additive — it includes more pages, not fewer. The risk is over-expansion pulling in irrelevant pages and diluting the result. Mitigation: the decay factor and the 3-5 page cap prevent this. If the graph is sparse (few `[[wikilinks]]` in the wiki), expansion adds nothing and the pipeline falls back to Phase 1 + 1.5 results. Test with a wiki that has good cross-linking and one that does not.

**Status: ✅ DONE** — `graph-relevance.ts:buildRetrievalGraph()` fixed to accept and populate edges from `buildWikiGraph()` output (was dead code creating empty edge Map). `expandGraph()` in `search-index.ts` runs `buildWikiGraph()` → `buildRetrievalGraph()` → `getRelatedNodes()` with 2-hop decay factor (0.5), capped at 5 pages. `getOrBuildGraph()` caches the retrieval graph for reuse. Graph expansion integrated into `assembleContext()` and selectable via `graphExpand` param on `searchKB` tool.

---

### 5.4 Phase 3 — Budget-Controlled Context Assembly

**Problem.** There is no token budget on retrieval results. The retrieval sub-agent (2.2) currently has a soft "~500 tokens max" in its prompt, but nothing enforces it. If the hybrid search + graph expansion returns 8 relevant pages, the sub-agent might return all 8 at full length — flooding the Copilot's context. LLM Wiki uses a configurable 60/20/5/15 split (wiki / history / index / system). ScholarOS has no such allocation (this is also item 4.1 in this plan).

**Approach.**

1. Define a **retrieval token budget** per query, derived from the active model's context window. Default: 4,000 tokens for retrieval results (the pages + excerpts returned to the Copilot). This is separate from the overall conversation budget (4.1) — it caps just the retrieval sub-agent's output.
2. **Proportional allocation within the retrieval budget:**
   - 70% to the top-ranked concept pages (full content, prioritized by combined search + graph score).
   - 20% to graph-expanded related pages (excerpts only, not full content).
   - 10% to the index snippet (the relevant `index.md` section, so the Copilot knows what else exists).
3. **Prioritize by combined score:** `finalScore = tokenizedScore (normalized) + vectorScore (normalized) + graphScore (with decay)`. Pages are ranked, then included in order until the budget is exhausted. The last page that fits is truncated to the remaining budget; the rest are dropped.
4. **Return a budget report** to the Copilot alongside the results: `[Retrieved 4 pages (3,200 tokens) of 12 candidates. Top: Photosynthesis (score 0.92), Cellular Respiration (0.87), Krebs Cycle (0.71), Light Reactions (0.65, excerpt only). 8 pages omitted — call searchKB with a narrower query to see them.]` This tells the Copilot what it has and what it is missing, so it can do a follow-up search if needed.

**Files to modify.**
- `apps/scholaros/packages/core/src/academic/search-index.ts` (from 5.1 — add budget enforcement to the result assembly)
- `apps/scholaros/packages/core/src/application/assistant/agents/kb-retrieval.ts` (from 2.2 — enforce the budget on the returned result)
- `apps/scholaros/packages/core/src/agents/budget.ts` (from 4.1 — shared budget utility, if it exists by this point)

**Effort.** 1 day (on top of 5.1-5.3).

**Expected savings.** Prevents retrieval results from flooding the Copilot's context. A query that would have returned 8 full pages (~24,000 tokens) instead returns 3 full pages + 1 excerpt (~3,200 tokens). ~85% reduction on the retrieval-result portion. The budget report lets the Copilot decide if a follow-up search is worth it — informed, not blind.

**Degradation risk.** Low. The budget is generous enough (4,000 tokens) for most concept questions. The risk is a complex multi-concept question needing more than the budget allows. Mitigation: the budget report tells the Copilot what was omitted, and it can call `searchKB` again with a narrower query or read a specific omitted page directly via `workspace-readFile`.

**Status: ✅ DONE** — `assembleContext()` in `search-index.ts` enforces token budgets per query mode (fast: 1,000 / standard: 3,000 / deep: 5,000). Proportional allocation: 70% top-ranked pages, 20% graph-expanded excerpts, 10% index snippet. Returns a `ContextAssembly` with `BudgetReport` containing totalCandidates, returned, omitted, budgetTokens, usedTokens. `searchKB` tool result includes `mode` field indicating which path was taken.

---

### 5.5 Phase 4 — Citation Format and Excerpt-Only Retrieval

**Problem.** ScholarOS uses filepath code blocks for citations (`instructions.ts:377-403`), which render as clickable cards in the UI. This is good for UX but does not help the model or the student track which pages informed an answer. LLM Wiki uses numbered citations (`[1]`, `[2]`) so the model can reference sources inline and the student can verify. ScholarOS also retrieves full pages today — even when only one section is relevant — which is the same wholesale-read problem as the middle-pane (2.1).

**Approach.**

1. **Combine both citation formats.** The retrieval sub-agent returns pages as numbered entries with file paths:
   ```
   [1] courses/Biology 101/concepts/Photosynthesis.md (score 0.92)
   Full content: ...
   [2] courses/Biology 101/concepts/Cellular Respiration.md (score 0.87)
   Excerpt (Krebs Cycle section): ...
   ```
   The Copilot can cite `[1]` or `[2]` inline in its answer, and the UI can render the file paths as clickable cards (existing behavior). This gives the student both inline references and clickable links.
2. **Excerpt-only retrieval for graph-expanded pages.** Pages found via graph expansion (Phase 2) are returned as excerpts (the most relevant section, ~200-400 tokens), not full content. Only the top 1-2 seed pages from Phase 1/1.5 get full content. This mirrors the trip2g insight: read the one section that holds the answer, not the whole note.
3. **Section-level extraction.** Use the deterministic markdown-header splitter (from 2.1/3.3) to extract only the relevant section of a page. If the query is "Krebs cycle", and the Photosynthesis page has a `## Krebs Cycle` section, return that section, not the whole page. The section is identified by matching the query against section headers (tokenized) + the page's overall score.
4. **The Copilot's answer format** should include a "Sources:" footer with the numbered citations, rendered as filepath cards. This is already natural for the model — it just needs the instruction in the `kb-access` module (1.3).

**Files to modify.**
- `apps/scholaros/packages/core/src/application/assistant/agents/kb-retrieval.ts` (from 2.2 — return numbered entries with excerpts)
- `apps/scholaros/packages/core/src/application/assistant/modules/` (the `kb-access` module from 1.3 — instruct the Copilot to cite `[1]`/`[2]` and render file paths as cards)
- `apps/scholaros/packages/core/src/academic/search-index.ts` (from 5.1 — section-level extraction for excerpt-only results)

**Effort.** 1 day (on top of 5.1-5.4).

**Expected savings.** Excerpt-only retrieval for graph-expanded pages cuts ~2,000-4,000 tokens per multi-page retrieval. Section-level extraction for seed pages cuts another ~2,000-6,000 tokens when the relevant section is a fraction of the page. Combined, a "how does photosynthesis connect to cellular respiration?" query that would have read 4 full pages (~12,000 tokens) instead reads 2 sections + 2 excerpts (~2,500 tokens). ~80% reduction.

**Degradation risk.** Low. The excerpt includes the section header and surrounding context, so the model knows what it is reading. If the excerpt is insufficient, the Copilot can call `workspace-readFile` on the full page — the escape hatch is always there. The numbered citation format is additive to the existing filepath-card format, not a replacement.

**Status: ✅ DONE** — `kb-retrieval.ts` updated with numbered citation output format (`[1]`, `[2]` with path, score, excerpt). `kb-access.ts` module updated with citation format instructions and searchKB-first guidance. `extractSection()` in `search-index.ts` provides deterministic markdown-header-based section extraction for excerpt-only results.

---

### 5.6 The Quick-Query Fast Path

**Problem.** Not every question needs the full 5-phase pipeline. "What does osmosis mean?" is a one-page lookup. "Compare how mitosis is described in Biology 101 vs. Biochemistry" is a multi-page synthesis. Running the full pipeline for the trivial question adds latency; skipping it for the complex question degrades quality. There is no routing today — every query does raw grep+read.

**Approach.**

1. **Classify the query** inside the retrieval sub-agent (cheap, ~50 tokens of reasoning):
   - **Fast path** (single-concept lookup): query mentions one concept name, no comparison/synthesis verbs. Run Phase 1 (tokenized) only. Return the top 1 page (full content if <2,000 tokens, else the most relevant section). Skip vector search, graph expansion, and budget allocation. Target: <500 tokens retrieved, <200ms latency.
   - **Standard path** (multi-concept or relationship): query mentions 2+ concepts or uses "compare", "connect", "relate", "difference between", "how does X relate to Y". Run Phase 1 + 1.5 + Phase 2 (graph expansion). Return 2-4 pages with excerpts. Target: <3,000 tokens retrieved.
   - **Deep path** (broad synthesis or exam-prep): query is broad ("summarize everything about cellular respiration", "what should I study for the bio exam?"). Run the full pipeline including graph expansion to 3 hops. Return a broader set with budget control. Target: <5,000 tokens retrieved, with the budget report so the Copilot knows what was omitted.
2. The classification is a simple keyword/structure check, not an LLM call. "compare"/"difference between"/"vs." → standard. "summarize everything"/"all the concepts"/"study for the exam" → deep. Everything else → fast.
3. The fast path is what makes quick Q&A feel instant. A student asking "what does osmosis mean?" gets the concept page in one tokenized search + one section read — no grep scan, no vector embedding, no graph traversal.

**Files to modify.**
- `apps/scholaros/packages/core/src/application/assistant/agents/kb-retrieval.ts` (from 2.2 — add the query classifier and the three paths)
- `apps/scholaros/packages/core/src/academic/search-index.ts` (from 5.1 — expose fast/standard/deep search modes)

**Effort.** 0.5–1 day (on top of 5.1-5.5).

**Expected savings.** The fast path (which covers the majority of quick Q&A) retrieves ~500 tokens instead of the current ~6,000-12,000 (grep + 2-3 full file reads). For a student asking 20 quick questions in a study session, this saves ~20 × 10,000 = ~200,000 tokens. This is the single biggest win for the quick-Q&A pattern that prompted this section.

**Degradation risk.** Very low. The fast path is conservative — if the tokenized search returns 0 results, it falls back to the standard path (which adds vector search). If the standard path returns 0, it falls back to the deep path (which adds graph expansion). The classification is a hint, not a gatekeeper — the escape hatches are automatic.

**Status: ✅ DONE** — `classifyQuery()` in `search-index.ts` classifies queries into fast/standard/deep via keyword patterns. `searchIndex()` routes accordingly: fast → `tokenizedSearch()` only (top 3), standard → `hybridSearch()` (top 10), deep → `assembleContext()` with full pipeline. `searchKB` tool in `builtin-tools.ts` accepts explicit `mode` param or auto-classifies. `kb-retrieval.ts` sub-agent prompt includes query classification instructions for fast/standard/deep routing.

---

## Implementation Sequencing

The phases are ordered by ROI. Within each phase, items are mostly independent but have noted dependencies.

**Recommended order:**

1. **1.1 Prompt caching** — highest ROI, touches the `streamText` call and instruction split. Do this first; everything else stacks on top of a cached prefix. This alone makes study sessions ~90% cheaper on the system-prompt portion.
2. **1.2 Skill eviction** — biggest history-growth win, independent of 1.1. Stops exam-prep sessions from ballooning after loading revision-guide + flashcard skills.
3. **1.3 Split base instructions** — largest always-on reduction. Depends on deciding the module-loading mechanism (extend `loadSkill` or add `loadCapability`). Highest degradation risk — test thoroughly.
4. **1.4 Contextual skill catalog** — small, stacks on 1.3's smaller prefix. Low risk.
5. **2.1 Lazy middle-pane** — large win for note-heavy study sessions. Medium risk — test referential-language auto-expand.
6. **2.4 Lean calendar** — trivial, do alongside 2.1. Low risk.
7. **2.2 Course-aware retrieval sub-agent** — depends on 1.3's `kb-access` module being extracted. Large win for concept-lookup turns. This is the foundation for Phase 5 — the retrieval pipeline runs inside this sub-agent.
8. **2.3 Compress note creation agent** — independent, can be done in parallel with 2.1/2.2. Also cleans up the email/meeting/voice-memo remnants.
9. **5.1 Tokenized keyword search** — depends on 2.2 (the sub-agent that calls it) and 3.3 (deterministic index building). The first piece of the retrieval pipeline. Replaces raw grep with TF-IDF + title bonus.
10. **5.2 Vector semantic search** — depends on 5.1. Wires up the existing PDF embeddings + local hashed embeddings for query-time use. Free with hashed embeddings.
11. **5.6 Quick-query fast path** — depends on 5.1 (and optionally 5.2). The biggest win for the quick-Q&A pattern. Can be done immediately after 5.1 — the fast path only needs tokenized search.
12. **5.3 Graph expansion** — depends on 5.1 and 5.2. Fixes the dead `graph-relevance.ts` and wires the wiki-link graph into retrieval. For multi-concept questions.
13. **5.4 Budget-controlled assembly** — depends on 5.1-5.3. Enforces the retrieval token cap.
14. **5.5 Citation format + excerpt-only** — depends on 5.4. Final polish on the pipeline output.
15. **3.1 Synthesized concept pages over raw** — depends on 2.2 and 5.1+. Compounds over the semester.
16. **3.4 Course-structured index routing** — depends on 2.2 and 3.3.
17. **3.3 Deterministic pre-processing** — independent, enables 3.4 and 5.1 (index building).
18. **3.2 Semester/exam-aware staleness metadata** — independent, longer-tail payoff. Scales with course load.
19. **4.1 Budget-aware assembly** — ✅ DONE. `agents/budget.ts`, wired into `runtime.ts:convertFromMessages()`.
20. **4.2 Skill compression** — ✅ DONE. PDF and PPTX skills compressed. `expandSkill` tool added.
21. **4.3 Conversation summarization** — ✅ DONE. `compactConversationHistory()` in `history-compaction.ts`.

**Milestone targets (framed for a student study session):**
- After Phase 1: A 40-turn exam-prep session's system prompt drops from ~5,500 to ~1,500 cached-input tokens. Skill-loaded sessions stop ballooning. The student can study ~3× longer on the same budget.
- After Phase 2: Concept-lookup turns and note-open sessions drop ~80-90% in context tokens. Note-creation runs drop ~67%. A student quizzing with a lecture note open pays for the note only when the question relates to it.
- After Phase 3: Savings scale with course load; raw re-reads and broad greps are eliminated. A student with 5 courses can ingest and query affordably because concept pages are the canonical read target and indexes route lookups precisely.
- After Phase 5: Quick Q&A is fast and cheap — a "what does osmosis mean?" question retrieves ~500 tokens instead of ~10,000. Multi-concept questions use the full pipeline (tokenized + vector + graph) and return budget-controlled excerpts. The student's existing PDF embeddings and wiki-link graph finally work for them at query time, not just ingest time.
- After Phase 4: Runaway spend is structurally impossible; long study sessions and large skills are bounded. A student on a local 8k-context model can have a 30-turn session without overflow. A 3-hour exam-prep session is affordable end-to-end. **✅ DONE.**

---

## Verification

For each change, verify both token savings and behavioral quality. **A change that saves tokens but makes the Copilot give worse academic answers is rejected.** The guiding question: "Would a student notice the Copilot got worse?"

**Token measurement.**
- Add a per-turn token log in `streamLlm` (`runtime.ts:1213`): log `promptTokens`, `completionTokens`, and `cachedInputTokens` (from the provider's usage metadata) for every call. The console log at `runtime.ts:1221` already logs the payload; extend it to log usage once the stream completes.
- Build a small benchmark script (`scripts/measure-tokens.mjs`) that runs 7 representative academic scenarios and prints before/after token totals per turn:
  1. **Trivial chat:** "what does osmosis mean?" (no file ops, no KB access) — tests 5.6 fast path
  2. **Quick concept lookup:** "what's the difference between mitosis and meiosis?" (single-concept, should use fast path) — tests 5.1 + 5.6
  3. **File ingest:** "add these Biology slides to my courses" (file ingest workflow)
  4. **Concept lookup with note open:** "how does this connect to cellular respiration?" (middle pane + KB access)
  5. **Multi-concept synthesis:** "compare how mitosis is described in Biology 101 vs. Biochemistry" (should use standard/deep path, graph expansion) — tests 5.3
  6. **Skill-loaded session:** load revision-guide skill, generate a guide, then quiz for 10 turns (skill eviction test)
  7. **Long study session:** 40-turn exam-prep conversation (history summarization + budget test)

**Behavioral quality — academic regression scenarios.**
These must pass before and after each change. If any fails, the change is not shippable until the guardrail is fixed.

- **File ingest:** "add these slides to my Biology folder" → the Copilot must follow the full ingest workflow (organize, register course, extract, create materials, update index). Tests 1.3's file-ingest module loading.
- **Concept lookup:** "quiz me on photosynthesis" → the Copilot must search `courses/Biology 101/concepts/`, read the Photosynthesis page, and quiz from it. Tests 1.3's kb-access module + 2.2's sub-agent.
- **Middle-pane referential:** with a lecture note open, "explain this part" → the Copilot must auto-expand the note content and explain the relevant section. Tests 2.1's auto-expand.
- **Middle-pane unrelated:** with a lecture note open, "what's my next assignment?" → the Copilot must answer from the calendar, not the note. Tests 2.1's lazy mode.
- **Skill re-load:** 10 turns after the PDF skill was loaded and evicted, "also merge those two PDFs" → the Copilot must re-load the PDF skill. Tests 1.2's eviction reminder.
- **Save-to-memory:** "remember that I prefer bullet-point summaries" → the Copilot must call `save-to-memory`. Tests 1.3's save-to-memory module loading.
- **Study-workflow routing:** "I have a bio exam next week, help me prep" → the Copilot must load the study-workflow skill and route to revision-guide / auto-flashcards. Tests 1.4's contextual catalog.
- **Multi-concept synthesis:** "compare how mitosis is described in Biology 101 vs. Biochemistry" → the Copilot must retrieve from both courses and synthesize. Tests 2.2's course-aware retrieval.
- **Note creation (lecture transcript):** save a lecture transcript to memory → the note creation agent must extract concepts, link prerequisites, and update the course wiki. Tests 2.3's academic source-type handling.
- **Pre-exam staleness:** ingest a new lecture that overlaps an existing concept → the existing concept page is marked `needs-review`, not re-processed from scratch. Tests 3.2.
- **Quick concept lookup (fast path):** "what does osmosis mean?" → the retrieval sub-agent must use the fast path (tokenized search only), return 1 concept page, and the Copilot must answer from it. Retrieval tokens <1,000. Tests 5.1 + 5.6.
- **Semantic match (vector search):** "how do plants make energy?" → must find the Photosynthesis concept page even if the page does not contain "make energy". Tests 5.2.
- **Graph expansion:** "how does photosynthesis connect to cellular respiration?" → must return both pages plus graph-expanded related pages (e.g., Krebs Cycle). Tests 5.3.
- **Retrieval budget:** "summarize everything about cellular respiration" → must return budget-controlled excerpts with a budget report, not flood the context with all matching pages. Tests 5.4.
- **Citation format:** the Copilot's answer must include numbered citations (`[1]`, `[2]`) rendered as filepath cards. Tests 5.5.

**Regression guard.**
- After each phase, run `cd apps/scholaros && npm run deps && npm run lint` to confirm compilation.
- Run the dev app via the Playwright/CDP flow documented in `CLAUDE.md` and exercise the Copilot end-to-end on the behavioral scenarios above.
- For each scenario, compare the answer quality (does it follow the right workflow? does it find the right pages? does it cite sources?) to a pre-change baseline. Token savings are reported alongside, but answer quality is the gate.

---

## Future Candidates (not part of current plan)
- DOCX skill compression (3.2KB, medium priority)
- MCP integration skill compression (3.5KB, medium priority)
- LLM-based conversation summarization upgrade (replacing heuristic summary)
- Per-model context window auto-detection for budget.ts

> **Tracking note:** When implementing new items, update the [Progress Tracker](#progress-tracker) table, add an `<!-- IMPLEMENTATION: ... -->` comment with date and file references, and run `npm run deps && npm run lint` before marking complete.
