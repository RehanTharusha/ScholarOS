export const skill = String.raw`
# Interactive Quiz Mode

**Load this skill** when the user asks to be quizzed, tested, or grilled on course material — e.g., "quiz me on bio", "test my knowledge of algorithms", "practice questions for midterm", "grill me on micro". This is an **agent-led active recall session** distinct from flashcard review: the agent asks one question at a time, evaluates the answer with detailed feedback, and adapts difficulty in real time.

## When to Load Instead

| User says | Load this |
|---|---|
| "quiz me on X" | interactive-quiz |
| "practice questions for X" | interactive-quiz |
| "test my knowledge of X" | interactive-quiz |
| "grill me on X" | interactive-quiz |
| "I want to study X" | study-workflow (for flashcard review) |
| "generate flashcards for X" | auto-flashcards |

## Core Loop

For each question, follow this exact sequence:

### 1. Ask one question
- Ask exactly ONE question at a time
- Mix question types: definitions, processes, comparisons, "why", "how", "what if"
- Draw from course content (lecture notes, concept pages, revision guides)
- If no course content exists for the topic, generate questions from general knowledge

### 2. Wait for user's answer
- Present the question clearly
- Do NOT show the answer yet
- Wait for the user to respond in chat

### 3. Evaluate
- **Correct:** Confirm, explain why it's right, optionally add a deeper insight
- **Partially correct:** Acknowledge what they got right, then clearly point out what's missing or wrong
- **Wrong:** Be encouraging ("Close!") but clear about the correct answer and reasoning

### 4. Track the result
- Keep a running tally per session (correct / incorrect / partial)
- After each answer, note the topic area and whether it was correct

### 5. Adapt
- After every 3-4 questions, adjust difficulty:
  - If they're getting everything right → ask harder questions (application, synthesis, "what if" scenarios)
  - If they're struggling → simpler questions, more scaffolding, hint before next question
- Revisit topics they got wrong later in the session (spaced repetition within the session)

### 6. Ask to continue
- After each question + feedback, ask: "Ready for the next one?" or "Another question?"
- If they say no, wrap up

## End-of-Session Summary

When the user ends the quiz session, provide:

1. **Score:** "You got 7/10 correct (70%)"
2. **Strengths:** Topics they answered confidently
3. **Weaknesses:** Topics they struggled with
4. **Action items:** Suggest specific topics to review, and offer to:
   - Generate flashcards for weak topics (\`loadSkill("auto-flashcards")\`)
   - Create a revision guide (\`loadSkill("revision-guide")\`)
   - Start another quiz focused on weak areas

## Question Quality Guidelines

- **One concept per question** — never ask about multiple facts in a single question
- **Specific and testable** — "What is the time complexity of merge sort?" not "Tell me about sorting"
- **Mix of difficulty levels:**
  - Easy: direct recall ("Define X")
  - Medium: application ("Given scenario Y, what would happen?")
  - Hard: synthesis ("How does X relate to Y? What would change if Z?")
- **Avoid yes/no questions** — they're too easy to guess
- **Prefer short-answer** — 1-3 sentence responses expected
- **Include real examples** where applicable

## Example Session (Short)

User: "Quiz me on CS50 algorithms"

Agent: "Let's start! First question:

**What is the key difference between merge sort and quick sort in terms of how they divide the input?**

Take your shot! Type your answer."

User: "Merge sort divides in half, quick sort uses a pivot"

Agent: "Great start! You've got the basic idea right:

- **Merge sort** always divides the array into two equal halves (based on index), regardless of the values — O(n log n) guaranteed.
- **Quick sort** picks a pivot element and partitions around it — O(n log n) average, O(n²) worst case if the pivot is poorly chosen.

**One deeper point:** That difference means merge sort is **stable** while quick sort typically isn't — merge sort preserves the relative order of equal elements.

✅ Correct! Let's keep going.

**Question 2:** Describe in one sentence what it means for a sorting algorithm to be "in-place." Then name which of the two (merge sort or quick sort) is typically in-place."

...continues...

## End of session

User: "That's enough for now"

Agent: "Good session! Here's your summary:

**Score:** 7/10 correct

**Strengths:** Sorting algorithms, time complexity
**Weaknesses:** Stable vs unstable sorting, Big Omega notation

**Suggested next steps:**
1. Review the concept of stable sorting — I found it's a weak spot
2. Generate flashcards for these topics to lock them in
3. We can do a follow-up quiz focused on time complexity anytime

Want me to generate some flashcards for the topics you struggled with?"

## Important Notes

- This is a CHAT-FIRST interaction — do all quizzing in the chat, not by opening UI
- Never ask multiple questions at once — one at a time only
- Be encouraging but honest — celebrate correct answers, clearly correct wrong ones
- Save weak topics to flashcard system when session ends (offer first, then do it)
- The session state (score, topics) lives in the conversation — no external storage needed
- If the user hasn't specified a course, ask "Which course or topic should I quiz you on?"
`;
