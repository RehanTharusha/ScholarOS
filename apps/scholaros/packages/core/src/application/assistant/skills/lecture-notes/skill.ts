export const skill = String.raw`
# Lecture Notes Skill

**Load this skill** when the user asks about taking lecture notes, processing lecture recordings, organising class material, Cornell notes, note-taking methods, capturing lecture content, or improving their notes. This skill is the SOLE authority for lecture-note creation — it replaces ad-hoc note-taking advice with a research-backed system.

## Core Philosophy

Lecture notes are not transcripts. Notes are study tools. The goal is not to capture every word — it is to capture what matters in a form that supports **active recall** and **spaced repetition**. Research consistently finds:

| Finding | Source |
|---------|--------|
| Cornell > Outline > Verbatim for retrieval | Nigeria study (Iiste.org), Seo 2025 |
| Handwritten > typed for conceptual understanding | Mueller & Oppenheimer 2014, Meta-analysis 2024 |
| Review within 24h is the highest-yield habit | Ebbinghaus forgetting curve, CRLT Michigan |
| Spaced review (1d→7d→30d→90d) beats cramming | Karpicke & Roediger 2008 |
| Structured note-taking increases motivation | Yıldırım 2026 Frontiers in Psychology |
| Organised notes (not transcription) drive retention | Xu et al. 2024 |

**The pen is mightier than the keyboard, but the method is mightier than the pen.** What matters most is organised, paraphrased notes reviewed on a spaced schedule.

## The Lecture Notes Workflow

### Phase 1: Before Lecture (5 min)

Set up the Cornell scaffold. This primes attention and reduces cognitive load during class.

1. Open or create a new note in ScholarOS with Cornell format:
   - **Cue column** (left, ~30% width) — leave blank for now
   - **Notes column** (right, ~70% width) — main capture area
   - **Summary row** (bottom, ~5 lines) — leave blank for now
2. Write at the top:
   - Course name, lecture date, instructor
   - 3 terms you expect to hear (based on syllabus, previous lecture, or readings)
   - 1 question you want answered
3. If slides or readings exist for the lecture, skim them for 2 minutes and note any unfamiliar terms in the cue column

### Phase 2: During Lecture (Capture)

**Use only the Notes column during lecture.** Do NOT touch the cue column or summary yet.

**Rules:**
- **Paraphrase, don't transcribe** — listen → process → write in your own words. This is the cognitive act that builds memory.
- **Write in bullets and short phrases** — full sentences waste time. Use \`→\` for causal links, \`=\` for equivalence, \`?\` for confusion.
- **Leave gaps** — If you miss something, leave a blank line and move on. Fill it later from the recording or a classmate.
- **Flag exam signals** — When the lecturer repeats, writes on the board, contrasts two ideas, or says "this will be on the exam", mark with \`★\` or \`[EXAM]\`.
- **Capture examples** — Examples are what make abstract concepts concrete and retrievable. Write the example.
- **Use abbreviations** — Develop a personal shorthand (e.g., \`w/\` = with, \`w/o\` = without, \`→\` = leads to, \`≠\` = different from, \`e.g.\` = for example).
- **If lecture is too fast** — Stop writing. Listen. Write only key terms and fill in after. Transcription crowds out thinking.

**For different lecture styles:**
| Lecture style | Strategy |
|---|---|
| Fast talker, dense slides | Capture only slide titles + definitions. Fill detail from slides after class. |
| Socratic / discussion-heavy | Write questions asked + key responses. Note your own thoughts in \`[brackets]\`. |
| Problem-solving (STEM) | Copy the problem statement, then capture only the key step / insight. Don't copy every algebra step. |
| Story / narrative (history, lit) | Write chronology + cause/effect links. Note the thesis or interpretive claim. |

### Phase 3: Within 24 Hours (Process)

This is the **most critical phase**. Notes taken but not processed within 24 hours decay dramatically (Ebbinghaus). Do this the same evening or next morning.

#### Step 3a: Fill the Cue Column

For each distinct idea in your notes column, write a **question** in the cue column that the notes answer. Not a keyword — a question.

| Weak (keyword) | Strong (question) |
|---|---|
| "Photosynthesis" | "What are the two stages of photosynthesis and where do they occur?" |
| "Newton's 2nd Law" | "Write the equation for Newton's Second Law and explain each variable." |
| "Mitosis phases" | "List the four phases of mitosis in order and describe what happens in each." |

**Rule of thumb:** 1–2 cue questions per major idea. Aim for 8–12 cues per hour-long lecture.

#### Step 3b: Write the Summary

In the summary row (2–4 sentences), answer:
- What was the lecture's main argument or big idea?
- How does this connect to the previous lecture or course themes?
- What is still unclear or needs follow-up?

**Upgrade the summary for deeper encoding:** Instead of just summarising, use elaborative prompts:
- "How is this like [previous topic], and how is it different?"
- "What condition must be true for this to apply?"
- "If [variable] changes, what happens to [outcome]?"

#### Step 3c: Clean and Tag

1. Fix broken shorthand — expand abbreviations you won't remember later
2. Fill gaps from memory, the recording, or the slides
3. Add wikilinks to related concepts in the ScholarOS wiki: \`[[courses/Bio 101/concepts/Cellular Respiration]]\`
4. Run the note-creation pipeline: \`loadCapability("note-creation:content-extraction")\` to extract concepts and update the wiki
5. Tag the note in ScholarOS with:
   - \`academic_note_type: lecture-notes\`
   - \`academic_exam_phase: {pre-semester | during-semester | midterm-prep | final-prep}\`
   - \`source: lecture\`
   - Course-specific tags

### Phase 4: Spaced Review (Long-Term)

Use the cue column as a built-in flashcard deck. Do NOT re-read the notes column — that's passive recognition, not active recall.

**Review schedule:**

| Interval | What to do | Duration |
|---|---|---|
| Same day (Phase 3) | Fill cues + summary. Already done. | 10–15 min |
| Day 1 (next day) | Cover Notes column. Answer from Cue column. Check. Mark misses. | 5–10 min |
| Day 7 | Cover Notes. Answer from Cues. Redo misses. | 5–10 min |
| Day 30 | Same process. Most should be solid now. | 3–5 min |
| Day 90 | Final confirmation. Should feel easy. | 2–3 min |
| Before exam | Quick skim of summaries + cue column only. | 5–10 min |

**How to review (fold-over method):**
1. Cover the Notes column with a piece of paper or your hand
2. Read the first cue question
3. Answer aloud or in writing — out loud is better (it's retrieval + production)
4. Uncover to check accuracy
5. If correct + confident → done with this cue
6. If partially correct or hesitant → mark for re-review tomorrow
7. If wrong → note the gap, re-read the relevant notes section, test again in 5 minutes

**Spaced repetition integration:** For the cues you consistently miss, convert them into ScholarOS flashcards (load the auto-flashcards skill) and add to the built-in spaced repetition system. This hybrid approach (Cornell for context + flashcards for weak spots) is the most efficient.

### Phase 5: Synthesis & Exam Prep

**Weekly synthesis (30 min):**
- At the end of each week, gather all lecture summaries from that week
- Write a **master summary** connecting them: "This week we covered X, Y, Z. The thread is that all three are mechanisms of [big idea]."
- Create a concept map showing relationships between the week's concepts (use the mind-map skill)
- Identify gaps or confusion and flag for office hours or further reading

**Before exams:**
1. Skim all cue columns (not notes columns) — this is rapid retrieval practice
2. For any cue you can't answer, unfold and read only that section
3. Create master summaries linking lectures across the entire course
4. Convert your most-missed cues to flashcards for final cram-proofing
5. Run the interactive-quiz skill on the course material to stress-test your knowledge

## Lecture Notes in ScholarOS

### Creating a new lecture note

1. Use \`app-navigation\` with action \`create-file\` at \`courses/<Course Name>/lectures/\` or navigate there via the vault picker
2. Use the "Lecture Notes" note type template (it has Cornell structure pre-built)
3. If the lecture transcript or recording exists as a file, attach it to the note
4. Process through the note creation pipeline for concept extraction

### Processing lecture recordings / transcripts

If the user has a lecture recording, transcript, or slides:
1. First run the recording through ScholarOS's built-in note creation agent: \`loadCapability("note-creation")\`
2. Extract key concepts into the course wiki (concept pages)
3. Create the lecture note with Cornell structure
4. The note creation pipeline handles: entity resolution → content extraction → note writing → wiki update

### Templates

The Lecture Notes template in ScholarOS already follows this workflow. When creating a lecture note, use the Cornell-enhanced template:

\`\`\`markdown
# {Lecture Title}

## Meta
**Course:** [[courses/{Course Name}/index.md|{Course Name}]]
**Date:** {YYYY-MM-DD}
**Instructor:** {Instructor Name}
**Status:** {unprocessed | partial | complete | reviewed}

## Cue Column
{Write questions here during Phase 3 — one per major idea}

## Notes Column
{Write lecture capture here during Phase 2 — paraphrased, bulleted, examples}

## Summary
{Written during Phase 3 — 2-4 sentences: main argument, connections, unclear points}

## Key Takeaways
- {Main insight — what to remember 6 months from now}

## Action Items
- [ ] Review cue column (Day 1 / Day 7 / Day 30 / Day 90)
- [ ] Convert missed cues to flashcards
- [ ] Do the reading / problems

## Questions for Next Time
- {Concept you didn't understand}

## References
- {Reading assignment, textbook chapter, link to recording}

## Created
{YYYY-MM-DD}
\`\`\`

### Updating existing lecture notes

If the user wants to update or improve existing lecture notes:
1. Read the note
2. Check if the cue column has real questions (not just keywords)
3. If cues are weak, rewrite them as full questions (see Phase 3 above)
4. Check if the summary exists — if not, generate it
5. Check if the note has been reviewed — if not, set up a review schedule
6. Process through content extraction if not already done

## Course-Type-Specific Guidance

### STEM (math, physics, engineering, comp sci)
- **Capture:** Definitions → Theorems → Proofs → Examples. The example is often the most valuable part.
- **Review:** Do closed-book problem-solving, not re-reading notes. Use the cue column for formula recall.
- **Template focus:** Formulas section, worked examples, common pitfalls.
- **Tip:** Copy one representative problem per concept into your notes with the key insight highlighted.

### Humanities (history, literature, philosophy)
- **Capture:** Thesis/argument → Evidence/quotes → Counterarguments → Your critique.
- **Review:** Restate the main claim in your own words. Connect across lectures.
- **Template focus:** Interpretive claims, supporting evidence, connections to other texts.
- **Tip:** Write the lecture's central question at the top. Everything else is an answer to that question.

### Social Sciences (psychology, economics, sociology)
- **Capture:** Theory → Mechanism → Evidence (study/experiment) → Implications.
- **Review:** Explain the theory without looking. Then describe the experiment that supports it.
- **Template focus:** Theories with key authors, experimental evidence, real-world applications.
- **Tip:** Charting method (table format) works well for comparing theories or studies.

### Medical / Life Sciences (biology, medicine, anatomy)
- **Capture:** System/Structure → Function → Mechanism → Pathology/Clinical relevance.
- **Review:** Draw diagrams from memory. Label structures. Explain pathways step by step.
- **Template focus:** Diagrams, pathways, mnemonics, clinical correlations.
- **Tip:** Use the mind-map skill for physiological pathways. Space repetition is critical here.

## Common Problems & Fixes

| Problem | Fix |
|---------|-----|
| "I can't keep up during lecture" | Stop writing, listen, write key terms only. Fill in from slides/recording after. |
| "My cue column has keywords, not questions" | Rewrite each keyword as a question. "Photosynthesis" → "What are the inputs and outputs of photosynthesis?" |
| "I never review my notes" | Start with 5-minute same-day review. That's it. Build from there. |
| "My notes are just a transcript" | Next lecture, force yourself to write half as much. Process + paraphrase, don't copy. |
| "I don't know what's important" | Listen for repetition, board-writing, emphasis words ("crucially", "importantly"), and exam mentions. |
| "I forget to process within 24h" | Set a recurring calendar reminder: "Process [course] notes" for 30 min after each lecture. |
| "Notes don't help for problem-based exams" | Add a "Practice Problems" section. Convert problems into cue questions. Do them closed-book. |
| "I spend too long making notes perfect" | Stop. Notes are study tools, not art. 80% is enough. Move to review phase. |

## When to Use Other Skills

| Situation | Skill to load |
|---|---|
| Generate flashcards from lecture material | \`loadSkill("auto-flashcards")\` |
| Review flashcards on a spaced schedule | \`loadSkill("study-workflow")\` |
| Create a revision guide for exam prep | \`loadSkill("revision-guide")\` |
| Get quizzed on lecture content | \`loadSkill("interactive-quiz")\` |
| Create a concept map linking ideas | \`loadSkill("mind-map")\` |
| Deep research on a lecture topic | \`loadSkill("deep-research")\` |
| Navigate to a lecture note or folder | \`loadSkill("app-navigation")\` |
| Process a lecture transcript | \`loadCapability("note-creation")\` |
| Organise courses and folders | \`loadSkill("course-management")\` |

## Important Notes

- The ScholarOS note creation agent (\`note-creation\`) handles automated concept extraction from lecture transcripts. This skill provides the HUMAN workflow for live lectures.
- Cornell format is the default recommendation, but the charting method is better for comparison-heavy courses and mind maps are better for systems/process courses. Adapt to the material.
- Review is more important than capture. A so-so note reviewed on schedule beats a perfect note never reviewed.
- The cue column is the most important part of the system. It turns notes from a passive record into an active recall tool. Spend time here.
- If the user is overwhelmed, simplify: "Let's just do Phase 3 (fill cues + write summary) for today's lecture. That's 15 minutes. Then we'll set up the review schedule tomorrow."
- Gen Z students prefer bullet points, structured formats, and AI-assisted tools. Lean into ScholarOS's AI capabilities (cue question generation, summary generation, flashcard conversion) to reduce friction.
- The 1/7/30/90 review schedule is the evidence-based sweet spot for long-term retention. Fewer reviews = forgetting. More reviews = diminishing returns.
`;
