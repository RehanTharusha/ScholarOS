/**
 * Ingest coordinator - orchestrates PDF ingestion workflow
 * Handles extraction → parsing → preview → confirmation → commit to wiki
 */

import { PDFIngester, IngestResult } from "./pdf-ingester.js";
import { FlashcardGenerator, GeneratedCard } from "./flashcard-generator.js";
import path from "path";
import { promises as fs } from "fs";

interface LlmAgent {
  generate(prompt: string): Promise<{ text: string }>;
}

export interface IngestWorkflowOptions {
  courseId: string;
  courseCode?: string;
  semester?: string;
  autoGenerateCards?: boolean;
  autoTag?: boolean;
  checkContradictions?: boolean;
  topicSuggestion?: string;
}

export interface IngestPreview {
  results: IngestResult[];
  suggestedConcepts: SuggestedConcept[];
  potentialContradictions?: Contradiction[];
  generatedCards?: GeneratedCard[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface SuggestedConcept {
  title: string;
  description: string;
  sources: string[];
  suggestedDifficulty: "beginner" | "intermediate" | "advanced";
  relatedConcepts?: string[];
  priority: "high" | "medium" | "low";
}

export interface Contradiction {
  claim1: string;
  source1: string;
  claim2: string;
  source2: string;
  confidence: number; // 0-1
}

export interface CommitOptions {
  createConceptPages: boolean;
  generateFlashcards: boolean;
  markContradictions: boolean;
  autoResolution?: "merged" | "superseded" | "both-valid";
}

/**
 * Main ingest coordinator
 */
export class IngestCoordinator {
  private pdfIngester: PDFIngester;
  private cardGenerator: FlashcardGenerator;
  private currentWorkflow?: IngestPreview;

  constructor(
    private vaultPath: string,
    private llmAgent: LlmAgent,
    private knowledgeGraph: unknown, // Reference to knowledge graph for wiki integration
  ) {
    this.pdfIngester = new PDFIngester(vaultPath, llmAgent);
    this.cardGenerator = new FlashcardGenerator(llmAgent);
  }

  /**
   * Step 1: Upload & Extract
   */
  async extractPDFs(filepaths: string[]): Promise<IngestResult[]> {
    return this.pdfIngester.ingestBatch(filepaths, {
      courseId: "", // Will be set in orchestrate
      autoGenerateCards: false,
      autoTag: false,
      checkContradictions: false,
    });
  }

  /**
   * Step 2: Generate preview with suggestions
   */
  async generatePreview(
    extractResults: IngestResult[],
    options: IngestWorkflowOptions,
  ): Promise<IngestPreview> {
    const suggestedConcepts: SuggestedConcept[] = [];
    let generatedCards: GeneratedCard[] = [];

    // Use LLM to suggest concepts from all extracted PDFs
    for (const result of extractResults.filter((r) => r.success)) {
      const conceptPrompt = `
You are analyzing academic material for concept extraction.

Material: ${result.metadata.title || result.metadata.filename}
Authors: ${(result.metadata.authors || []).join(", ")}
Content preview (first 500 chars):
${result.metadata.extractedText.substring(0, 500)}

Suggest 3-5 key concepts to create wiki pages for, along with:
- Title
- Brief description (1-2 sentences)
- Suggested difficulty
- Related concepts that might already exist

Format as JSON array.
      `;

      const response = await this.llmAgent.generate(conceptPrompt);
      try {
        const concepts = JSON.parse(response.text);
        suggestedConcepts.push(
          ...concepts.map(
            (c: {
              title: string;
              description: string;
              importance?: "high" | "medium" | "low";
              relatedConcepts?: string[];
              suggestedDifficulty?: "beginner" | "intermediate" | "advanced";
            }) => ({
              ...c,
              sources: [result.metadata.filename],
              priority: c.importance || "medium",
            }),
          ),
        );
      } catch (error) {
        console.error("Failed to parse concept suggestions:", error);
      }
    }

    // Optionally generate flashcards
    if (options.autoGenerateCards && suggestedConcepts.length > 0) {
      const prompt = `
From these topics:
${suggestedConcepts.map((c) => `- ${c.title}: ${c.description}`).join("\n")}

Generate 5-8 high-quality study flashcards. Return JSON array with {front, back, difficulty} fields.
      `;

      const response = await this.llmAgent.generate(prompt);
      try {
        generatedCards = JSON.parse(response.text);
      } catch (error) {
        console.error("Failed to parse generated cards:", error);
      }
    }

    // Check for contradictions if enabled
    let potentialContradictions: Contradiction[] | undefined;
    if (options.checkContradictions && extractResults.length > 1) {
      potentialContradictions = await this.detectContradictions(extractResults);
    }

    const preview: IngestPreview = {
      results: extractResults,
      suggestedConcepts: [
        ...new Map(suggestedConcepts.map((c) => [c.title, c])).values(),
      ], // Dedupe by title
      potentialContradictions,
      generatedCards: generatedCards.length > 0 ? generatedCards : undefined,
      summary: {
        total: extractResults.length,
        successful: extractResults.filter((r) => r.success).length,
        failed: extractResults.filter((r) => !r.success).length,
      },
    };

    this.currentWorkflow = preview;
    return preview;
  }

  /**
   * Step 3: User reviews preview (UI step - coordinator just stores state)
   */
  getCurrentPreview(): IngestPreview | undefined {
    return this.currentWorkflow;
  }

  /**
   * Step 4: Commit changes to wiki
   */
  async commit(
    courseId: string,
    courseName: string,
    semester: string,
    options: CommitOptions,
  ): Promise<{ created: number; errors: string[] }> {
    if (!this.currentWorkflow) {
      throw new Error("No current ingest workflow to commit");
    }

    let created = 0;
    const errors: string[] = [];

    // Create concept pages
    if (
      options.createConceptPages &&
      this.currentWorkflow.suggestedConcepts.length > 0
    ) {
      for (const concept of this.currentWorkflow.suggestedConcepts) {
        try {
          const wikiPage = this.formatConceptPage(
            concept,
            courseId,
            courseName,
            semester,
            this.currentWorkflow.results,
          );

          const conceptPath = path.join(
            this.vaultPath,
            "concepts",
            `${concept.title}.md`,
          );
          await fs.mkdir(path.dirname(conceptPath), { recursive: true });
          await fs.writeFile(conceptPath, wikiPage);
          created++;
        } catch (e) {
          errors.push(
            `Failed to create concept page for ${concept.title}: ${e}`,
          );
        }
      }
    }

    // Store flashcards (to database)
    if (options.generateFlashcards && this.currentWorkflow.generatedCards) {
      try {
        // TODO: integrate with flashcard storage
        // For now, just log
        console.log(
          `Generated ${this.currentWorkflow.generatedCards.length} flashcards`,
        );
      } catch (e) {
        errors.push(`Failed to store flashcards: ${e}`);
      }
    }

    // Handle contradictions
    if (
      options.markContradictions &&
      this.currentWorkflow.potentialContradictions
    ) {
      for (const contradiction of this.currentWorkflow
        .potentialContradictions) {
        try {
          void contradiction;
          // TODO: create contradiction note or flag in affected concept pages
        } catch (e) {
          errors.push(`Failed to mark contradiction: ${e}`);
        }
      }
    }

    // Clear workflow
    this.currentWorkflow = undefined;

    return { created, errors };
  }

  /**
   * Detect contradictions across sources
   */
  private async detectContradictions(
    results: IngestResult[],
  ): Promise<Contradiction[]> {
    if (results.length < 2) return [];

    const prompt = `
Analyze these academic sources for factual contradictions or disagreements:

${results
  .map(
    (r) =>
      `Source: ${r.metadata.title || r.metadata.filename}
Content (first 300 chars):
${r.metadata.extractedText.substring(0, 300)}`,
  )
  .join("\n\n")}

Identify 2-3 key factual or methodological disagreements, if any. Return JSON array with:
{
  "claim1": "statement from source 1",
  "source1": "source name",
  "claim2": "statement from source 2", 
  "source2": "source name",
  "confidence": 0.8,
  "type": "factual|methodological|interpretive"
}

If no contradictions, return empty array [].
    `;

    try {
      const response = await this.llmAgent.generate(prompt);
      const contradictions = JSON.parse(response.text);
      return contradictions || [];
    } catch (e) {
      console.error("Failed to detect contradictions:", e);
      return [];
    }
  }

  /**
   * Format a concept page with frontmatter
   */
  private formatConceptPage(
    concept: SuggestedConcept,
    courseId: string,
    courseName: string,
    semester: string,
    sources: IngestResult[],
  ): string {
    const sourcePaths = concept.sources.map((s) => {
      const source = sources.find((r) => r.metadata.filename === s);
      return source?.metadata.filepath || s;
    });

    const frontmatter = `---
title: "${concept.title}"
type: "concept"
course: "${courseName}"
courseId: "${courseId}"
semester: "${semester}"
difficulty: "${concept.suggestedDifficulty}"
sources:
${sourcePaths.map((s) => `  - "${s}"`).join("\n")}
relatedConcepts:
${(concept.relatedConcepts || []).map((c) => `  - "${c}"`).join("\n")}
created: "${new Date().toISOString()}"
tags: []
---
`;

    const content = `${concept.description}

## Key Points
- [Add main ideas here]

## Prerequisites
${concept.relatedConcepts ? concept.relatedConcepts.map((c) => `- [[${c}]]`).join("\n") : "- [None]"}

## Resources
- [Add relevant papers, videos, or external links]

## Review Schedule
- Flashcards due: [Auto-scheduled via FSRS]
`;

    return frontmatter + "\n" + content;
  }
}
