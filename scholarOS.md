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
- Identify suitable flashcard questions from the source (if any), update course-specific flashcard JSON files

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

### 🃏 Intelligent Flashcard System with FSRS

When new concepts are added to the wiki, ScholarOS automatically generates flashcards scheduled with the FSRS v6 algorithm — the current state of the art in spaced repetition. Cards are stored in per-course JSON files (`knowledge/courses/<course-name>/flashcards.json`), keeping your Markdown notes clean while maintaining tight links with your concepts.

Each flashcard includes structured metadata:

- **Tags:** definition, application, comparison, synthesis
- **Source references:** links to the concept pages and ingested materials that generated the card
- **Notes:** context, examples, and mnemonic aids
- **Interconnections:** cards link directly to related wiki concepts

Review cards directly from your vault, or export them to Anki for mobile study.

### 📄 PDF Annotation, Directly into the Wiki

Highlight passages in any PDF using the built-in annotation library. Highlighted quotes are extracted as structured blocks and piped directly into the relevant wiki pages — so your margin notes become permanent, searchable, linked knowledge rather than annotations that live and die in a single file.

### 📋 Semester Task Management

A high-performance kanban board — built with virtual scrolling so it handles hundreds of tasks without slowing down — lets you track assignments, deadlines, and project milestones across courses. Tasks link to relevant wiki pages, so your to-do list is connected to your knowledge base.

### 🔄 Live Learning Tracks

Keep study material automatically updated with _Tracks_ — live note blocks that refresh on a schedule or when triggered. Use this to maintain dynamic content without manual editing:

- **Scheduled tracking:** "Show research papers on quantum computing, updated weekly"
- **Problem set tracking:** "Track new problems from the problem set"
- **Resource collections:** "Keep a list of relevant YouTube lectures, refresh daily"
- **Reading lists:** "Update the assigned readings for next week"

Track blocks live inside your concept pages and refresh on your schedule. Your notes stay fresh without constant manual maintenance.

### 🌐 Embedded Browser with Web Integration

Browse the web directly within ScholarOS while working on your notes. The embedded browser:

- Opens websites without leaving the app
- Indexes live pages for reference and annotation
- Interacts with web content directly within your workflow
- Integrates results back into your wiki

Perfect for comparing multiple sources, reading current research, or exploring supplementary materials while taking notes.

### 📝 Real-Time Document Collaboration

Work on documents directly in ScholarOS using BlockNote, a Notion-style block editor with collaborative features:

- Create and edit study notes with rich formatting
- Collaborate in real-time on shared documents (via Yjs)
- Organize notes with blocks, embeds, and links
- Sync edits directly into the wiki

Use this when crafting concept summaries, writing study guides, or collaborating with study partners.

### 🎬 Interactive App Navigation

Control the ScholarOS UI programmatically to navigate your knowledge base:

- Open specific concept pages, course indexes, or assignment lists
- Switch between graph view, list view, and search
- Filter notes by course, date, or source
- Manage and switch between saved views
- Create custom reading lists and study paths

Combine with the agent's guidance for efficient knowledge exploration.

---

## Vault Architecture

```
/ScholarOS
├── /raw                  # Source files — organized by course, modified by agent during ingest
│   ├── /Biology 101      # Course-specific raw materials
│   │   ├── lecture1.pdf
│   │   └── syllabus.pdf
│   ├── /CS 201           # Another course
│   │   └── slides-week1.pdf
│   └── /assets           # Shared images and media
│
├── /knowledge            # LLM-generated and maintained Markdown (the wiki)
│   ├── /courses          # Per-course folders containing all course materials
│   │   ├── /Biology 101
│   │   │   ├── index.md              # Course overview page
│   │   │   ├── flashcards.json       # Course flashcards with FSRS metadata
│   │   │   ├── /concepts             # Subject matter pages for this course
│   │   │   │   ├── Photosynthesis.md
│   │   │   │   └── Cell Respiration.md
│   │   │   ├── /lectures             # Lecture notes and slides
│   │   │   └── /assignments          # Assignments and grading
│   │   └── /CS 201
│   │       ├── index.md
│   │       ├── flashcards.json
│   │       └── /concepts
│   ├── /papers           # Academic papers, research articles (cross-course)
│   ├── /syntheses        # Comparison tables, cross-source summaries
│   └── /resources        # URLs, tools, reference materials (cross-course)
│
├── /meta
│   └── CLAUDE.md         # The schema — instructs the agent on conventions and workflows
│
└── /assets               # Diagrams and images referenced by wiki pages
```

