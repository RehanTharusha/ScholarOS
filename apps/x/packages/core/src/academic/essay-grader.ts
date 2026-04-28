import type {
  CitationError,
  EssayFeedback,
  EssayDraft,
} from "@x/shared/academic.js";
import {
  parseRubricMarkdown,
  rubricToAssignmentRubric,
} from "./rubric-parser.js";
import { verifyEssayCitations } from "./citation-verifier.js";

export interface EssayGradeInput {
  title: string;
  essayText: string;
  rubricMarkdown: string;
  sourceNames?: string[];
  wordGoal?: number;
}

export interface EssayGradeResult {
  draft: EssayDraft;
  feedback: EssayFeedback;
  citationErrors: CitationError[];
}

export class EssayGrader {
  gradeEssay(input: EssayGradeInput): EssayGradeResult {
    const parsedRubric = parseRubricMarkdown(input.rubricMarkdown);
    const rubric = rubricToAssignmentRubric(parsedRubric);
    const citations = verifyEssayCitations(
      input.essayText,
      input.sourceNames ?? [],
    );

    const criteriaScores = new Map<
      string,
      EssayFeedback["criteriaScores"] extends Map<string, infer T> ? T : never
    >();
    const revisionSuggestions: EssayFeedback["revisionSuggestions"] = [];
    const wordCount = input.essayText.split(/\s+/).filter(Boolean).length;
    const wordTarget = input.wordGoal ?? 1200;

    for (const criterion of rubric.criteria) {
      const keywordMatches = countKeywordMatches(
        input.essayText,
        criterion.name,
        criterion.description,
      );
      const citationBonus = citations.supportedClaims.length > 0 ? 1 : 0;
      const lengthBonus = wordCount >= wordTarget * 0.8 ? 1 : 0;
      const score = Math.max(
        0,
        Math.min(
          criterion.maxPoints,
          Math.round(
            ((keywordMatches + citationBonus + lengthBonus) / 3) *
              criterion.maxPoints,
          ),
        ),
      );
      const feedback =
        score >= criterion.maxPoints * 0.8
          ? "Strong coverage with clear support."
          : score >= criterion.maxPoints * 0.5
            ? "Adequate but could be more specific and evidence-driven."
            : "Needs more detail, clearer structure, and better support from readings.";

      criteriaScores.set(criterion.id, {
        criterion: criterion.name,
        score,
        feedback,
      });

      if (score < criterion.maxPoints * 0.5) {
        revisionSuggestions.push({
          location: criterion.name,
          issue: `Weak coverage for ${criterion.name}`,
          suggestion: `Add one concrete example, one citation, and a clearer explanation of the key idea.`,
          priority: "high",
        });
      }
    }

    const unsupportedCitationErrors: CitationError[] =
      citations.unsupportedClaims.map((claim) => ({
        claim,
        sourceLocation: "Essay body",
        verificationStatus: "unsupported",
        relatedWikiPages: input.sourceNames,
        evidence: "No citation marker was found next to the claim.",
      }));

    const overallScore =
      rubric.criteria.length > 0
        ? Math.round(
            (Array.from(criteriaScores.values()).reduce(
              (sum, item) => sum + item.score,
              0,
            ) /
              rubric.criteria.reduce(
                (sum, criterion) => sum + criterion.maxPoints,
                0,
              )) *
              100,
          )
        : 0;

    const feedback: EssayFeedback = {
      generatedAt: new Date().toISOString(),
      criteriaScores,
      overallScore,
      suggestions: [
        overallScore >= 80
          ? "Keep the structure and add one more level of evidence."
          : "Strengthen the thesis, add citations, and expand analysis.",
      ],
      revisionSuggestions,
    };

    const draft: EssayDraft = {
      id: `${slugify(input.title)}-${Date.now()}`,
      assignmentId: `${slugify(input.title)}-assignment`,
      title: input.title,
      content: input.essayText,
      status: "graded",
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      feedback,
      citationErrors: unsupportedCitationErrors,
    };

    return {
      draft,
      feedback,
      citationErrors: unsupportedCitationErrors,
    };
  }
}

function countKeywordMatches(text: string, ...phrases: string[]): number {
  const lower = text.toLowerCase();
  return phrases.reduce(
    (count, phrase) => count + (lower.includes(phrase.toLowerCase()) ? 1 : 0),
    0,
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
