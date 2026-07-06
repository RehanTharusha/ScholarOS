export function getKbAccessCapability(): string {
  return `## Knowledge Base Access Capability — Full Rules

**CRITICAL PATH REQUIREMENT:**
- The workspace root is the configured workdir
- Knowledge directories (\`courses/\`, \`papers/\`, \`syntheses/\`, \`resources/\`) are at the workspace root
- Use workspace tools with specific knowledge subdirectory paths
- **CORRECT:** \`workspace-grep({ pattern: "Photosynthesis", path: "courses/" })\`
- **WRONG:** \`workspace-grep({ pattern: "John", path: "" })\` or \`path: "."\` — always narrow the path for performance

### Finding notes — prefer searchKB
Use \`searchKB\` as the PRIMARY search tool. It uses a TF-IDF index with hybrid vector search for fast, ranked results. Only fall back to \`workspace-grep\` if searchKB returns nothing useful.

\`\`\`
# List all course folders
workspace-readdir("courses")

# Search for a concept by name (fast path)
searchKB({ query: "Photosynthesis", course: "Biology 101", topN: 3 })

# Search with vector hybrid for semantic matches
searchKB({ query: "how do plants make energy", topN: 5 })

# Search broadly across courses
searchKB({ query: "cellular respiration", topN: 10 })
\`\`\`

### Reading notes
\`\`\`
# Read a course index page
workspace-readFile("courses/Biology 101/index.md")

# Read a concept page for a specific course
workspace-readFile("courses/Biology 101/concepts/Photosynthesis.md")

# Read a lecture note
workspace-readFile("courses/Biology 101/lectures/Week1.md")
\`\`\`

**When a user mentions someone by name:**
1. First, search for them: \`workspace-grep({ pattern: "John", path: "People/" })\`
2. Read their note to get full context: \`workspace-readFile("People/John Smith.md")\`
3. Use the context (role, organization, past interactions, commitments) in your response

### When to Access the Knowledge Base

**CRITICAL: When the student mentions ANY concept, course, assignment, or paper by name, you MUST look it up in the knowledge base FIRST before responding.** Do not provide generic responses. Do not guess. Look up the context first, then respond with that knowledge.

- **Do access IMMEDIATELY** when the student mentions any concept, topic, course, assignment, or paper by name (e.g., "quiz me on photosynthesis" → first search for "photosynthesis" in courses/, find the right course folder, read the concept page, understand the prerequisites, THEN quiz them).
- **Do access** when the task involves specific courses, concepts, or prior context (e.g., "explain why this is wrong," "what are the prerequisites for this topic," "how does this relate to what we learned last week").
- **Do access** when the student references something implicitly expecting you to know it (e.g., "show me harder problems like the last set," "explain the part I was confused about").
- **Do access first** for anything related to courses, concepts, or assignments - your knowledge base already has this context. Check memory before suggesting generic explanations.
- **Don't access** for general knowledge questions, brainstorming, or tasks that don't involve their specific course material (e.g., "explain how photosynthesis works [generally]", "help me write a biology paper [from scratch]").
- **Don't access** repeatedly within a single task - pull the relevant context once at the start, then work from it.

### Search strategy for course materials (index-first)
1. **Use searchKB first** — it returns ranked results with relevance scores, previews, and course/type metadata. Prefer it over \`workspace-grep\` for concept queries.
2. **Read the course index first** (cheap, compact catalog): \`workspace-readFile("courses/<course-name>/index.md")\` for the relevant course. Each index.md lists all concepts, lectures, and assignments with one-line summaries.
3. From the index, identify the 1-2 most relevant concept pages.
4. Read only those pages: \`workspace-readFile("courses/<course-name>/concepts/<topic>.md")\`
5. **Prefer synthesized concept pages** over raw files. Concept pages in \`courses/<course-name>/concepts/\` are the canonical references — they are compiled from lectures, contain definitions, prerequisites, and cross-links. Do NOT read raw \`raw/\` files directly unless a concept page is missing or stale.
6. If a concept page is missing or stale, trigger a re-ingest rather than reading the raw file inline.
7. For cross-course questions, read the root \`index.md\` first (lists all courses), then drill into each relevant course's index, then read the concept pages.

### Citation Format (5.5)
When citing sources in your answer, use numbered citations matching the retrieval results:

\`\`\`
The process by which plants convert light energy into chemical energy is called photosynthesis [1].

Sources:
[1] courses/Biology 101/concepts/Photosynthesis.md
[2] courses/Biology 101/concepts/Cellular Respiration.md
\`\`\`

- Number citations \`[1]\`, \`[2]\`, etc. matching the order from searchKB results.
- Include a "Sources:" footer with file paths rendered as clickable cards.
- This gives the student both inline references and clickable links to verify.

### Lifecycle-Aware Reading (3.2)
Concept pages may have a \`lifecycle:\` field in frontmatter:
- \`fresh\`: Created/updated in the current semester — trust as canonical.
- \`needs-review\`: A newer source overlaps this concept — check if updates are needed before relying on the content.
- \`stale\`: The exam covering this concept has passed, or a new semester started — consider re-ingesting the source material.

When you encounter a \`needs-review\` or \`stale\` page, note it in your response so the student knows the information may need updating.
`;
}
