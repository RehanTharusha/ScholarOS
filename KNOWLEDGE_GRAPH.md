# 🧠 Jarvis Knowledge Graph — How He Learns

A self-organising node graph that stores Jarvis's accumulated knowledge — anything learned during conversations that he wouldn't already know from training data. The diary records *what happened*; the knowledge graph records *what was learned*.

---

## Architecture Overview

```
User message
    │
    ▼
┌─────────────────────────────────────────────────┐
│               DialogueMemory                      │
│  (in-memory short-term buffer)                   │
└──────────────────────┬──────────────────────────┘
                       │ periodic flush
                       ▼
┌─────────────────────────────────────────────────┐
│           Diary Summariser (LLM)                 │
│  Condenses chunks → ≤200 word summary + topics   │
│  Hygiene: no deflection, attribute claims,       │
│           separate topics into own sentences     │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│      Graph Extractor (LLM)                       │
│  Parses summary → {(branch, fact)} tuples        │
│  Classifies: USER / DIRECTIVES / WORLD           │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│      Node Traversal (LLM per depth)              │
│  Branch-pinned descent from taxonomy root        │
│  Greedy LLM picks best child at each level       │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│         Merge (LLM, batched per node)            │
│  Rules: supersede, dedupe, consolidate, prune    │
│  Fail-open → plain append                        │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│      Auto-Split (LLM, if >1500 tokens)           │
│  Categories facts → 2-5 children                 │
│  Consolidates patterns, prunes common knowledge  │
│  Parent data cleared, description → summary      │
└──────────────────────────────────────────────────┘
```

---

## Data Model

### MemoryNode (SQLite — `memory_nodes` table)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID string | Unique identifier (`"root"` for root node) |
| `name` | string | Human-readable label |
| `description` | string | 1-2 sentences for traversal decisions |
| `data` | string | Line-separated facts (the actual memories) |
| `parent_id` | UUID or null | Back-reference (null for root) |
| `access_count` | int | Total accesses for ranking |
| `last_accessed` | ISO 8601 | For recency ordering |
| `created_at` | ISO 8601 | Creation timestamp |
| `updated_at` | ISO 8601 | Last modification |
| `data_token_count` | int | Cached estimate (len/4 heuristic) |

Edges are implicit via `parent_id`. The graph is a tree — each node has exactly one parent.

### Fact Normalisation (Dedupe Fast-Path)

Before any LLM call, facts are compared against existing node data using Unicode-aware folding:

1. `unicodedata.NFKC` — collapses visually identical code points
2. `str.casefold` — handles locale quirks (Turkish `İ`/`ı`, German `ß`/`ss`)
3. Whitespace collapse — all whitespace sequences compressed to single space

Exact matches skip the LLM merge entirely. Skips do **not** increment the node's access count.

---

## Fixed Top-Level Branches

On first bootstrap, three non-deletable branches are seeded under root:

| Branch ID | Name | Used in Warm Profile? | Purpose |
|-----------|------|-----------------------|---------|
| `user` | User | Yes | Identity, location, tastes, habits, history |
| `directives` | Directives | Yes | Reply style, tone rules, standing instructions |
| `world` | World | No (retrieved on demand) | External facts, discoveries, practical knowledge |

Unknown classifications default to `user`. The extractor prompt has no "Other" branch — a fact that belongs nowhere should not be stored.

### Legacy-Shape Migration (Destructive)

If the on-disk graph doesn't match the expected shape (root has non-fixed-branch children, or root has data), the entire `memory_nodes` table is wiped and re-seeded. The diary is untouched — users can re-populate via "Import from Diary" in the memory viewer. Runs only from the daemon start-up path.

---

## Three Entry Points for Retrieval

| Entry Point | Query | Purpose |
|-------------|-------|---------|
| Recent nodes | Last N accessed (excl. root) | Fast path for ongoing conversations |
| Top nodes | Highest decayed access score (excl. root) | Core knowledge domains |
| Root node | Single root | Full graph traversal for novel queries |

### Access Decay

All ordering uses hyperbolic decay computed at query time:

```
score = access_count / (1 + age_days / 14)
```

The raw `access_count` is never modified, so changing the half-life (default 14 days) retroactively reweights all nodes.

