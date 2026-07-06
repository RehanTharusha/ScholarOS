export function getFileIngestCapability(): string {
  return `## File Ingest Capability — Full Workflow

When users upload files or ask you to **ingest** course materials (e.g., "process this textbook chapter", "add these lecture slides"), supports: PDF, PPTX, DOCX, XLSX, CSV, PNG, JPG, MD, TXT, HTML.

### purpose.md — User's stated goals

If \`purpose.md\` exists at the workspace root, read it BEFORE processing any files. It contains the user's stated goals, research scope, and what they want their wiki to emphasize. Treat it as the highest-priority context — it overrides generic defaults for concept extraction depth, organization style, and cross-referencing. If \`[INGEST_MODE=guided]\` is set, mention the purpose context in the ask-human pause so the user sees their goals reflected in the suggested concepts.

### User-Supplied Flags

The instruction text may contain these flags. Parse them if present:

- \`[INGEST_MODE=guided]\` — use Guided workflow (pause to ask user before writing concepts)
- \`[COURSE=<name>]\` — the user explicitly chose this course; skip the \`classifyFiles\` step and use this course directly
- \`[SEMESTER=<semester>]\` — semester context (e.g., "Fall 2025")
- \`[TOPIC=<topic>]\` — topic hint or area of study (e.g., "Cell Biology")

If \`[INGEST_MODE=guided]\` is absent, use **Autonomous** workflow (write directly without pausing).

---

### Guided Mode

In Guided mode, after parsing and classifying, you MUST pause to let the user curate concepts before writing any pages.

1. **Organize files into correct course folder:** If \`[COURSE=<name>]\` is provided, skip \`classifyFiles\` — use the specified course directly. If no \`[COURSE]\` flag, call \`classifyFiles\` and proceed normally. Use \`workspace-rename\` to move files into \`raw/<course-name>/\` (e.g., \`raw/Biology 101/lecture1.pdf\`).

1b. **Register courses:** After organizing files, check if each course folder exists in \`.scholar/courses.json\`. If a new course is created (either by classifyFiles, the \`[COURSE]\` flag, or user confirmation), add it to \`.scholar/courses.json\`:

   Read \`.scholar/courses.json\` (create if missing with \`{ "courses": [] }\`).
   For each new course folder, add an entry:
   \`\`\`json
   { "id": "<uuid>", "name": "<course-name>", "color": "<auto-assigned>", "createdAt": "<ISO date>" }
   \`\`\`

   Auto-assign colors from this palette in order: #3B82F6, #16A34A, #8B5CF6, #D97706, #DC2626, #0891B2, #7C3AED, #059669

   This ensures the Courses sidebar automatically shows new courses after ingest.

2. **Extract and process:** Call \`parseFile\` to extract text from files in their organized locations. **CRITICAL: inspect the \`content\` field of the response directly.** If content has any meaningful text (even partial), use it to create study materials. The \`metadata.fallback\` field is informational only — ignore it when deciding whether content is usable. The \`content\` field is the source of truth.

3. **Pause for curation (Guided mode only):** After extracting and classifying, before writing any pages, call \`ask-human\` with a question formatted EXACTLY as follows (the frontend parses this format to render an editable concept list):
   \`\`\`
   [APPROVE_CONCEPTS]
   { "kind": "approve-concepts",
     "sourceFiles": ["file1.pdf", "file2.pdf"],
     "suggestedCourse": "Course Name",
     "concepts": [
       { "id": "c-1", "title": "Concept Name",
         "description": "Brief description.",
         "difficulty": "beginner|intermediate|advanced",
         "related": ["Related Concept"] }
     ],
     "contradictions": [] }
   \`\`\`
   Wait for the user's response. The response will be JSON containing: \`approvedConceptIds\` (array of concept ids to keep), \`renamedTitles\` (map of concept id to new title), \`removedConceptIds\` (skipped concepts), and \`contradictionResolutions\` (map of contradiction id to resolution: "both-valid"|"superseded"|"merged"). Write ONLY the approved concepts below.

4. **Create course-specific materials:** Save notes INSIDE \`courses/<course-name>/\` (e.g., \`courses/Biology 101/concepts/Photosynthesis.md\`). Never save notes to the workspace root or other locations. If the content is substantial, create a proper study note from the extracted text (summarize key concepts, organize by topic). If content is truly empty (< 50 chars total), create a minimal placeholder noting the file was unreadable.

5. **Update course index:** Ensure \`courses/<course-name>/index.md\` links to all created materials.

### Automatic Fallback Chains per Format

Always prefer \`parseFile\` for extraction. Automatic fallback chains per format (no action needed from you):

- **PDFs:** pdf-parse → pdftotext → ocrmypdf → tesseract.js → LLM (all automatic, NEVER suggest installing external tools)
- **PPTX:** jszip XML extraction
- **DOCX:** mammoth raw text
- **XLSX/CSV:** SheetJS / papaparse
- **PNG/JPG:** tesseract.js OCR → LLM
- **MD/TXT/HTML:** direct text read (no parsing needed)

Do NOT suggest users install pdftotext, ocrmypdf, poppler, or any other CLI tools. All fallbacks are optional — the primary parsers (pdf-parse, tesseract.js) are bundled and work without external dependencies. If a PDF is unreadable, the LLM fallback will handle it automatically.

Do not use \`LLMParse\` standalone tool unless the user explicitly asks. The \`parseFile\` tool now includes LLM as automatic last-resort fallback.

**Debugging if OCR isn't working:**
Use environment variables when running the app:
- COMMAND_CHECK_DEBUG=1 npm run dev - Shows which CLI tools are detected
- PARSE_DEBUG=1 npm run dev - Shows parsing attempts per format
- COMMAND_CHECK_DEBUG=1 PARSE_DEBUG=1 npm run dev - Both

**If a file has no extractable content:**
- Check debug logs to see which tools were tried
- The system tries: pdf-parse → pdftotext → ocrmypdf → tesseract.js (in-process canvas render)
- If \`content\` field is empty or < 50 chars, extraction genuinely found nothing. Create a minimal placeholder note.
- If \`content\` has meaningful text but \`metadata.fallback\` is set, **use the content anyway** — it's partial text from an imperfect extraction, still valuable
- For better OCR on scanned PDFs, suggest installing ocrmypdf: \`brew install ocrmypdf\` (macOS), \`apt install ocrmypdf\` (Ubuntu), \`pip install ocrmypdf\` (Windows)
- Only suggest LLMParse as absolute last resort

### Autonomous Mode (default, no mode flag)

In Autonomous mode, skip the ask-human pause. After parsing and classifying, proceed directly to writing concept pages. This is the fast path for bulk ingest or experienced users.

### Important: Context Sources (Read in this order)

1. **purpose.md** — Read from workspace root if it exists. This is the user's stated goal for the wiki. Highest priority context.
2. **User-supplied flags** — Parsed from the instruction text:
   - \`[INGEST_MODE=guided]\` — Guided mode (ask-human pause before writing)
   - \`[COURSE=<name>]\` — Use this course directly. Skip classifyFiles for course detection, but still classify for other metadata.
   - \`[SEMESTER=<semester>]\` — Semester context for course registration.
   - \`[TOPIC=<topic>]\` — Topic hint to guide concept extraction emphasis.
3. **File content** — Parsed via \`parseFile\`. Lower priority than purpose and flags.
`;
}
