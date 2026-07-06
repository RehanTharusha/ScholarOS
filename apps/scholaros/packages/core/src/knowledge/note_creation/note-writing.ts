/**
 * Note-writing sub-prompt (steps 8-10).
 * Create/update concept pages, maintain links, update course index.
 */
export function getNoteWritingContent(): string {
  return `## Note Writing (Create & Update Academic Wiki)

### Creating New Concept Pages
Create pages in \`courses/<course-name>/concepts/<Concept Name>.md\` with this structure:

\`\`\`markdown
# Concept Name

## Summary
2-3 sentence overview.

## Definition
Precise definition with key terms bolded.

## Key Points
- Bullet list of core facts

## Prerequisites
- [[Cell Structure]] — what you need before this

## Related Concepts
- [[Cellular Respiration]] — connects via ATP

## Sources
- Lecture 3, Biology 101 (2026-01-15)
\`\`\`

### Updating Existing Pages
Use \`workspace-edit\` for targeted updates:
- Add new key points under the appropriate section.
- Update definitions if the new source provides a better or corrected version.
- Add new source references to the Sources section.
- Update prerequisite links if the new source reveals new dependencies.

### Bidirectional Links
After creating or updating a page:
1. Ensure all \`[[wikilinks]]\` go both ways. If you add \`[[Cellular Respiration]]\` to the Photosynthesis page, ensure Photosynthesis is linked from the Cellular Respiration page too.
2. Update the course \`index.md\` to link to any new concept pages.
3. If the concept spans multiple courses, add cross-references in each course's index.

### Writing Rules
- Use absolute paths for all wiki links: \`[[courses/Biology 101/concepts/Photosynthesis]]\`.
- Be concise — concept pages are reference material, not lecture transcripts.
- Add tags in frontmatter: \`tags: [biology, lecture-3, metabolism]\`.
- Always update \`Last update\` to the source date.
- Write one file per tool call. Do not batch writes.`;
}
