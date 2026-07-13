# ScholarOS — College Student Feature Plan

## Context

ScholarOS already has strong foundations: flashcard systems (built-in SM-2 + AnkiConnect), revision guides, writing mode with citations, PPTX/DOCX/PDF creation, deep research, course management, knowledge graph, and a full ingest pipeline.

This plan covers 8 feature gaps identified from Reddit (r/college, r/GetStudying, r/studytips), student tool surveys, and usage patterns of StudyFetch, Mindgrasp, NotebookLM, and Quizlet. Each is ordered by **impact per unit of implementation effort** for typical college undergrads — not PhD researchers.

---

## Feature Delivery Order

### Sprint 1 — Interactive Quiz Mode

**What it is:** A live "quiz me" session where the agent presents one question at a time, waits for the user's answer, gives detailed feedback on correctness, explains the reasoning, then moves to the next. This is different from flashcard review (which is self-paced, flip-to-reveal). This is agent-led, adaptive, and feedback-rich.

**Why this order:** This was the single most-praised Claude feature on student Reddit. It transforms the agent from a Q&A bot into an active recall tutor. Low implementation effort — mostly a new interaction pattern skill.

**Implementation:**
- New skill: `skills/interactive-quiz/skill.ts`
- Loads course content the same way auto-flashcards does
- Agent presents questions one at a time, waits for user response via chat
- Agent evaluates answer, explains correct reasoning, adapts difficulty
- Tracks which questions were answered correctly/incorrectly per session
- Saves weak topics back to the flashcard system for later review
- Register in `skills/index.ts` and add trigger keywords to `instructions.ts`

**Trigger keywords:** "quiz me", "practice questions", "test me", "interactive quiz", "grill me"

**Dependencies:** None — pure agent skill, uses existing course content and built-in tools.

---

### Sprint 1 — Practice Exam Generator

**What it is:** Course material → full mock exam with mixed question types (MCQ, short answer, essay prompts), difficulty tiers, answer key, time estimates per section. Output as a formatted document (DOCX/PDF) or rendered in chat.

**Why this order:** Flashcards test recall; mock exams test readiness. Students preparing for midterms/finals want to simulate the real exam experience. Complements the revision guide and flashcard systems.

**Implementation:**
- New skill: `skills/practice-exam/skill.ts`
- Reads course lecture pages, concept pages, and exam analysis data
- Generates a balanced exam: ~30% easy, 50% medium, 20% hard questions
- Includes answer key with explanations
- Output as DOCX (via existing docx skill) or rendered in chat for interactive mode
- Register in `skills/index.ts` and `instructions.ts`

**Trigger keywords:** "practice exam", "mock test", "practice paper", "sample questions", "exam simulation"

**Dependencies:** Can leverage the DOCX creation skill for formatted output.

---

### Sprint 2 — Concept Explainer (Socratic Tutor)

**What it is:** A structured teaching skill. User says "teach me [topic]" and the agent:
1. Asks what they already know
2. Explains using Feynman technique + analogies + examples
3. Checks comprehension with targeted questions
4. Fills gaps iteratively

**Why this order:** Turns the agent from a passive Q&A bot into an active tutor. Khanmigo's whole value prop is this. ScholarOS has all the content but no structured pedagogical mode.

**Implementation:**
- New skill: `skills/concept-explainer/skill.ts`
- Structured pedagogical workflow (assess → explain → check → fill)
- References existing knowledge base content for accuracy
- Uses Feynman technique, analogy generation, and comprehension checks
- Adaptive: goes deeper if user struggles, moves on if they've got it
- Register in `skills/index.ts` and `instructions.ts`

**Trigger keywords:** "explain", "teach me", "I don't understand", "help me learn", "break this down", "socratic"

**Dependencies:** None — pure agent skill.

---

### Sprint 2 — Study Schedule Planner

**What it is:** Given exam dates (from calendar) + course content + current flashcard mastery stats → optimized day-by-day study plan with specific tasks.

**Why this order:** Trivial effort. The agent already reads calendar, study stats, and course data. This skill just synthesizes that data into a structured plan.

**Implementation:**
- New or extended in `skills/study-workflow/skill.ts`
- Reads:
  - Calendar tasks (via `calendar:list` IPC) — finds exams with due dates
  - Flashcard stats — current mastery per course, cards due, overdue
  - Course listing — what courses exist
- Generates a time-blocked plan prioritizing weak areas and approaching exams
- Output as structured chat message (not a document)
- Register trigger keywords in `instructions.ts`

**Trigger keywords:** "study plan", "study schedule", "exam schedule", "what should I study", "plan my revision"

**Dependencies:** Calendar system, flashcard stats (both exist).

---

### Sprint 3 — Lecture-to-Notes Pipeline