---

## Write Path: How Memories Are Created

### Step 1 — Dialogue Buffer

`DialogueMemory` in `src/jarvis/memory/conversation.py` stores every message as `(timestamp, role, content)` tuples. Tool-call/result pairs are stored separately (secrets scrubbed) for carryover.

### Step 2 — Diary Summarisation (LLM Call)

`update_diary_from_dialogue_memory()` atomically captures pending chunks and calls `generate_conversation_summary()`:

- **Input**: last 10 chunks + optional previous summary for the same day
- **Output**: ≤200 word summary + 3-5 comma-separated topic keywords
- **Hygiene rules** (from `summariser.spec.md`):
  1. **No deflection narration** — never record the assistant's failures, uncertainty, or offers to search
  2. **Attribution preservation** — claims about third parties must be attributed ("the assistant said X")
  3. **Topic separation** — unrelated topics never welded into one clause
- LLM failure is non-fatal → `(None, None)`, update skipped

The summary is stored in `conversation_summaries` table with:
- FTS5 full-text index (via SQLite triggers)
- Vector embedding for hybrid search (60% vector + 40% FTS)

### Step 3 — Graph Extraction (LLM Call)

`update_graph_from_dialogue()` in `src/jarvis/memory/graph_ops.py` orchestrates four sub-steps:

#### 3a. Extract

Sends the summary to the LLM with a detailed system prompt. Returns JSON array of `{"branch": "USER|DIRECTIVES|WORLD", "fact": "..."}` objects.

Banned forms (the extractor must never emit):
- Meta-narrative about the conversation
- Transient weather/time
- Assistant recommendations to the user
- Common knowledge the model already knows
- Offers to search or expressions of inability

Temperature=0 for deterministic classification.

#### 3b. Traverse (Branch-Pinned Descent)

Each fact is placed using **branch-pinned descent** from its tagged branch root:

1. Skip recent/top shortcuts (prevents cross-branch contamination)
2. Greedy descent: at each depth, `_llm_pick_best_child()` asks the picker model which child fits best
3. Stop when no child fits → attach to current node
4. Max depth: 8

The picker model defaults to `resolve_tool_router_model()` (small warm router) to keep costs down.

#### 3c. Merge (Batched per Node, LLM Call)

All facts destined for the same node are grouped into one LLM call. The LLM receives current node data + all new facts and applies six rules:

1. **Supersession** — contradictions drop the old line ("user does not need a daily check-in" replaces both a prior "needs" and the same need framed as an interest)
2. **Near-duplicate dedupe** — different wordings collapse to one canonical phrasing
3. **Consolidation** — repeated activities across dates fold into patterns ("ate sushi on Mon, ate sushi on Thu" → "regularly eats sushi")
4. **Meta-narrative pruning** — narration of the assistant's own behaviour, capabilities, or denials gets dropped
5. **Independence preservation** — uncontradicted facts coexist side by side
6. **Hallucination guard** — rejects rewrites longer than `existing_lines + new_facts + 2`

Returns `MergeResult(success, incorporated_indices)`. Fail-open on any error → plain append.

#### 3d. Auto-Split (LLM Call)

Triggered when `data_token_count > SPLIT_THRESHOLD` (1500 tokens):

1. LLM proposes 2-5 child categories
2. Each fact assigned to exactly one child
3. Consolidation: duplicates merged, repeated patterns collapsed
4. Pruning: facts the LLM already knows from training data are dropped
5. Child nodes created; parent data cleared; parent description updated to summary

Split quality safeguards:
- Minimum 2 categories required
- Each category must have at least one fact
- LLM error → node retains data, next write retries

**Cold start**: Each fact lands on its branch root until enough data accumulates for the first auto-split. The tree structure emerges organically.

---

## Read Path: How Memories Are Retrieved

### Source 1 — Warm Profile (Always-On, Query-Agnostic)

Injected on **every reply turn** unconditionally:

1. `build_warm_profile()` walks the User and Directives branches BFS, concatenating node data up to char caps (1200 user, 600 directives)
2. `format_warm_profile_block()` renders it with **denial-template mirroring** headings:
   - `INFORMATION THE USER HAS SHARED IN PRIOR CONVERSATIONS`
   - `STANDING INSTRUCTIONS FROM THE USER`
