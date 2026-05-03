/**
 * PDF ingest pipeline for academic materials
 * Handles PDF metadata extraction, course assignment, and wiki integration
 */

import { promises as fs } from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

interface LlmAgent {
  generate(prompt: string): Promise<{ text: string }>;
}

interface PdfParseResult {
  text: string;
  numpages: number;
  info?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PDFMetadata {
  filename: string;
  filepath: string;
  title?: string;
  authors?: string[];
  abstract?: string;
  publication_year?: number;
  doi?: string;
  url?: string;
  extractedText: string;
  pageCount: number;
  fileSize: number;
}

export interface IngestOptions {
  courseId: string;
  topicId?: string;
  autoGenerateCards?: boolean;
  autoTag?: boolean;
  checkContradictions?: boolean;
}

export interface IngestResult {
  success: boolean;
  filepath: string;
  metadata: PDFMetadata;
  wikiPagesCreated?: string[];
  cardsGenerated?: number;
  errors?: string[];
}

/**
 * Main PDF ingester class
 */
export class PDFIngester {
  private pdfExtractor: PDFExtractor;
  private metadataParser: MetadataParser;

  constructor(
    private vaultPath: string,
    private llmAgent: LlmAgent, // LLM agent for intelligent parsing
  ) {
    this.pdfExtractor = new PDFExtractor();
    this.metadataParser = new MetadataParser();
  }

  /**
   * Ingest a single PDF file
   */
  async ingestPDF(
    filepath: string,
    options: IngestOptions,
  ): Promise<IngestResult> {
    try {
      void options;
      // Extract PDF content and metadata
      const pdfContent = await this.pdfExtractor.extract(filepath);

      // Parse metadata from PDF
      const metadata = await this.metadataParser.parse(pdfContent, filepath);

      // Use LLM to extract key concepts and suggestions
      const suggestions = await this.generateIngestSuggestions(
        metadata,
        options,
      );

      return {
        success: true,
        filepath,
        metadata,
        ...suggestions,
      };
    } catch (error) {
      return {
        success: false,
        filepath,
        metadata: {
          filename: path.basename(filepath),
          filepath,
          extractedText: "",
          pageCount: 0,
          fileSize: 0,
        },
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Batch ingest multiple PDFs
   */
  async ingestBatch(
    filepaths: string[],
    options: IngestOptions,
  ): Promise<IngestResult[]> {
    return Promise.all(filepaths.map((fp) => this.ingestPDF(fp, options)));
  }

  /**
   * Generate LLM-powered suggestions for ingest
   */
  private async generateIngestSuggestions(
    metadata: PDFMetadata,
    options: IngestOptions,
  ) {
    void options;
    const prompt = `
You are an academic AI assistant processing a new study material.

Material: ${metadata.filename}
Title: ${metadata.title || "Unknown"}
Authors: ${(metadata.authors || []).join(", ") || "Unknown"}
Abstract: ${metadata.abstract || "Not available"}

Suggest:
1. 3-5 key concepts/topics to create wiki pages for
2. Best naming convention for each concept page
3. Related concepts that might already exist
4. Suggested difficulty level (beginner/intermediate/advanced)
5. Recommended flashcards (3-5 Q&A pairs)

Format as JSON.
    `;

    const response = await this.llmAgent.generate(prompt);
    return JSON.parse(response.text);
  }
}

/**
 * PDF text extraction (integrates with existing pdf-parse)
 */
class PDFExtractor {
  async extract(filepath: string): Promise<{
    text: string;
    pageCount: number;
    metadata: Record<string, unknown>;
  }> {
    const fileBuffer = await fs.readFile(filepath);

    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo();
    await parser.destroy();

    const data = {
      text: textResult.text,
      numpages: textResult.total,
      info: infoResult.info,
    } as PdfParseResult;

    return {
      text: data.text,
      pageCount: data.numpages,
      metadata: data.info ?? {},
    };
  }
}

/**
 * PDF metadata parser (title, authors, abstract, DOI)
 */
class MetadataParser {
  async parse(
    pdfContent: {
      text: string;
      metadata?: Record<string, unknown>;
      pageCount: number;
    },
    filepath: string,
  ): Promise<PDFMetadata> {
    const fileStats = await fs.stat(filepath);

    // Extract metadata from PDF properties
    const title =
      (pdfContent.metadata?.Title as string | undefined) ||
      path.basename(filepath, ".pdf");
    let authors: string[] = [];
    let abstract: string | undefined;
    let doi: string | undefined;
    let publication_year: number | undefined;

    // Parse first page for common academic metadata patterns
    const firstPage = pdfContent.text.split("\n").slice(0, 50).join("\n");

    // DOI pattern: 10.xxxx/xxxxx
    const doiMatch = firstPage.match(/(?:doi|DOI)[:\s]*(10\.\d+\/[^\s]+)/);
    if (doiMatch) doi = doiMatch[1];

    // Year pattern: (19|20)\d{2}
    const yearMatch = firstPage.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) publication_year = parseInt(yearMatch[0]);

    // Try to extract authors from first few lines
    const authorPatterns = [
      /Author[s]?[:\s]+(.*?)(?:Abstract|ABSTRACT|Introduction|Date)/s,
      /^([A-Z][a-z]+\s+[A-Z][a-z\s]+),\s+([A-Z][a-z]+\s+[A-Z][a-z\s]+)/m,
    ];

    for (const pattern of authorPatterns) {
      const match = firstPage.match(pattern);
      if (match) {
        authors = match[1]
          .split(/[,;]/)
          .map((a) => a.trim())
          .filter((a) => a.length > 0)
          .slice(0, 5);
        break;
      }
    }

    return {
      filename: path.basename(filepath),
      filepath,
      title,
      authors: authors.length > 0 ? authors : undefined,
      abstract,
      publication_year,
      doi,
      extractedText: pdfContent.text,
      pageCount: pdfContent.pageCount,
      fileSize: fileStats.size,
    };
  }
}

/**
 * Ingest workflow coordinator
 */
export class IngestCoordinator {
  private ingester: PDFIngester;

  constructor(vaultPath: string, llmAgent: LlmAgent) {
    this.ingester = new PDFIngester(vaultPath, llmAgent);
  }

  /**
   * Full ingest workflow: upload → parse → preview → confirm → commit
   */
  async orchestrateWorkflow(filepaths: string[], options: IngestOptions) {
    // Step 1: Extract and parse
    const results = await this.ingester.ingestBatch(filepaths, options);

    // Step 2: Return for user preview
    return {
      results,
      summary: {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    };
  }
}
