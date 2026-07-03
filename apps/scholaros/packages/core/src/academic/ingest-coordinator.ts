/**
 * Ingest coordinator — orchestrates document ingestion workflow
 * Handles extraction → analysis (two-step CoT) → generation → commit
 *
 * Adapted from nashsu/llm_wiki two-step CoT pattern (GPL v3):
 *   Step 1 (Analysis LLM): extract entities, concepts, connections, contradictions
 *   Step 2 (Generation LLM): generate wiki pages with ---FILE: <path>--- blocks
 */

import { PDFIngester, IngestResult } from "./pdf-ingester.js";
import { ContradictionDetector } from "./contradiction-detector.js";
import type { Contradiction as AcademicContradiction } from "@scholaros/shared/dist/academic.js";
import path from "path";
import { promises as fs } from "fs";
import { ReviewStore } from "../knowledge/review-store.js";
import { IngestCache } from "../knowledge/ingest-cache.js";
import { IngestQueue } from "../knowledge/ingest-queue.js";
import { parseFileBlocks } from "../knowledge/file-block-parser.js";
import { parseReviewBlocks } from "../knowledge/review-parser.js";

function sanitize(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

interface LlmAgent {
  generate(prompt: string): Promise<{ text: string }>;
}

export interface IngestWorkflowOptions {
  courseId: string;
  courseCode?: string;
  semester?: string;
  autoTag?: boolean;
  checkContradictions?: boolean;
  topicSuggestion?: string;
}

export interface IngestPreview {
  results: IngestResult[];
  suggestedConcepts: SuggestedConcept[];
  potentialContradictions?: Contradiction[];
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
  confidence: number;
}

export interface CommitOptions {
  createConceptPages: boolean;
  markContradictions: boolean;
  autoResolution?: "merged" | "superseded" | "both-valid";
}

export interface TwoStepCoTResult {
  pagesCreated: string[];
  reviewsCreated: number;
  skipped: boolean;
}

export class IngestCoordinator {
  private pdfIngester: PDFIngester;
  private contradictionDetector: ContradictionDetector;
  private currentWorkflow?: IngestPreview;

  constructor(
    private vaultPath: string,
    private llmAgent: LlmAgent,
    private knowledgeGraph: unknown,
    private reviewStore?: ReviewStore,
    private cache?: IngestCache,
    private queue?: IngestQueue,
  ) {
    this.pdfIngester = new PDFIngester(vaultPath, llmAgent);
    this.contradictionDetector = new ContradictionDetector(llmAgent);
  }

  async extractPDFs(filepaths: string[]): Promise<IngestResult[]> {
    return this.pdfIngester.ingestBatch(filepaths, {
      courseId: "",
      autoTag: false,
      checkContradictions: false,
    });
  }

  async generatePreview(
    extractResults: IngestResult[],
    options: IngestWorkflowOptions,
  ): Promise<IngestPreview> {
    const suggestedConcepts: SuggestedConcept[] = [];

    for (const result of extractResults.filter((r) => r.success)) {
      const chunks = result.metadata.chunks ?? [];
      const chunkPreview =
        chunks.length > 0
          ? chunks
              .slice(0, 4)
              .map((chunk, index) => `Chunk ${index + 1}:\n${chunk}`)
              .join("\n\n")
          : result.metadata.extractedText.substring(0, 1200);

      const conceptPrompt = `
You are analyzing academic material for concept extraction.

Material: ${result.metadata.title || result.metadata.filename}
Authors: ${(result.metadata.authors || []).join(", ")}
Content preview:
${chunkPreview}

Chunk count: ${chunks.length}

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
      ],
      potentialContradictions,
      summary: {
        total: extractResults.length,
        successful: extractResults.filter((r) => r.success).length,
        failed: extractResults.filter((r) => !r.success).length,
      },
    };

    this.currentWorkflow = preview;
    return preview;
  }

  getCurrentPreview(): IngestPreview | undefined {
    return this.currentWorkflow;
  }

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

    if (
      options.markContradictions &&
      this.currentWorkflow.potentialContradictions
    ) {
      for (const contradiction of this.currentWorkflow
        .potentialContradictions) {
        try {
          if (this.reviewStore) {
            this.reviewStore.addItem({
              type: "contradiction",
              title: `${contradiction.claim1?.substring(0, 60)}… vs ${contradiction.claim2?.substring(0, 60)}…`,
              description: `Confidence: ${(contradiction.confidence * 100).toFixed(0)}%\n\n${contradiction.claim1}\n— ${contradiction.source1}\n\nvs\n\n${contradiction.claim2}\n— ${contradiction.source2}`,
              sourcePath: contradiction.source1,
              affectedPages: [contradiction.source1, contradiction.source2].filter(Boolean),
              searchQueries: [contradiction.claim1, contradiction.claim2].filter(Boolean),
              options: [
                { label: "Both Valid", action: "both-valid" },
                { label: "Superseded", action: "superseded" },
                { label: "Merged", action: "merged" },
              ],
            })
          }
        } catch (e) {
          errors.push(`Failed to mark contradiction: ${e}`);
        }
      }
    }

    this.currentWorkflow = undefined;
    return { created, errors };
  }

  /**
   * Two-step CoT pipeline (LLM Wiki pattern):
   *   1. Analysis LLM — extract concepts, connections, contradictions
   *   2. Generation LLM — produce wiki pages as ---FILE:--- blocks
   *
   * Supports PDF, markdown, and plain text sources.
   * Skips unchanged files via SHA256 cache.
   * Emits progress events through the ingest queue.
   */
  async processWithTwoStepCoT(
    filepath: string,
    options: IngestWorkflowOptions & { queueItemId?: string },
  ): Promise<TwoStepCoTResult> {
    const emitProgress = async (progress: number, stage: string) => {
      if (this.queue && options.queueItemId) {
        await this.queue.updateProgress(options.queueItemId, progress, stage);
      }
    };

    await emitProgress(5, "extracting");

    if (this.cache) {
      await this.cache.load();
      const unchanged = await this.cache.isUnchanged(filepath);
      if (unchanged) {
        return { pagesCreated: [], reviewsCreated: 0, skipped: true };
      }
    }

    const ext = path.extname(filepath).toLowerCase();
    let extractedText: string;
    let fileName: string;

    if (ext === ".pdf") {
      const result = await this.pdfIngester.ingestPDF(filepath, {
        courseId: options.courseId,
        autoTag: options.autoTag,
        checkContradictions: false,
      });
      if (!result.success) {
        throw new Error(`Failed to extract PDF: ${result.errors?.join(", ")}`);
      }
      extractedText = result.metadata.extractedText;
      fileName = result.metadata.filename;
    } else if (ext === ".md" || ext === ".txt") {
      extractedText = await fs.readFile(filepath, "utf-8");
      fileName = path.basename(filepath);
    } else {
      extractedText = (await fs.readFile(filepath, "utf-8").catch(() => "")) || `[Binary file: ${path.basename(filepath)}]`;
      fileName = path.basename(filepath);
    }

    await emitProgress(25, "analyzing");

    const courseContext = options.courseCode
      ? `Course code: ${options.courseCode}\nSemester: ${options.semester || "N/A"}\nCourse ID: ${options.courseId}`
      : "";

    const contentPreview = extractedText.substring(0, 8000);

    const analysisResponse = await this.llmAgent.generate(
      this.buildAnalysisPrompt(fileName, courseContext, contentPreview),
    );

    let analysis: {
      concepts: Array<{
        title: string;
        description: string;
        difficulty: string;
        prerequisites: string[];
        relatedConcepts: string[];
      }>;
      connections: Array<{
        source: string;
        target: string;
        type: string;
      }>;
      contradictions: Array<{
        claim1: string;
        claim2: string;
        explanation: string;
      }>;
      tags: string[];
      suggestedCourse: string;
    };

    try {
      analysis = JSON.parse(analysisResponse.text);
    } catch {
      analysis = {
        concepts: [],
        connections: [],
        contradictions: [],
        tags: [],
        suggestedCourse: "",
      };
    }

    await emitProgress(50, "generating");

    const courseName =
      options.courseCode || analysis.suggestedCourse || "General";

    const semester = options.semester || "unknown";

    const generationResponse = await this.llmAgent.generate(
      this.buildGenerationPrompt(
        fileName,
        courseName,
        semester,
        courseContext,
        analysis,
      ),
    );

    await emitProgress(75, "writing");

    const fileBlocks = parseFileBlocks(generationResponse.text);
    const pagesCreated: string[] = [];

    for (const block of fileBlocks) {
      const absPath = path.join(this.vaultPath, block.path);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, block.content, "utf-8");
      pagesCreated.push(block.path);
    }

    await emitProgress(85, "extracting reviews");

    let reviewsCreated = 0;
    if (this.reviewStore) {
      const reviewItems = parseReviewBlocks(generationResponse.text, filepath);
      if (reviewItems.length > 0) {
        this.reviewStore.addItems(reviewItems);
        reviewsCreated = reviewItems.length;
      }

      for (const c of analysis.contradictions) {
        this.reviewStore.addItem({
          type: "contradiction",
          title:
            c.explanation || "Contradiction detected in source material",
          description: `${c.claim1}\n\nvs\n\n${c.claim2}`,
          sourcePath: filepath,
          affectedPages: pagesCreated,
          options: [
            { label: "Keep Both", action: "keep-both" },
            { label: "Superseded", action: "superseded" },
            { label: "Needs Investigation", action: "investigate" },
          ],
        });
      }
      reviewsCreated += analysis.contradictions.length;
    }

    await emitProgress(100, "completed");

    if (this.cache) {
      await this.cache.markChanged(filepath);
    }

    return { pagesCreated, reviewsCreated, skipped: false };
  }

  private buildAnalysisPrompt(
    fileName: string,
    courseContext: string,
    contentPreview: string,
  ): string {
    return `You are analyzing academic material for a student's knowledge wiki.

Source material: ${fileName}
${courseContext}

Content:
${contentPreview}

Analyze this material and extract:
1. KEY CONCEPTS — the main academic concepts/topics (3-8). For each include:
   - Title
   - Brief description (1-2 sentences)
   - Difficulty level (beginner | intermediate | advanced)
   - Prerequisite concepts
   - Related topics

2. CONNECTIONS — how the concepts relate to each other:
   - Source concept
   - Target concept
   - Relationship type (depends-on | extends | contradicts | example-of | part-of)

3. CONTRADICTIONS — any claims that contradict each other or well-known facts

4. COURSE CONTEXT — which course/module this material belongs to, suggested tags

Return as structured JSON:
{
  "concepts": [{ "title": "string", "description": "string", "difficulty": "beginner|intermediate|advanced", "prerequisites": ["string"], "relatedConcepts": ["string"] }],
  "connections": [{ "source": "string", "target": "string", "type": "string" }],
  "contradictions": [{ "claim1": "string", "claim2": "string", "explanation": "string" }],
  "tags": ["string"],
  "suggestedCourse": "string"
}`;
  }

  private buildGenerationPrompt(
    fileName: string,
    courseName: string,
    semester: string,
    courseContext: string,
    analysis: {
      concepts: Array<{
        title: string;
        description: string;
        difficulty: string;
        prerequisites: string[];
        relatedConcepts: string[];
      }>;
      connections: Array<{
        source: string;
        target: string;
        type: string;
      }>;
      contradictions: Array<{
        claim1: string;
        claim2: string;
        explanation: string;
      }>;
      tags: string[];
      suggestedCourse: string;
    },
  ): string {
    return `You are generating wiki pages for a student's academic knowledge base.

Course: ${courseName}
${courseContext}
Source file: ${fileName}

Based on this analysis of the source material:

Concepts:
${JSON.stringify(analysis.concepts, null, 2)}

Connections:
${JSON.stringify(analysis.connections, null, 2)}

Contradictions:
${JSON.stringify(analysis.contradictions, null, 2)}

Tags: ${analysis.tags.join(", ")}

Generate markdown wiki pages for each concept. Use this format for each page:

---FILE: courses/${sanitize(courseName)}/concepts/{concept-title}.md---
---
title: "{Concept Title}"
type: "concept"
course: "${courseName}"
semester: "${semester}"
difficulty: "{difficulty}"
tags: []
prerequisites: []
created: "${new Date().toISOString()}"
---

{description}

## Key Points

- [Key point 1]
- [Key point 2]

## Connections

- Related to: [[{related concept}]]

## Resources

- Source: [[raw/${fileName}]]

---END FILE---

For any contradictions found, include review blocks:

---REVIEW: contradiction | {title} ---
{explanation}
OPTIONS: Keep Both | Superseded | Needs Investigation
---END REVIEW---

Use wiki links [[concept-name]] for cross-references. Generate complete, detailed pages with the academic frontmatter shown above.`;
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

`;

    return frontmatter + "\n" + content;
  }
}