The `/raw` directory is your dump for study materials. During ingest, the agent organizes files into course subfolders based on content analysis, then processes them into the `/knowledge` wiki. The `/knowledge` directory is entirely AI-owned — you read it, the agent writes it. The `CLAUDE.md` schema is what makes the agent a disciplined wiki maintainer rather than a generic chatbot; you and the agent co-evolve it as you develop workflows that fit your discipline.

---

## Core Workflows

### 1. The Ingest Loop

```
You drop materials into /raw (unorganized)
        │
        ▼
Agent organizes files by course in /raw (e.g., /raw/Biology 101/)
        │
        ▼
Agent reads each file and discusses key takeaways with you
        │
        ▼
Agent writes concept pages in /knowledge/courses/<course>/concepts/
        │
        ▼
Agent updates course index.md and appends to log.md
        │
        ▼
Agent surgically updates existing concept pages
(flagging contradictions, adding new evidence,
 strengthening or revising ongoing syntheses)
        │
        ▼
Agent identifies suitable flashcard questions from source (if any), updates course-specific flashcard JSON
        │
        ▼
You browse the results in Obsidian in real time
```

You stay in the loop — you read the summaries, check the updates, and direct emphasis. Or batch-ingest with less supervision for lighter material. The workflow is yours to define and document in `CLAUDE.md`.

### 2. Query and Synthesize

Ask questions against the wiki. The agent reads the index, drills into relevant pages, and synthesizes an answer with citations. Crucially: **good answers get filed back into the wiki as new pages.** A comparison you asked for, an analysis, a connection you discovered — these are valuable artifacts, not throwaway chat messages. Your explorations compound in the knowledge base just like ingested sources do.

### 3. Slide Generation

Point ScholarOS at a course folder or a set of concept pages. The agent analyzes the material, proposes a narrative arc for the presentation, gets your approval, and exports a native `.pptx` file. All text is editable. All layout is generated from DrawingML, not screenshots of your notes.

### 4. Wiki Health Check (Lint)

Periodically ask the agent to audit the vault:

- **Contradictions** — pages that make conflicting claims
- **Stale content** — claims superseded by more recent sources
- **Orphan pages** — concepts with no inbound links
- **Coverage gaps** — important topics mentioned but lacking their own page
- **Research leads** — questions the wiki raises but hasn't answered

The agent will suggest new sources to find and new questions to investigate.



## Persistent User Memory

ScholarOS learns from every conversation. The system maintains a persistent profile of:

- Your study preferences (bullet points vs. prose, formal vs. casual tone, preferred explanation style)
- Your learning patterns (morning vs. evening study, preferred subjects, pace of learning)
- Relationships and context (study group members, your role in group projects, instructor names)
- Workflow patterns and shortcuts (which tools you use most, typical task sequences)

The agent proactively saves observations from your interactions—no opt-in needed. This profile compounds over time, so every session gets slightly smarter about how to serve you.

---

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
| Memorization      | ts-fsrs                    | TypeScript FSRS v6 spaced repetition scheduler                 |
| PDF Annotation    | react-pdf-highlighter-plus | 100% client-side, highlights pipe into the wiki                |
| Task Board        | react-kanban-kit           | Virtual-scrolling kanban for semester task management          |
| Search (optional) | qmd                        | Local hybrid BM25/vector search over Markdown, with MCP server |

All components are open-source. The core tools are MIT-licensed; see [Licensing](#licensing) for details.

---

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

1. Drop your study materials (PDFs, slides, articles) into `/raw` — don't worry about organizing them by course yet
2. Open your agent and point it at the vault
3. Say: _"Ingest all materials in /raw. Organize them by course first, then process each one according to CLAUDE.md."_
4. The agent will:
   - Analyze files to determine which course/module they belong to
   - Move them into course subfolders (e.g., `/raw/Biology 101/`, `/raw/CS 201/`)
   - Extract metadata and create concept pages under `/knowledge/courses/<course-name>/concepts/`
   - Update the course index page with links to all materials
   - Identify suitable flashcard questions from the source (if any), update the course-specific flashcard JSON file
5. Watch the wiki update in Obsidian in real time

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
