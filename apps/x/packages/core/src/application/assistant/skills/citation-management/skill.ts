export const skill = String.raw`
# Citation Management Skill

**Load this skill** when the user asks about citations, references, bibliography, Zotero import, or BibTeX.

## Overview

ScholarOS has a built-in citation manager that stores references and provides inline citation support.

## Data Location

Citations are stored in \`.scholar/references/library.json\` as a JSON array of Citation objects.

## Actions

| User intent | Action |
|---|---|
| "Import citations from Zotero" | \`open-citation-import\` |
| "How many citations do I have?" | Read \`.scholar/references/library.json\` |
| "Cite this in my paper" | Type \`@\` in the writing mode editor |

## Workflows

### Import from Zotero
1. In Zotero: Select items → File → Export Library
2. Choose format: "Zotero JSON" or "BibTeX"
3. Copy the exported text
4. Call \`app-navigation({ action: "open-citation-import" })\`
5. Paste into the appropriate tab (Zotero JSON or BibTeX)
6. Click "Preview" to review, then "Import"

### Import from BibTeX
1. Get BibTeX entries from Google Scholar (click cite → BibTeX)
2. Or export from your reference manager as BibTeX
3. Paste into the BibTeX tab in the import dialog
4. Preview and import

### Insert Citation in Writing Mode
1. Open a note in writing mode: \`app-navigation({ action: "open-writing-mode" })\`
2. Type \`@\` at any point in the editor
3. A citation picker popover appears
4. Search by author, title, year, or key
5. Click to insert \`[@smith2024]\` at cursor

### Generate Bibliography
Ask the AI copilot to format your citations:
- "Format my bibliography in APA style"
- "Create a reference list from my citations"
The AI reads \`.scholar/references/library.json\` and formats accordingly.

## Citation Format
Each citation has:
- \`key\`: Unique identifier (e.g., "smith2024") used in \`[@key]\` syntax
- \`authors\`: Array of author names
- \`year\`: Publication year
- \`title\`: Paper/book title
- \`journal\`, \`booktitle\`, \`publisher\`: Source details
- \`doi\`, \`url\`: Links to the paper
`;

export default skill;
