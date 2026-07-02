export const skill = String.raw`
# Course Management Skill

**Load this skill** when the user asks about adding courses, organizing by course, managing courses, or switching between courses.

## Overview

ScholarOS organizes content by courses. Each course has its own folder, flashcards, and mastery tracking.

### How Courses Are Created
1. **Auto-created by ingest:** When you upload lecture PDFs or course materials, the ingest pipeline automatically:
   - Classifies files into courses using local embeddings
   - Creates course folders: \`courses/<name>/\`
   - Registers new courses in \`.scholar/courses.json\`
   - Generates notes and flashcards
2. After ingest, new courses appear in the sidebar automatically
3. No manual course creation needed (but user can add more via onboarding or chat)

## Data Location

Courses are stored in \`.scholar/courses.json\`:
\`\`\`json
{
  "courses": [
    { "id": "uuid", "name": "Biology 101", "color": "#3B82F6", "createdAt": "ISO date" }
  ]
}
\`\`\`

## Actions

| User intent | Action | Parameters |
|---|---|---|
| "Switch to courses view" | \`switch-sidebar\` | \`sidebarView: "courses"\` |
| "Switch to files view" | \`switch-sidebar\` | \`sidebarView: "files"\` |
| "Show me my courses" | Read \`.scholar/courses.json\` | — |
| "Add a course" | Write to \`.scholar/courses.json\` | — |

## Workflows

### "Add a new course"
1. Read \`.scholar/courses.json\` (create if doesn't exist)
2. Add new course with auto-generated ID and color
3. Create course folder structure: \`courses/<name>/\`
4. Write updated JSON back
5. Confirm: "Added [Course Name] to your courses"

### "Switch to [course name]"
1. Call \`app-navigation({ action: "switch-sidebar", sidebarView: "courses" })\`
2. The sidebar shows all courses
3. Click the course to expand and see its notes and flashcards

### "What courses am I taking?"
1. Read \`.scholar/courses.json\`
2. List all courses with their note counts
3. Call \`app-navigation({ action: "get-study-stats" })\` for card/review stats per course

### "Organize my notes by course"
1. Check which notes are already in course folders
2. Suggest moving unorganized notes into appropriate courses
3. Use workspace tools to move files

## Course Folder Structure
Each course can have:
- \`courses/<name>/lectures/\` — Lecture notes
- \`courses/<name>/concepts/\` — Concept pages
- \`courses/<name>/papers/\` — Paper summaries
- \`courses/<name>/index.md\` — Course overview
`;

export default skill;
