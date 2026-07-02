export const skill = String.raw`
# Anki Flashcards

**Load this skill** when the user asks to create, manage, or review flashcards for a course or module. This skill enables you to generate high-quality Anki flashcards from course materials and push them directly to the user's Anki desktop app via AnkiConnect.

## Overview

The Anki flashcard workflow has four phases:
1. **Connect** — Verify Anki is running with AnkiConnect
2. **Read** — Gather course materials from the workspace (concept pages, notes, lecture summaries)
3. **Generate** — Create well-structured flashcards (Q&A, cloze deletions, definitions)
4. **Push** — Create the deck in Anki and add all notes

## Tool Reference

All anki tools are builtin tools — call them directly:

| Tool | Purpose |
|---|---|
| \`anki-checkConnect\` | Verify AnkiConnect is reachable (always call first) |
| \`anki-deckNames\` | List existing decks |
| \`anki-createDeck\` | Create a new deck |
| \`anki-modelNames\` | List available note types |
| \`anki-modelFieldNames\` | Get fields for a note type |
| \`anki-addNotes\` | Add multiple notes at once (1-100) |
| \`anki-canAddNotes\` | Preview which notes are new vs duplicates |

## Workflow

### Phase 1: Check Connection

Always start by checking if AnkiConnect is available:

\`\`\`
Call: anki-checkConnect()
If not connected → "Anki isn't running or AnkiConnect is not installed. Please open Anki and install the AnkiConnect add-on (Tools → Add-ons → Get Add-ons → code 2055492159)."
\`\`\`

### Phase 2: Gather Course Materials

Read course-related files from the workspace using workspace tools. Look for:
- Concept pages in the workspace root
- Course index pages in \`/courses/\`
- Lecture notes and summaries
- Any files with relevant frontmatter tags

Use \`workspace-grep\` to find course-specific content, or \`workspace-readdir\` to browse the workspace structure.

### Phase 3: Generate Flashcards

For each concept or topic, create flashcards in these formats:

**Format 1 — Basic (Front/Back):**
- Best for: definitions, facts, formulas
- Front: The question or prompt
- Back: The answer

**Format 2 — Cloze deletion:**
- Best for: fill-in-the-blank, language learning, terms
- Text: "The capital of France is {{c1::Paris}}."
- Back Extra: Additional context or explanation

**Format 3 — Basic (and reversed card):**
- Best for: bidirectional knowledge (term→definition AND definition→term)
- Front: Term
- Back: Definition
- Anki auto-creates a reverse card

### Flashcard Quality Guidelines

- **One concept per card** — never test multiple facts in one card
- **Specific, testable prompts** — "What is the time complexity of quicksort?" not "Tell me about quicksort"
- **Concise answers** — 1-3 sentences, bullet points when appropriate
- **Use tags** — add course/module tags (e.g., \`["cs50", "algorithms"]\`) for organization
- **Include examples** — concrete examples make cards memorable
- **Bidirectional coverage** — for key terms, create cards in both directions

### Phase 4: Push to Anki

1. **Create the deck** (if it doesn't already exist):
   \`\`\`
   Call: anki-createDeck({ deck: "CourseName::ModuleName" })
   \`\`\`
   Use a hierarchical naming convention: \`CourseName\` or \`CourseName::ModuleName\` for subdecks.

2. **Preview duplicates** (optional, recommended for large batches):
   \`\`\`
   Call: anki-canAddNotes({ notes: [...] })
   \`\`\`

3. **Add the notes**:
   \`\`\`
   Call: anki-addNotes({ notes: [...] })
   \`\`\`

4. **Report results** to the user:
   - How many cards were created
   - Which deck they were added to
   - Any duplicates that were skipped
   - Suggest they open Anki to review

## Example: Creating Flashcards for a Module

User: "Create flashcards for CS50 Week 3 - Algorithms"

\`\`\`
1. anki-checkConnect() → verify Anki is running
2. workspace-grep("pattern: algorithms", "searchPath: courses") → gather materials
3. workspace-readFile() for each relevant concept page
4. Generate 20-30 flashcards covering:
   - Sorting algorithms (selection, bubble, merge, quick)
   - Time complexity analysis (Big O, Omega, Theta)
   - Search algorithms (linear, binary)
   - Key terms (stable sort, in-place sort, divide and conquer)
5. anki-createDeck({ deck: "CS50::Week 3 - Algorithms" })
6. anki-addNotes({ notes: [...] })
7. Report: "Created 25 flashcards in CS50::Week 3 - Algorithms"
\`\`\`

## Model Selection Hint

For flashcard generation, use a model with strong comprehension and the ability to identify exam-relevant concepts. Prefer the default model.

## Important Notes

- AnkiConnect runs on \`localhost:8765\`. If the connection check fails, guide the user to:
  1. Open Anki
  2. Go to Tools → Add-ons → Get Add-ons
  3. Enter code \`2055492159\` to install AnkiConnect
  4. Restart Anki
- If adding many cards (50+), batch them into multiple \`anki-addNotes\` calls of 50 at a time.
- Always verify the deck was created successfully before adding notes.
- Cards with identical Front values in the same deck are treated as duplicates by Anki.
`;
