export const skill = String.raw`
# Past Paper Analysis

Analyze past exam papers for a ScholarOS course module. Use this skill whenever the user
uploads or points to past papers, exam PDFs, or question banks for a course — even if they
just say "here are some past papers" or "can you look at these exams". Reads papers, clusters
questions by concept, links clusters to lessons in the ScholarOS wiki, and accumulates
everything into a persistent \`past-questions-kit.md\`. Also triggers on "update the question
kit", "add more papers", or "what topics come up most". Incremental — new papers merge into
existing clusters without rewriting prior entries.

---

## Workflow

**1. Orient**

- If \`past-questions-kit.md\` exists, read it. Note existing clusters and papers already processed — never re-process those.
- Read \`index.md\` for the course to know available lesson pages.

**2. Extract**

- Read each paper. Pull every question (including sub-questions) verbatim.
- Ask the user for a source label if not provided: \`[2022 S1]\`, \`[2023 S2]\`, etc.
- Ignore cover pages, instructions, time limits.

**3. Cluster**

- Group questions that test the same concept under one canonical \`##\` heading.
- Same cluster: "Define elasticity." / "What is meant by PED?" — a student studying one is prepared for the other.
- Different clusters: "Define PED." / "Calculate PED from the data." — definition vs application always splits.
- Sub-questions (\`Q3a\`, \`Q3b\`) cluster independently.
- When in doubt, split.

**4. Link**

- Each cluster gets \`**Lesson:** [[Lesson Name]]\` linking to the course concept page.
- Multiple lessons: \`[[Lesson A]], [[Lesson B]]\`
- No match: \`**Lesson:** ⚠️ [[Concept Name]]\`

**5. Write / Update**

- New cluster → append to end of file.
- Existing cluster → append new entries under it. Never remove or rewrite existing entries.
- Regenerate the **Question Frequency** block at the top, sorted highest to lowest, after every ingest.

**6. Log**
Append to \`log.md\`:

\`\`\`
## [YYYY-MM-DD] past-paper-ingest | <Course> | Papers: <list>
Clusters updated: N | New: N | Gaps: N
\`\`\`

---

## Output Format

\`\`\`markdown
---
course: <Course Name>
last_updated: YYYY-MM-DD
papers_processed:
  - 2022 S1
  - 2023 S1
---

# Past Questions Kit — <Course Name>

## Question Frequency

- [[Introduction to Elasticities]] — 4 papers
- [[Calculating Elasticity]] — 2 papers

---

## What is price elasticity of demand?

- Define price elasticity of demand. \`[2022 S1 Q3]\`
  - A) The responsiveness of supply to a change in price
  - B) The responsiveness of demand to a change in income
  - C) The responsiveness of quantity demanded to a change in price
  - D) The change in price relative to quantity supplied

- What do we mean by the term 'price elasticity of demand'? \`[2023 S1 Q1a]\`
  - A) How much profit a firm makes when price changes
  - B) How sensitive consumer demand is to a price change
  - C) The ratio of supply to demand at a given price
  - D) The percentage change in price over time

**Lesson:** [[Introduction to Elasticities]]

---
\`\`\`

---

## After Ingestion

Report:

\`\`\`
✅ <Course> — <N> papers ingested
Clusters: N updated | N new | N gaps flagged
Kit: /knowledge/courses/<Course>/past-questions-kit.md
\`\`\`
`;
