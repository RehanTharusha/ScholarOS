export const ACADEMIC_CATEGORIES = {
  "literature-review": {
    label: "Literature Review",
    description: "Synthesize research on a topic across multiple sources",
    reportPrompt: `Write a literature review with:
- Executive summary of the current state of knowledge
- Key themes organized into sections
- Research gaps and limitations
- Conclusion summarizing main takeaways
Use inline citations with source URLs.`,
    reportStructure: "Executive summary → Key themes → Research gaps → Conclusion",
  },
  "compare-contrast": {
    label: "Compare & Contrast",
    description: "Side-by-side analysis of two or more things",
    reportPrompt: `Write a comparison analysis with:
- Brief overview of each item
- Comparison table covering key dimensions
- Pros and cons of each
- Recommendation with reasoning
Use inline citations with source URLs.`,
    reportStructure: "Overview → Comparison table → Pros/cons → Recommendation",
  },
  "methodology": {
    label: "Methodology / Protocol",
    description: "Step-by-step guide for performing a technique or procedure",
    reportPrompt: `Write a methodology guide with:
- Background and context
- Required tools, materials, or prerequisites
- Step-by-step procedure
- Best practices and common pitfalls
Use inline citations with source URLs.`,
    reportStructure: "Background → Prerequisites → Step-by-step → Best practices",
  },
  "fact-check": {
    label: "Fact Check",
    description: "Verify the accuracy of a claim or statement",
    reportPrompt: `Write a fact-check report with:
- The claim being investigated
- Evidence supporting the claim
- Evidence contradicting the claim
- Overall verdict (supported / unsupported / mixed) with confidence level
Use inline citations with source URLs.`,
    reportStructure: "Claim → Evidence for → Evidence against → Verdict",
  },
  "concept-exploration": {
    label: "Concept Exploration",
    description: "Deep dive into a concept, its origins, and applications",
    reportPrompt: `Write a concept exploration with:
- Clear definition of the concept
- Historical origins and development
- Core theoretical framework
- Real-world applications
- Ongoing debates or open questions
Use inline citations with source URLs.`,
    reportStructure: "Definition → Origins → Theory → Applications → Debates",
  },
  "problem-solving": {
    label: "Problem Solving",
    description: "Research approaches and solutions to a specific problem",
    reportPrompt: `Write a problem-solving report with:
- Clear problem definition
- Possible approaches or solutions found in research
- Recommended approach with justification
- Implementation steps
Use inline citations with source URLs.`,
    reportStructure: "Problem → Approaches → Recommendation → Implementation",
  },
} as const;

export type AcademicCategoryId = keyof typeof ACADEMIC_CATEGORIES;

export function getCategoryLabel(category: AcademicCategoryId): string {
  return ACADEMIC_CATEGORIES[category].label;
}

export function getCategoryReportPrompt(category: AcademicCategoryId): string {
  return ACADEMIC_CATEGORIES[category].reportPrompt;
}
