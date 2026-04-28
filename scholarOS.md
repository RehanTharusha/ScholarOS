# ScholarOS

> **Your academic life, compiled — not just retrieved.**
> A living knowledge base that grows with you through every lecture, paper, and deadline.

ScholarOS is an Obsidian-compatible personal knowledge system for students, powered by an LLM that actively maintains a vault of plain Markdown notes so you never have to. Drop in a lecture PDF, a research paper, or a set of class notes — the AI reads it, integrates it into your existing knowledge, cross-references it with everything you've already learned, and keeps the whole system consistent. By the end of a semester, you don't have a folder of scattered files. You have a structured, interlinked wiki of everything you know.

---

## The Core Idea: LLM Wiki, Not RAG

Most AI study tools work like search engines: you ask a question, they dig through your files for relevant chunks, and generate an answer. Then you ask another question, and they dig again. Nothing accumulates. Every query starts from scratch.

ScholarOS works differently. Instead of retrieving from raw documents at query time, an LLM _incrementally builds and maintains_ a persistent wiki that sits between you and your source material. When you add a new paper or lecture recording, the AI doesn't just index it — it reads it, extracts the key ideas, and integrates them into the existing wiki: updating concept pages, flagging contradictions with older material, strengthening or revising ongoing syntheses.

The knowledge is **compiled once and kept current**, not re-derived on every query.

```
Raw Sources  ──►  LLM Agent  ──►  Wiki (your compiled knowledge)
  (PDFs,               │             (Obsidian-compatible Markdown)
   slides,             │
   recordings)    You direct,
                  LLM maintains
```

Think of it like a codebase:

- **Obsidian** is the IDE — a local, link-aware environment for browsing your notes
- **The wiki** is the codebase — a directory of interlinked Markdown files
- **The LLM** is the maintainer — it reads, writes, cross-references, and keeps everything consistent
- **You** are the architect — you source material, ask questions, and direct the analysis

---

## What ScholarOS Can Do

### 📥 Ingest Any Study Material

Drop a file into `/raw` and tell ScholarOS to process it. The agent will:

- Read the source and discuss key takeaways with you
- Write a structured summary page in `/wiki`
- Update the central index and operation log
- Surgically update existing concept pages — noting where the new material agrees, contradicts, or extends what you already know
- Cross-reference entities: authors, institutions, theories, datasets

A single paper might touch 10–15 wiki pages. Your knowledge compounds with every source you add.

**Supported input types:** PDFs, lecture slides, web articles (via Obsidian Web Clipper), markdown notes, transcripts, recorded lecture notes

### 🗂 A Wiki You Can Actually Navigate

The vault is structured Obsidian Markdown — every page has backlinks, forward links, and tags. Obsidian's graph view shows you the shape of your knowledge: which concepts are well-developed, which are orphans, where disciplines connect.

```
/wiki
├── /concepts      # Core subject matter pages (e.g., "Keynesian Multiplier.md")
├── /entities      # Authors, papers, institutions (e.g., "John Maynard Keynes.md")
├── /syntheses     # AI-generated comparisons and cross-source summaries
├── /courses       # Per-course containers linking to relevant concepts
├── index.md       # Full content catalog, updated on every ingest
└── log.md         # Chronological record of all agent operations
```

Because it's plain Markdown, the wiki is also a git repository. You get version history, branching, and the ability to roll back any AI edit.

### 📊 Generate Slide Decks from Your Notes

When you need to present, ScholarOS can turn a directory of wiki pages into a natively editable `.pptx` file. The agent analyzes your notes, proposes a slide-by-slide narrative strategy, and then builds the deck using DrawingML — not images, not PDFs. The output is a real PowerPoint file you can edit in any presentation tool.

### ✍️ Assignment and Essay Assistance

Draft your essay in the BlockNote editor (a Notion-style block editor built on Yjs). Then invoke the writing aid module to:

- Get automated feedback against the specific assignment rubric
- Verify that your claims are grounded in your wiki references
- Identify claims that lack cited sources from your reading material

The AI works from _your_ notes — it's checking your argument against the papers you've actually read, not the open internet.

### 🃏 Flashcard Scheduling with FSRS

When new concepts are added to the wiki, ScholarOS can automatically generate flashcards scheduled with the FSRS v6 algorithm — the current state of the art in spaced repetition. Cards are stored in a local SQLite database or sidecar files, keeping your Markdown notes clean. Review the cards directly from your vault or export them to Anki.

### 📄 PDF Annotation, Directly into the Wiki

Highlight passages in any PDF using the built-in annotation library. Highlighted quotes are extracted as structured blocks and piped directly into the relevant wiki pages — so your margin notes become permanent, searchable, linked knowledge rather than annotations that live and die in a single file.

