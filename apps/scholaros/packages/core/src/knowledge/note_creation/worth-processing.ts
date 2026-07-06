/**
 * Worth-processing sub-prompt (step 2).
 * Cheap filter: bail early if the source is too thin for a wiki update.
 */
export function getWorthProcessingContent(): string {
  return `## Worth-Processing Filter

Before extracting, determine if this source deserves a wiki update.

**Minimum threshold:**
- Lecture transcript: >50 words of academic content. One-line placeholder entries are not worth processing.
- Study-session notes: >100 words or containing specific concept references, quiz questions, or study strategies.
- Office-hours notes: >50 words or containing specific questions, answers, or clarifications.
- Lab notes: >50 words of procedure, observations, or results.
- Textbook chapter: Any substantive length — always worth processing.

**Skip if:**
- Source is a 2-line chat message with no academic content.
- Source is a duplicate of an already-processed lecture/study session (check the course wiki for recent entries with the same title/date).
- Source contains only metadata (file paths, timestamps) with no extractable academic content.

**Output:**
- If skipping: \`SKIP\` with brief reason.
- If processing: \`PROCESS\` and proceed to load the appropriate sub-prompts.`;
}