3. No LLM call — pure SQLite BFS
4. Cached per conversation in `DialogueMemory._hot_cache`
5. Invalidated on User/Directives graph mutations via the listener registered in `daemon.py`

This is the architectural pivot: personalisation is the **default**, not gated behind question-detection.

### Source 2 — Diary Enrichment (Query-Driven)

Runs only when the planner emitted a `searchMemory` directive (or planner failed empty):

1. `extract_search_params_for_memory()` extracts keywords and implicit questions using the small warm router model
2. `search_conversation_memory_by_keywords()` performs hybrid search (60% vector + 40% FTS) over `conversation_summaries`
3. Results injected as "Relevant conversation history"

### Source 3 — Graph Enrichment (Question-Driven)

Runs when the extractor produced implicit questions:

1. Questions are joined, stop-worded, and used to search graph nodes via `search_nodes()` with LIKE matching
2. Results annotated with ancestor paths and data previews (up to 5 nodes)
3. Injected as "Information the user has shared with you in prior conversations"
4. For small models: both diary and graph are replaced by a single compact **memory digest**

### Source 4 — Recall Gate (Deterministic Short-Circuit)

`should_recall()` in `src/jarvis/memory/recall_gate.py` is a pure-Python heuristic (no LLM):

Returns `False` (skip enrichment) **only** when BOTH:
1. Hot-window contains a fresh tool result
2. ≥50% of query content words overlap with hot-window words

Language-agnostic via `\w{3,}` with `re.UNICODE`. Small English stopword list; non-English queries skip stopword filtering (more conservative). Fail-open on any exception → returns `True` (recall).

---

## The Planner's Role

`plan_query()` in `src/jarvis/reply/planner.py` runs at the front of the reply flow:

1. **Gates memory enrichment** — emits `searchMemory topic='<topic>'` when the query needs prior user context
2. **Provides topic hint** — `memory_topic_of()` extracts the topic, threaded into the keyword extractor
3. **Empty plan** (`[]`) = fail open → run memory + router legacy defaults
4. **Single-step "Reply to the user"** = positive decision that no memory or tools are needed → skip everything

The planner does **not** see memory content — it only decides *whether* memory is needed based on the query and tool catalogue.

---

## Mutation Listeners & Cache Invalidation

`GraphMemoryStore` exposes an observer registry:

```python
register_graph_mutation_listener(cb)
unregister_graph_mutation_listener(cb)
```

Callbacks receive `(action, node_id, branch)`. Fired after every `create_node`, `update_node`, `delete_node`, and `append_to_node`. Touch is **not** a mutation event (metadata only).

In `daemon.py`, a listener:
- Filters to only `user` and `directives` branch mutations
- Calls `DialogueMemory.invalidate_warm_profile()` to drop the cached block
- Mid-conversation User/Directives changes are reflected on the very next turn

### Conversation-Scoped Hot Cache

`DialogueMemory._hot_cache` (LRU, 128 entries):
- Stores: warm profile block, router output, enrichment extractor output
- Wiped on new-conversation detection and `stop` signal
- Granular invalidation via `invalidate_warm_profile()`

---

## Bulk Operations (Memory Viewer)

### Import from Diary

One-time migration: processes all historical diary summaries through `update_graph_from_dialogue()`. Streams NDJSON progress for real-time UI feedback. Per-summary failures are non-fatal.

### Consolidate All

Walks every populated node and calls `merge_node_data` with an empty `new_facts` list — re-applies the latest supersession/dedupe/consolidation rules to data that landed before those rules existed. Streams NDJSON progress.

### Deflection Rewrite Sweep

`rewrite_all_diary_summaries()` walks every `conversation_summaries` row and asks the chat model to remove deflection narration. Uses untrusted-input fence markers (`<<<BEGIN UNTRUSTED WEB EXTRACT>>>`). Empty-rewrite guard preserves entirely-deflective rows. Privacy: streams only counts/booleans, never raw text.

### Tag Optimisation

`optimise_diary_topics()` collects all unique topic tags, makes one LLM call to propose a normalised taxonomy, and applies the mapping. Preserves `ts_utc` audit trail. Idempotent.