### 📋 Semester Task Management

A high-performance kanban board — built with virtual scrolling so it handles hundreds of tasks without slowing down — lets you track assignments, deadlines, and project milestones across courses. Tasks link to relevant wiki pages, so your to-do list is connected to your knowledge base.

---

## Vault Architecture

```
/ScholarOS
├── /raw                  # Immutable source files — never modified by the agent
│   ├── /pdfs
│   ├── /slides
│   ├── /articles
│   └── /assets           # Locally stored images (avoid broken URLs)
│
├── /wiki                 # LLM-generated and maintained Markdown
│   ├── /concepts         # Subject matter pages
│   ├── /entities         # People, institutions, books, datasets
│   ├── /syntheses        # Comparison tables, cross-source summaries
│   ├── /courses          # Per-course index pages
│   ├── index.md          # Master content catalog (updated on every ingest)
│   └── log.md            # Append-only operation log
│
├── /meta
│   └── CLAUDE.md         # The schema — instructs the agent on conventions and workflows
│
└── /assets               # Diagrams and images referenced by wiki pages
```

The `/raw` directory is your source of truth. The agent reads from it but never touches it. The `/wiki` directory is entirely AI-owned — you read it, the agent writes it. The `CLAUDE.md` schema is what makes the agent a disciplined wiki maintainer rather than a generic chatbot; you and the agent co-evolve it as you develop workflows that fit your discipline.

---

## Core Workflows

### 1. The Ingest Loop

```
You drop a source into /raw
        │
        ▼
Agent reads and discusses key takeaways with you
        │
        ▼
Agent writes a summary page in /wiki/entities or /wiki/concepts
        │
        ▼
Agent updates index.md and appends to log.md
        │
        ▼
Agent surgically updates existing concept pages
(flagging contradictions, adding new evidence,
 strengthening or revising ongoing syntheses)
        │
        ▼
You browse the results in Obsidian in real time
```

You stay in the loop — you read the summaries, check the updates, and direct emphasis. Or batch-ingest with less supervision for lighter material. The workflow is yours to define and document in `CLAUDE.md`.

### 2. Query and Synthesize

Ask questions against the wiki. The agent reads the index, drills into relevant pages, and synthesizes an answer with citations. Crucially: **good answers get filed back into the wiki as new pages.** A comparison you asked for, an analysis, a connection you discovered — these are valuable artifacts, not throwaway chat messages. Your explorations compound in the knowledge base just like ingested sources do.

### 3. Slide Generation

Point ScholarOS at a course folder or a set of concept pages. The agent analyzes the material, proposes a narrative arc for the presentation, gets your approval, and exports a native `.pptx` file. All text is editable. All layout is generated from DrawingML, not screenshots of your notes.

### 4. Assignment Mode

Open a new document in the BlockNote editor. Write your draft. Paste in the assignment rubric. The writing aid module reads both your draft and your wiki reference material, then returns structured feedback: which arguments are well-supported by your readings, which claims need citation, which sections don't address the rubric criteria.

### 5. Wiki Health Check (Lint)

Periodically ask the agent to audit the vault:

- **Contradictions** — pages that make conflicting claims
- **Stale content** — claims superseded by more recent sources
- **Orphan pages** — concepts with no inbound links
- **Coverage gaps** — important topics mentioned but lacking their own page
- **Research leads** — questions the wiki raises but hasn't answered

The agent will suggest new sources to find and new questions to investigate.

---

## Agent Rules (`CLAUDE.md`)

The `CLAUDE.md` file in `/meta` is the schema that governs how the agent operates on your vault. Default rules:

- **Check the index first.** Before answering any query, read `wiki/index.md` and `wiki/log.md` to understand what's already been synthesized. Don't re-derive what's already compiled.
- **Compound, don't discard.** If a synthesis or connection is discovered in conversation, write it to a new wiki page. Nothing valuable lives only in chat history.
- **Surgical edits only.** When updating a concept page, change only what the new source affects. Don't rewrite pages wholesale when a targeted update is sufficient.
- **Flag contradictions explicitly.** If a new source contradicts an existing claim, note both positions on the concept page with source citations. Don't silently overwrite.
- **Maintain the log.** Append a structured entry to `log.md` for every ingest, query synthesis, and lint pass. Use a consistent prefix format for easy parsing: `## [YYYY-MM-DD] ingest | Source Title`.
- **Keep backlinks alive.** When creating a new page, add it to `index.md` and link to it from at least one existing page.

You and the agent will evolve these rules over time as you discover what works for your discipline.

---

## Tech Stack

