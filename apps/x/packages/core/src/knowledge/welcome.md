# Welcome to ScholarOS

This vault is your academic knowledge base.

ScholarOS reads your study materials — lecture PDFs, papers, slides, transcripts — and turns them into a structured, interlinked wiki of Markdown notes. The AI maintains the wiki so you don't have to.

---

## How it works

**Drop sources into `/raw`**
Add any study material to the `/raw` folder, organized by course or unorganized — the agent sorts it out.

**Run the ingest**
Point your AI agent at the vault and say: _"Ingest all materials in /raw."_ It reads each file, writes concept pages into the workspace root, and cross-references everything.

**Browse in Obsidian**
Open the vault in Obsidian to explore the wiki, follow backlinks, and see the graph of your knowledge grow with every ingest.

---

## Your vault structure

```
/raw          ← Drop study materials here (PDFs, slides, notes)
/courses/     ← Per-course concept pages, lectures, assignments
/papers/      → Academic papers and research articles
/syntheses/   → Cross-concept summaries and comparisons
/resources/   → URLs, tools, and reference materials
/meta         ← CLAUDE.md schema that guides the agent
/assets       ← Images and diagrams
```

---

## What the agent builds

- **Concept pages** — one page per idea, with backlinks and source citations
- **Course indexes** — a hub for each course linking all its concepts
- **Synthesis pages** — cross-source comparisons and summaries
- **Flashcards** — FSRS-scheduled cards stored in `flashcards.json` per course

---

## Design principles

**Compile once, keep current**
Knowledge is extracted and integrated on ingest, not re-derived on every query. Your wiki compounds with every source you add.

**Surgical edits only**
When new material arrives, the agent updates only the pages it affects — it never rewrites the whole wiki.

**Flag contradictions**
If a new source contradicts an existing claim, both positions are noted with citations. Nothing is silently overwritten.

**Local and inspectable**
All files are plain Markdown. You can read, edit, or delete anything at any time. The vault is also a git repository — every AI edit is reversible.

---

Ready to start? Drop your first study materials into `/raw` and ask the agent to ingest them.