---

## LLM Calls Summary

| Step | Model | When | Failure Mode |
|------|-------|------|-------------|
| Diary summariser | Chat model | Periodic flush | Non-fatal, skip update |
| Graph extractor | Chat model | After diary write | Non-fatal, skip graph cycle |
| Node traversal picker | Router → chat model | Per fact per depth level | Fall through to parent node |
| Merge | Router → chat model | Batched per node | Fall back to plain append |
| Auto-split | Router → chat model | When node >1500 tokens | Retains node data, retries |
| Planner | Chat model | Every turn (except noise) | Empty plan `[]` = legacy fallback |
| Keyword extractor | Router model | When planner needs memory | Empty dict = no search |
| Memory digest | Router model | Small models only | Keep raw text |

---

## Key Design Principles

- **Fail-open everywhere** — LLM failures at any step never break the system
- **Denial-template mirroring** — warm profile headings occupy the semantic slot small models' canonical denials refer to
- **Privacy-first** — all data in local SQLite, no network dependencies
- **Language-agnostic** — `\w{3,}` with `re.UNICODE`, Unicode folding, no hardcoded patterns
- **Cost efficiency** — batched merge, cheap dedupe fast-path, auto-split prunes common knowledge
- **Tree depth = raw→refined spectrum** — surface nodes hold new knowledge, deeper nodes hold distilled novel knowledge that survived multiple split cycles

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `SPLIT_THRESHOLD` | 1500 | Tokens before auto-split |
| `MERGE_THRESHOLD` | 200 | Tokens below which children collapse |
| `RECENT_NODES_COUNT` | 10 | Recent nodes to surface |
| `TOP_NODES_COUNT` | 15 | Top nodes to surface |
| `DECAY_HALF_LIFE_DAYS` | 14 | Days until node access score halves |
| `MAX_TRAVERSAL_DEPTH` | 8 | Safety limit on graph traversal |
| `memory_enrichment_source` | `"all"` | `"all"`, `"diary"`, or `"graph"` |
| `memory_digest_enabled` | auto | Auto-on for SMALL models |
| `planner_enabled` | True | Feature gate for planner |

---

## File Map

| File | Purpose |
|------|---------|
| `src/jarvis/memory/graph.py` | Pure SQLite data store — schema, CRUD, search, mutation listeners |
| `src/jarvis/memory/graph.spec.md` | Full spec for the knowledge graph |
| `src/jarvis/memory/graph_ops.py` | LLM-dependent operations — extraction, traversal, merge, split, warm profile |
| `src/jarvis/memory/conversation.py` | Diary summariser, dialogue buffer, deflection rewrite, tag optimisation |
| `src/jarvis/memory/db.py` | Shared SQLite database with FTS5 and vector search |
| `src/jarvis/memory/embeddings.py` | Ollama embedding calls (always local) |
| `src/jarvis/memory/recall_gate.py` | Deterministic pre-enrichment short-circuit heuristic |
| `src/jarvis/memory/recall_gate.spec.md` | Recall gate spec |
| `src/jarvis/memory/summariser.spec.md` | Diary summariser spec with hygiene rules |
| `src/jarvis/reply/engine.py` | Main orchestrator — warm profile, enrichment, planner integration |
| `src/jarvis/reply/planner.py` | Task-list planner that gates memory enrichment |
| `src/jarvis/reply/planner.spec.md` | Planner spec |
| `src/jarvis/reply/enrichment.py` | Keyword extraction and memory digest |
| `src/jarvis/system_prompt.py` | Unified system prompt with denial-template mirroring |
| `src/jarvis/daemon.py` | Wires mutation listener, runs legacy-shape migration |
| `src/desktop_app/memory_viewer.py` | Web UI with graph API endpoints |
| `docs/llm_contexts.md` | Every LLM call mapped: model, gating, inputs, outputs, limits, flow |

---

## Future Work (Housekeeping)

Planned periodic maintenance:
- Promote buried-but-hot nodes (high access, depth > 3)
- Compress cold branches (no access in > Y days)
- Merge sparse subtrees (auto-merge when children < 200 tokens total)
- Validate parent summaries against child contents