**What it is:** Upload lecture recording → transcribe (Deepgram already integrated) → extract key concepts → write structured notes with definitions, questions, summary → auto-generate flashcards from the notes.

**Why this order:** The #1 workflow on StudyFetch and Mindgrasp — both multi-million dollar student apps. ScholarOS has voice (Deepgram STT), note creation, and flashcard generation. This chains them together.

**Implementation:**
- New: `skills/lecture-pipeline/skill.ts` — orchestrator skill
- Or: extend existing ingest pipeline with a "lecture mode"
- Flow:
  1. Accept audio/video file or recording
  2. Transcribe via Deepgram (existing `voice:getConfig`, `voice:synthesize`)
  3. Extract concepts, definitions, key questions via LLM
  4. Write structured note to `courses/{course}/lectures/` (existing note creation)
  5. Generate flashcards from the note (existing auto-flashcards)
  6. Report summary to user
- Register in `skills/index.ts` and `instructions.ts`

**Trigger keywords:** "lecture recording", "transcribe lecture", "process my lecture", "lecture notes", "recorded class"

**Dependencies:** Deepgram integration (exists), note creation system (exists), auto-flashcards (exists). The chain does not exist.

---

### Sprint 3 — Resume / Cover Letter Builder

**What it is:** Student info + job description → tailored resume and cover letter, export as DOCX.

**Why this order:** Big use case for juniors/seniors applying for internships. Every career service recommends this. DOCX export already built.

**Implementation:**
- New skill: `skills/resume-builder/skill.ts`
- Takes: user's education, experience, skills + job description
- Generates: tailored resume (ATS-optimized) + cover letter
- Exports as DOCX via existing docx skill
- Store templates in `skills/resume-builder/templates/`
- Register in `skills/index.ts` and `instructions.ts`

**Trigger keywords:** "resume", "CV", "cover letter", "job application", "internship application"

**Dependencies:** DOCX creation skill (exists). Template design needed.

---

### Sprint 4 — Mind Map Generator

**What it is:** Course content or notes → visual mind map for revision. Output as Mermaid diagram (already supported in web artifacts builder) or image.

**Why this order:** Mapify is a top-5 student tool. Mermaid rendering already works. Mostly prompt work to structure content as hierarchical mind maps.

**Implementation:**
- New skill: `skills/mind-map/skill.ts`
- Reads course content or user-provided text
- Structures content hierarchically (central topic → subtopics → details)
- Generates Mermaid mind map syntax
- Renders as an artifact (existing web artifacts builder) or inline Mermaid
- Register in `skills/index.ts` and `instructions.ts`

**Trigger keywords:** "mind map", "concept map", "visualize", "diagram", "brainstorm map"

**Dependencies:** Mermaid support (exists in revision-guide and web-artifacts-builder).

---

### Sprint 4 — Citation Quick-Formatter

**What it is:** Paste URL / book title / DOI / ISBN → get formatted citation in MLA, APA, or Chicago. One-shot, no import dialog needed.

**Why this order:** Trivial implementation. Students writing essays need quick citation formatting constantly.

**Implementation:**
- New skill: `skills/citation-formatter/skill.ts`
- Accepts: URL, DOI, ISBN, or manual metadata
- Outputs: formatted citation in requested style (MLA/APA/Chicago)
- Uses LLM to extract metadata from URLs/sources
- Can optionally save to the existing citation library (`library.json`)
- Register in `skills/index.ts` and `instructions.ts`

**Trigger keywords:** "cite this", "citation", "MLA", "APA", "Chicago", "bibliography entry", "reference format"

**Dependencies:** Citation library (exists). No complex integration needed.

---

## Registration Checklist (for each skill)

1. Create `packages/core/src/application/assistant/skills/{name}/skill.ts`
2. Add to `skills/index.ts`:
   - Import the skill
   - Add definition to `definitions[]` array
3. Add trigger keywords to `instructions.ts` (the "Skill Loading Quick Reference" section)
4. Add to `buildContextualSkillCatalog()` keyword detection in `skills/index.ts`

## Effort Summary

| Sprint | Skill | Effort | Type |
|--------|-------|--------|------|
| 1 | Interactive Quiz Mode | Low | Agent skill only |
| 1 | Practice Exam Generator | Low-Medium | Agent skill + DOCX output |
| 2 | Concept Explainer (Socratic Tutor) | Low | Agent skill only |
| 2 | Study Schedule Planner | Low | Agent skill only (synthesizes existing data) |
| 3 | Lecture-to-Notes Pipeline | Medium | Chains 3+ existing systems |
| 3 | Resume / Cover Letter Builder | Low-Medium | Agent skill + DOCX template |
| 4 | Mind Map Generator | Low | Agent skill + Mermaid rendering |
| 4 | Citation Quick-Formatter | Very Low | Agent skill only |