| Layer             | Component                  | Notes                                                          |
| ----------------- | -------------------------- | -------------------------------------------------------------- |
| Editing           | BlockNote                  | Notion-style block editor, built on Yjs for real-time collab   |
| Presentations     | ppt-master                 | Multi-agent pipeline → native `.pptx` via DrawingML            |
| Writing Aid       | ProjectIsidore             | Rubric-based essay grader and reference checker                |
| Memorization      | ts-fsrs                    | TypeScript FSRS v6 spaced repetition scheduler                 |
| PDF Annotation    | react-pdf-highlighter-plus | 100% client-side, highlights pipe into the wiki                |
| Task Board        | react-kanban-kit           | Virtual-scrolling kanban for semester task management          |
| Search (optional) | qmd                        | Local hybrid BM25/vector search over Markdown, with MCP server |

All components are open-source. The core tools are MIT-licensed; see [Licensing](#licensing) for details.

---

## Indexing and Logging

Two files are the navigational backbone of the wiki as it scales.

**`index.md`** is content-oriented — a catalog of every page in the wiki with a one-line summary, a link, and optional metadata (source count, date, tags). The agent reads this first on every query to find relevant pages, then drills in. This works well up to hundreds of pages without needing embedding infrastructure. For larger vaults, `qmd` provides proper hybrid search.

**`log.md`** is chronological — an append-only record of every ingest, synthesis, and audit. Each entry starts with a consistent prefix so the log is trivially parseable:

```
## [2026-04-15] ingest | Kahneman & Tversky (1979) — Prospect Theory
## [2026-04-16] query  | Comparison: Expected Utility vs. Prospect Theory
## [2026-04-18] lint   | Audit pass — 3 orphan pages, 2 contradictions flagged
```

The log gives you a timeline of your intellectual work. It also helps the agent understand recent context without re-reading every page.

---

## Getting Started

### Prerequisites

- [Obsidian](https://obsidian.md) — for browsing and linking your vault
- [Claude Code](https://claude.ai/code) or another LLM agent capable of reading/writing files
- Node.js (for BlockNote, ppt-master, and the optional search tooling)

### Setup

```bash
git clone https://github.com/your-org/ScholarOS
cd ScholarOS

# Install dependencies
npm install

# Open the vault in Obsidian
# File → Open Vault → select the ScholarOS directory
```

### First Ingest

1. Drop a PDF or article into `/raw`
2. Open your agent and point it at the vault
3. Say: _"Ingest the new file in /raw. Check the index and log first, then process it according to CLAUDE.md."_
4. Watch the wiki update in Obsidian in real time

---

## Tips

- **Obsidian Web Clipper** (browser extension) converts web articles to Markdown in one click — ideal for getting readings into `/raw` quickly.
- **Download images locally.** In Obsidian → Settings → Files and links, set the attachment folder to `raw/assets/` and bind "Download attachments" to a hotkey. This lets the agent read images directly instead of relying on URLs that may break.
- **Graph view** is the best way to see the shape of your knowledge — which concepts are hubs, which are underdeveloped, where disciplines intersect.
- **The wiki is a git repo.** Commit regularly. Every AI-generated edit is reversible. Branch for major restructures.
- **Dataview plugin** (Obsidian) lets you query YAML frontmatter across pages — if the agent tags pages by course, difficulty, or source count, you can generate dynamic tables and reading lists automatically.

---

## Licensing

ScholarOS assembles open-source components under permissive licenses. Attribution must be maintained in accordance with each component's license terms.

| Component                  | License    |
| -------------------------- | ---------- |
| BlockNote                  | MIT        |
| ppt-master                 | MIT        |
| ts-fsrs                    | MIT        |
| react-pdf-highlighter-plus | MIT        |
| react-kanban-kit           | MIT        |
| Presenton                  | Apache 2.0 |

---

## The Underlying Idea

The tedious part of maintaining a knowledge base isn't the reading or the thinking — it's the bookkeeping. Updating cross-references, keeping summaries current, noting when new data contradicts old claims, maintaining consistency across dozens of pages. Students abandon notes for the same reason teams abandon internal wikis: the maintenance burden grows faster than the value.

LLMs don't get bored. They don't forget to update a cross-reference. They can touch 15 files in one pass without losing track of what they changed.

Your job is to read, think, source good material, and ask good questions. ScholarOS handles everything else.

---

_Inspired by Vannevar Bush's Memex (1945) — a personal, curated knowledge store with associative trails between documents. Bush's vision was closer to this than to what the web became: private, actively curated, with the connections between documents as valuable as the documents themselves. The part he couldn't solve was maintenance. That part is solved._
