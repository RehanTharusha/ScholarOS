export const skill = String.raw`
# Writing Mode Skill

**Load this skill** when the user asks to write a paper, essay, or assignment. Also load when they mention citations, bibliography, outline, or academic writing.

## Overview

ScholarOS has a built-in Academic Writing Mode that provides an outline panel, inline citations, word count targets, and export to Word/LaTeX.

## Actions

| User intent | Action | Parameters |
|---|---|---|
| "Help me write my paper" | \`open-writing-mode\` | \`notePath\` (optional), \`course\` (optional) |
| "Import citations from Zotero" | \`open-citation-import\` | none |
| "Open this note in writing mode" | \`open-writing-mode\` | \`notePath: "path/to/note.md"\` |

## Workflows

### "Help me write my paper on [topic]"
1. Call \`app-navigation({ action: "open-writing-mode", course: "Course Name" })\`
2. The writing mode opens with:
   - Outline panel (left) — shows document structure
   - Editor (center) — markdown editing with citation support
   - Status bar (bottom) — word count, citations, export
3. Help the user build an outline first
4. Suggest using their existing notes as source material
5. Remind them to cite sources using \`@key\` syntax

### "Import my Zotero library"
1. Call \`app-navigation({ action: "open-citation-import" })\`
2. Guide the user through the import:
   - In Zotero: Select items → File → Export Library → Format: Zotero JSON
   - Or: Right-click → Export Items → BibTeX
   - Paste into the import dialog
3. After import, citations are available via \`@key\` in the editor

### "Cite this source"
1. In the editor, type \`@\` to open the citation picker
2. Search for the citation by author, title, or year
3. Select to insert \`[@key]\` at cursor position
4. The citation appears in the bottom bar count

### "Export my paper"
1. Use the Export dropdown in the bottom-right of writing mode
2. Options: Word (.docx), PDF, Copy as formatted text
3. For Word: preserves headings, formatting, and citations
4. For PDF: renders via Chromium print

## Writing Tips
- Start with the outline — it structures your thinking
- Use \`[@key]\` citations as you write, not at the end
- Track word count against your target
- The AI copilot can help with specific sections if stuck
`;

export default skill;
