/**
 * Entity-resolution sub-prompt (steps 3-5).
 * Search for related notes, resolve canonical names, identify new entities.
 */
export function getEntityResolutionContent(): string {
  return `## Entity Resolution (Concept & Course Focus)

Identify and resolve academic entities mentioned in the source.

### Concepts
For each concept mentioned, check if a concept page already exists in the relevant course folder:
- Search: \`workspace-grep({ pattern: "concept-name", path: "courses/<course-name>/concepts/" })\`
- Read the course index first: \`workspace-readFile("courses/<course-name>/index.md")\`

### Resolution Rules
- **Exact match** → Use the existing canonical page (update it with new content).
- **Synonym / alternate name** → Link to the existing page and add the alternate name as a tag.
- **Genuinely new concept** → Will be a new page (handled in the note-writing step).

### Authors & Researchers
For academic sources, also track:
- Author names mentioned in lecture transcripts or textbook chapters
- Paper titles, publication venues
- Research groups or labs

Check if any of these already exist in \`entities/\` or \`papers/\`.

### New Entity Threshold
Create a new entity entry for:
- Concepts that appear across multiple sources (lecture + textbook + study session) → Strong signal for a concept page.
- Authors cited in 2+ lectures or a paper → Create an author entry.
- Research groups or labs mentioned as primary affiliation → Create an institution entry.`;
}
