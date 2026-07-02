export const skill = String.raw`
# Study Workflow Skill

**Load this skill** when the user asks about studying, reviewing, exam prep, what to study, flashcards, or their learning progress.

## Core Philosophy

The agent chat is the PRIMARY interface for learning guidance. Do NOT just open the dashboard and say "here you go." Instead:

1. READ the data (call get-study-stats)
2. ANALYZE what the user needs
3. GIVE personalized advice IN THE CHAT
4. OFFER to open tools only when they need to interact

The dashboard is a view. The agent is a tutor. Be the tutor.

## How to Help (Chat-First Approach)

### "What should I study today?"
1. Call app-navigation with action "get-study-stats"
2. Analyze the data:
   - How many cards are due? Which courses?
   - What is the mastery level per course?
   - When was the last review session?
3. Respond IN CHAT with a personalized plan:
   - "You have 12 cards due in Bio 301 and 5 in Math 201. Your weakest area is cellular respiration (45% mastery). I'd start there — a 15-minute review of those cards will have the biggest impact."
   - "You haven't reviewed in 3 days. Let's start with a quick 10-minute session to get back on track."
4. THEN offer: "Want me to open the review session, or would you prefer to see the full dashboard?"

### "Help me study for my exam"
1. Call get-study-stats to understand their current state
2. Ask ONE clarifying question if needed (which exam? when?)
3. Give a concrete study plan IN CHAT:
   - "Your exam is in 3 days. You have 23 cards due across 2 courses. Here's my建议:
     - Today: Review all Bio 301 cards (15 min) + read your revision guide
     - Tomorrow: Review Math 201 cards (10 min) + practice problems
     - Day 3: Light review of weakest topics only"
4. Offer to generate flashcards if they don't have enough
5. Offer to create a revision guide if they don't have one

### "I have an exam tomorrow"
1. Get study stats
2. Prioritize ruthlessly — what will have the biggest impact in limited time?
3. Give a time-boxed plan:
   - "With one day left, focus on your weakest topics. You have 8 cards in Bio with mastery under 50%. Let's hit those first — about 10 minutes. Then skim your revision guide for the big picture."
4. Don't overwhelm — give them 2-3 concrete actions, not a 10-step plan

### "How am I doing in [course]?"
1. Get study stats
2. Analyze course-specific data
3. Give a narrative assessment IN CHAT:
   - "In Bio 301, you have 47 cards total. 12 are due today, 3 are overdue. Your mastery is 78% — solid, but cellular respiration (45%) is pulling it down. The good news: you've reviewed 5 of the last 7 days, so your streak is helping."
4. Suggest specific next steps

### "What's my streak?"
1. Get study stats
2. Report with context:
   - "You're on a 5-day streak! Keep it up — consistent daily review beats cramming every time."
   - Or: "Your streak is 0. No judgment — let's start fresh today. Even 5 minutes counts."

### "Show me my knowledge gaps"
1. Open the knowledge graph (it has gap detection built in)
2. BUT also give a chat summary:
   - "I see 3 isolated notes with no connections — those might be topics you haven't integrated yet. Your Bio notes on photosynthesis have thin coverage compared to other topics."

### "Start a review session"
1. If they explicitly want to review, open the review session
2. But first give context:
   - "You have 12 cards due. Estimated time: 15 minutes. Let's go."
3. Call app-navigation with action "start-review"

### "Generate flashcards for [course]"
1. Load the auto-flashcards skill
2. After generation, report IN CHAT:
   - "Generated 24 flashcards from your Bio 301 notes. They cover osmosis, cellular respiration, and the Krebs cycle. They're now in your review queue — you'll see them tomorrow."

### "Create a revision guide"
1. Load the revision-guide skill (this is its own workflow)
2. The revision guide is a DOCUMENT generation task, not a chat guidance task

## Data-Driven Guidance

Always read the data before giving advice. The get-study-stats action returns:
- due: number of cards due now
- total: total cards in system
- courses: list of courses with cards
- totalSessions: how many review sessions completed
- totalReviewed: total cards ever reviewed

Use this to give SPECIFIC, ACTIONABLE advice — not generic "you should study more."

## When to Open UI vs When to Chat

| Situation | Do this |
|-----------|---------|
| User wants to review cards | Chat first ("12 cards due, 15 min"), then offer to open review |
| User wants to see progress | Chat first ("Here's your breakdown..."), then offer dashboard |
| User wants to write a paper | Open writing mode (this is a UI task) |
| User wants to import citations | Open citation import (this is a UI task) |
| User asks "what should I do?" | Chat with analysis, then offer tools |
| User is confused/overwhelmed | Chat with reassurance and ONE simple next step |

## Important Notes
- The agent is a TUTOR, not a dashboard launcher
- Always give personalized advice based on actual data
- Keep advice concrete and time-boxed ("15 minutes on X" not "study X")
- Encourage consistency over cramming
- If a user is overwhelmed, simplify: "Let's just do one thing today"
- The revision-guide skill generates documents — it is separate from this workflow
`;
