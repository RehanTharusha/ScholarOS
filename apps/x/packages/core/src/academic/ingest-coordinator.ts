/**
 * Ingest coordinator - orchestrates PDF ingestion workflow
 * Handles extraction → parsing → preview → confirmation → commit to wiki
 */

import { PDFIngester, IngestResult } from "./pdf-ingester.js";
import { FlashcardGenerator, GeneratedCard } from "./flashcard-generator.js";
import { ContradictionDetector } from "./contradiction-detector.js";
import { CardStorage } from "./fsrs-scheduler.js";
import type { Contradiction as AcademicContradiction } from "@x/shared/dist/academic.js";
import type { FlashCard } from "@x/shared/dist/academic.js";
import path from "path";
import { promises as fs } from "fs";

/**
 * Sanitize a string for use as a filesystem folder or file name.
 * Removes or replaces characters that are not safe for filenames.
 */
function sanitize(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-") // Replace unsafe characters with hyphens
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

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
  private contradictionDetector: ContradictionDetector;
  private flashcardStorage: CardStorage;
  private currentWorkflow?: IngestPreview;

  constructor(
    private vaultPath: string,
    private llmAgent: LlmAgent,
    private knowledgeGraph: unknown, // Reference to knowledge graph for wiki integration
    cardStorage?: CardStorage,
  ) {
    this.pdfIngester = new PDFIngester(vaultPath, llmAgent);
    this.cardGenerator = new FlashcardGenerator(llmAgent);
    this.contradictionDetector = new ContradictionDetector(llmAgent);
    this.flashcardStorage = cardStorage ?? new CardStorage(vaultPath);
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
      const detected = await this.contradictionDetector.detect(
        extractResults
          .filter((result) => result.success)
          .map((result) => ({
            name: result.metadata.title || result.metadata.filename,
            content: result.metadata.extractedText,
          })),
      );
      potentialContradictions = detected.map(this.fromAcademicContradiction);
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
            "courses",
            sanitize(courseName),
            "concepts",
            `${sanitize(concept.title)}.md`,
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

    // Store flashcards in per-course storage (follows LLM Wiki philosophy)
    if (options.generateFlashcards && this.currentWorkflow.generatedCards) {
      try {
        const now = new Date().toISOString();
        const flashcards: FlashCard[] = this.currentWorkflow.generatedCards.map(
          (card: GeneratedCard, idx: number) => ({
            id: `${courseId}-${Date.now()}-${idx}`,
            front: card.front,
            back: card.back,
            conceptId:
              this.currentWorkflow!.suggestedConcepts[0]?.title || "general",
            courseId,
            created: now,
            reviewed: [],
            difficulty: card.difficulty || "normal",
          }),
        );

        await this.flashcardStorage.addCards(flashcards);
        created += flashcards.length;
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

  private fromAcademicContradiction(
    contradiction: AcademicContradiction,
  ): Contradiction {
    return {
      claim1: contradiction.claim1,
      source1: contradiction.source1,
      claim2: contradiction.claim2,
      source2: contradiction.source2,
      confidence: contradiction.confidence,
    };
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
