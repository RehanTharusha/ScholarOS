import type {
  AssignmentRubric,
  RubricCriterion,
  GradingLevel,
} from "@x/shared/dist/academic.js";

export interface ParsedRubric {
  title: string;
  criteria: RubricCriterion[];
  totalPoints: number;
}

export function parseRubricMarkdown(markdown: string): ParsedRubric {
  const lines = markdown.split("\n");
  const criteria: RubricCriterion[] = [];
  let title = "Assignment Rubric";

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch && title === "Assignment Rubric") {
      title = headingMatch[1].trim();
      continue;
    }

    const bulletMatch = line.match(/^[-*\d.]+\s*(.+)$/);
    if (!bulletMatch) {
      continue;
    }

    const content = bulletMatch[1].trim();
    if (!content) {
      continue;
    }

    const scoreMatch = content.match(/\((\d+)\s*points?\)/i);
    const maxPoints = scoreMatch ? Number(scoreMatch[1]) : 5;
    const criterionName = content.replace(/\((\d+)\s*points?\)/i, "").trim();

    criteria.push({
      id: criterionName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: criterionName,
      description: content,
      maxPoints,
      levels: buildDefaultLevels(maxPoints),
    });
  }

  const totalPoints = criteria.reduce(
    (sum, criterion) => sum + criterion.maxPoints,
    0,
  );
  return { title, criteria, totalPoints };
}

export function rubricToAssignmentRubric(
  parsedRubric: ParsedRubric,
): AssignmentRubric {
  return {
    id: parsedRubric.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: parsedRubric.title,
    criteria: parsedRubric.criteria,
    totalPoints: parsedRubric.totalPoints,
  };
}

function buildDefaultLevels(maxPoints: number): GradingLevel[] {
  return [
    {
      score: maxPoints,
      label: "Excellent",
      description: "Meets the criterion with strong evidence and clarity.",
    },
    {
      score: Math.max(1, Math.round(maxPoints * 0.75)),
      label: "Good",
      description: "Mostly meets the criterion with minor gaps.",
    },
    {
      score: Math.max(1, Math.round(maxPoints * 0.5)),
      label: "Developing",
      description: "Partially meets the criterion.",
    },
    {
      score: 0,
      label: "Needs work",
      description: "Does not yet satisfy the criterion.",
    },
  ];
}
