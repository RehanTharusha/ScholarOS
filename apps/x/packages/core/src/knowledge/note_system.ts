import path from "path";
import fs from "fs";
import { WorkDir } from "../config/config.js";

export interface NoteTypeDefinition {
  type: string;
  folder: string;
  template: string;
  extractionGuide: string;
}

// ── Default definitions (used to seed WorkDir/config/notes.json) ─────────────

const DEFAULT_NOTE_TYPE_DEFINITIONS: NoteTypeDefinition[] = [
  {
    type: "Course Concept",
    folder: "courses",
    template: `# {Concept Name}

## Course
**Course:** [[courses/{Course Name}/index.md|{Course Name}]]
**Lecture:** [[courses/{Course Name}/lectures/{Lecture}.md]]
**Tags:** {comma-separated: theorem, definition, example, proof, lemma, formula}

## Summary
{2-3 sentences: The core idea of this concept.}

## Key Points
- {Point 1 with [[linked concepts]]}
- {Point 2}

## Definitions
- **{Term}**: {Definition}

## Formulas / Equations
{For quantitative concepts}

## Examples
- {Example demonstrating the concept}

## Related Concepts
- [[courses/{Course}/concepts/{Related Concept}]] — {relationship}

## Sources
- {Lecture date, textbook chapter, paper reference}

## Questions / Clarifications
- {Things to ask about}

## Last Update
{YYYY-MM-DD}`,
    extractionGuide:
      "Look for: concept name, course, related concepts, definitions, formulas, examples, lecture references",
  },
  {
    type: "Lecture Notes",
    folder: "lectures",
    template: `# {Lecture Title}

## Meta
**Course:** [[courses/{Course Name}/index.md|{Course Name}]]
**Date:** {YYYY-MM-DD}
**Instructor:** {Instructor Name}
**Status:** {unprocessed|partial|complete|reviewed}

## Topics Covered
- {Topic 1}
- {Topic 2}

## Notes
{Free-form lecture notes. Use headers and lists as needed.}

## Key Takeaways
- {Important insight or main point}

## Action Items
- [ ] {Review this concept}
- [ ] {Do the reading}

## Questions
- {Concept you didn't understand}

## References
- {Reading assignment, textbook chapter, link to recording}

## Created
{YYYY-MM-DD}`,
    extractionGuide:
      "Look for: lecture title, course, date, instructor, topics covered, key points, action items",
  },
  {
    type: "Assignment",
    folder: "assignments",
    template: `# {Assignment Title}

## Meta
**Course:** [[courses/{Course Name}/index.md|{Course Name}]]
**Due:** {YYYY-MM-DD}
**Status:** {pending|in-progress|submitted|graded}
**Grade:** {if graded}

## Description
{What the assignment asks you to do.}

## Requirements
- {Requirement 1}
- {Requirement 2}

## Resources
- {Textbook chapter, reference pages, templates}

## Progress
- [ ] {Step 1}
- [ ] {Step 2}

## Notes
{Drafting space, ideas, outline.}

## Submission
{Submission method, link, or notes.}`,
    extractionGuide:
      "Look for: assignment name, course, due date, requirements, submission details",
  },
  {
    type: "Paper Summary",
    folder: "papers",
    template: `# {Paper Title} ({Year})

## Meta
**Authors:** {Author names}
**Venue:** {Conference or journal}
**Tags:** {keywords}
**Status:** {to-read|reading|summarized|reviewed}

## Abstract
{The paper's abstract in your own words.}

## Key Contributions
- {Contribution 1}
- {Contribution 2}

## Methodology
{Brief description of methods used.}

## Findings / Results
- {Key result 1}
- {Key result 2}

## Related Work
- [[courses/{Course}/concepts/{Concept}]] — {how it relates}

## Critique
{Your thoughts: strengths, weaknesses, questions.}

## Connections
- How this connects to other papers or course material.

## Citation
{Formatted citation for your bibliography.}`,
    extractionGuide:
      "Look for: paper title, authors, year, venue, abstract, contributions, methodology, results",
  },
  {
    type: "Synthesis",
    folder: "syntheses",
    template: `# {Synthesis Title}

## Sources Compared
- [[papers/{Paper}]] — {emphasis}
- [[courses/{Course}/concepts/{Concept}]] — {emphasis}

## Comparison
| Aspect | Source A | Source B | Notes |
|--------|----------|----------|-------|
| {Aspect 1} | | | |

## Agreements
- {Where sources agree}

## Contradictions
- {Where sources disagree}

## Synthesis
{Your integrated understanding combining multiple sources.}

## Open Questions
- {What remains unresolved}

## Last Updated
{YYYY-MM-DD}`,
    extractionGuide:
      "Look for: sources being compared, key dimensions of comparison, agreements, contradictions",
  },
  {
    type: "Resource",
    folder: "resources",
    template: `# {Resource Title}

## Info
**Type:** {book|article|video|website|tool|other}
**URL:** {link}
**Tags:** {comma-separated keywords}

## Summary
{1-2 sentences: What this resource covers.}

## Relevance
{Why this is useful for your studies.}

## Related To
- [[courses/{Course}/index.md|{Course Name}]]
- [[courses/{Course}/concepts/{Concept}]]

## Notes
{Your notes on the resource content.}`,
    extractionGuide:
      "Look for: resource type, URL, topic, relevance to courses",
  },
  {
    type: "Entity",
    folder: "entities",
    template: `# {Author / Institution Name}

## Type
{author|institution|research-group}

## Info
**Field:** {area of expertise}
**Affiliation:** {university or institution}
**Notable Works:** {key papers or contributions}

## Related Concepts
- [[courses/{Course}/concepts/{Concept}]] — {contribution}

## Notes
{Any additional context about this entity.}`,
    extractionGuide:
      "Look for: name, field, affiliation, notable works, related concepts",
  },
];

// ── Disk-backed config with mtime caching ──────────────────────────────────

export const NOTES_CONFIG_PATH = path.join(WorkDir, "config", "notes.json");

let cachedNoteTypeDefinitions: NoteTypeDefinition[] | null = null;
let cachedMtimeMs: number | null = null;

function ensureNotesConfigSync(): void {
  if (!fs.existsSync(NOTES_CONFIG_PATH)) {
    fs.writeFileSync(
      NOTES_CONFIG_PATH,
      JSON.stringify(DEFAULT_NOTE_TYPE_DEFINITIONS, null, 2) + "\n",
      "utf8",
    );
  }
}

export function getNoteTypeDefinitions(): NoteTypeDefinition[] {
  ensureNotesConfigSync();
  try {
    const stats = fs.statSync(NOTES_CONFIG_PATH);
    if (cachedNoteTypeDefinitions && cachedMtimeMs === stats.mtimeMs) {
      return cachedNoteTypeDefinitions;
    }
    const content = fs.readFileSync(NOTES_CONFIG_PATH, "utf8");
    cachedNoteTypeDefinitions = JSON.parse(content);
    cachedMtimeMs = stats.mtimeMs;
    return cachedNoteTypeDefinitions!;
  } catch {
    cachedNoteTypeDefinitions = null;
    cachedMtimeMs = null;
    return DEFAULT_NOTE_TYPE_DEFINITIONS;
  }
}

// ── Render helper ────────────────────────────────────────────────────────

export function renderNoteTypesBlock(): string {
  const defs = getNoteTypeDefinitions();
  const sections = defs.map(
    (d) =>
      `## ${d.type}\n\`\`\`markdown\n${d.template}\n\`\`\``,
  );
  return `# Note Templates\n\n${sections.join("\n\n")}`;
}
