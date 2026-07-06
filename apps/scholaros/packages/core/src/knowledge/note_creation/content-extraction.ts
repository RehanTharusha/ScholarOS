/**
 * Content-extraction sub-prompt (steps 6-7).
 * Extract key concepts, definitions, theorems, experiments; detect state changes.
 */
export function getContentExtractionContent(): string {
  return `## Content Extraction (Academic Focus)

Extract structured information from the source. Focus on academic value.

### Key Concepts
For each distinct concept in the source:
- **Definition** — Concise, accurate, in the student's own words when possible.
- **Key equations / formulas** — With variable descriptions.
- **Examples** — Concrete applications that illustrate the concept.
- **Prerequisites** — What the student needs to understand first (e.g., "Photosynthesis" → "Cell Structure").
- **Related concepts** — Cross-references to other wiki pages (e.g., "Cellular Respiration" links to "Krebs Cycle").
- **Open questions** — Points the lecturer marked as unresolved, controversial, or beyond-scope.

### Detecting Supersession / Corrections
When a new lecture overlaps an existing concept page:
- If the new lecture gives a *broader* or *corrected* explanation → Flag the existing page for update. Include the new content and specify what changed.
- If the new lecture covers the same material at the same level of detail → No update needed; just note the additional source reference.
- If the new lecture contradicts an existing page → Flag as a contradiction with both versions; do not silently overwrite.

### Study-Aids Extraction
Also extract:
- Mnemonics or memory aids the lecturer provided.
- Common exam questions or past-paper references.
- Difficulty notes ("This is a common stumbling point").
- Recommended reading or external resources.`;
}
