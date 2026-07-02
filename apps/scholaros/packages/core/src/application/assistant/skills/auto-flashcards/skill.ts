export const skill = String.raw`
# Auto-Flashcards

**Load this skill** when the user asks to generate flashcards from their notes, create cards from course materials, or set up study cards. This skill reads course materials and creates high-quality study cards stored in ScholarOS's built-in spaced repetition system.

## Overview

The auto-flashcard workflow has four phases:
1. **Identify** — Determine which course or notes to generate flashcards from (ask the user if not specified)
2. **Read** — Gather all relevant markdown files from the workspace (lecture notes, concept pages, summaries for that course)
3. **Generate** — Create 3-5 high-quality flashcards per note
4. **Store** — Save cards to \`.scholar/review/cards.json\`

## Workflow

### Phase 1: Identify the Course

If the user hasn't specified a course or subject, ask them. Look for:
- Course folders under \`/courses/\` in the workspace
- Concept pages in the workspace root
- Notes with relevant frontmatter tags

Use \`workspace-grep\` to find course-specific content, or \`workspace-readdir\` to browse the workspace structure.

### Phase 2: Gather Course Materials

Read course-related markdown files from the workspace. Use \`workspace-readdir\` to list files and \`workspace-readFile\` to read each note. Look for:
- Lecture notes and summaries
- Concept pages
- Any markdown files with course-relevant frontmatter
- Study guides and outlines

### Phase 3: Generate Flashcards

For each note or concept, create 3-5 high-quality flashcards. Each card must follow these rules:

**Question Rules:**
- One concept per card — never test multiple facts in a single card
- Specific, testable questions ("What is the primary function of cyclin-dependent kinases?" not "Tell me about CDKs")
- Mix of question types: definitions, processes, relationships, examples, comparisons
- For processes: ask about steps and order ("What are the 4 stages of the cell cycle in order?")
- For concepts: include both definition and application ("What is X? Give an example.")
- For relationships: ask about connections ("How does X relate to Y?")
- Include "why" and "how" questions, not just "what"

**Answer Rules:**
- Concise but complete (1-3 sentences)
- Include key terminology
- For processes: list steps in order
- For definitions: include the core meaning plus context

### Phase 4: Store Cards

Read the existing \`.scholar/review/cards.json\` file (create it if it doesn't exist). Add new cards with this exact structure:

\`\`\`json
{
  "id": "crypto.randomUUID()",
  "noteSource": "path/to/note.md",
  "course": "Course Name",
  "topic": "Topic Name",
  "question": "The specific, testable question",
  "answer": "The concise answer",
  "type": "qa",
  "interval": 0,
  "easeFactor": 2.5,
  "repetitions": 0,
  "lastReview": null,
  "nextReview": "now",
  "lastQuality": null
}
\`\`\`

**Storage steps:**

1. Read \`.scholar/review/cards.json\` using \`workspace-readFile\`. If the file doesn't exist, create it with:
\`\`\`json
{ "cards": [], "sessions": [] }
\`\`\`

2. For each new card:
   - Generate a unique ID using \`crypto.randomUUID()\`
   - Set \`noteSource\` to the relative path of the source markdown file
   - Set \`course\` to the course name
   - Set \`topic\` to the specific topic within the course
   - Set \`type\` to \`"qa"\`
   - Set initial SM-2 state: \`interval: 0\`, \`easeFactor: 2.5\`, \`repetitions: 0\`
   - Set \`nextReview\` to today's ISO date string so they appear immediately (\`new Date().toISOString()\`)

3. Append the new cards to the existing \`cards\` array.

4. Write the updated data back to \`.scholar/review/cards.json\` using \`workspace-writeFile\` with \`mkdirp: true\`.

5. Report: "Generated N cards for [course]. They'll appear in your review queue."

## Card Quality Guidelines

- **One concept per card** — never test multiple facts in one card
- **Specific, testable prompts** — "What is the time complexity of merge sort?" not "Tell me about sorting algorithms"
- **Concise answers** — 1-3 sentences, include only essential information
- **Include the source** — every card has a \`noteSource\` field pointing to the original note
- **Tag with course and topic** — use the \`course\` and \`topic\` fields for organization
- **Mix question types** — definitions, processes, relationships, comparisons, examples
- **Avoid trivial cards** — skip information the user already demonstrated understanding of
- **Test understanding** — questions should require thinking, not just recall

## Example: Generating Flashcards for CS50 Algorithms

User: "Generate flashcards for CS50 Week 3 - Algorithms"

\`\`\`
1. Identify course: "CS50" → "Week 3 - Algorithms"
2. workspace-grep("pattern: algorithms", "searchPath: courses/CS50")
3. workspace-readFile() for each relevant note
4. Generate 15-20 cards covering:
   - Sorting algorithms (selection, bubble, merge, quick)
   - Time complexity (Big O, Big Omega, Big Theta)
   - Search algorithms (linear, binary)
   - Key terms (stable sort, in-place sort, divide and conquer)
5. Read .scholar/review/cards.json (or create empty structure)
6. Append all new cards to cards array
7. Write back with workspace-writeFile
8. Report: "Generated 18 cards for CS50 - Week 3. They're in your review queue."
\`\`\`

## Important Notes

- The cards are stored in the workspace root at \`.scholar/review/cards.json\` — this is the single source of truth for the built-in review system
- Each card uses the SM-2 spaced repetition algorithm: \`interval\`, \`easeFactor\`, \`repetitions\`, \`nextReview\` determine when cards appear
- New cards start with \`nextReview: "now"\` so they appear in the review queue immediately
- If \`.scholar/review/cards.json\` already exists, merge new cards into the existing \`cards\` array — never overwrite existing cards
- Cards with identical questions are NOT considered duplicates; the user may want to review the same concept from different sources
`;
