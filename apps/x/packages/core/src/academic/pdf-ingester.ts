/**
 * PDF ingest pipeline for academic materials
 * Handles PDF metadata extraction, course assignment, and wiki integration
 */

import { promises as fs } from "fs";
import { existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { tmpdir } from "os";
import { PDFParse } from "pdf-parse";
import { fileURLToPath, pathToFileURL } from "url";
import { PdfEmbeddingStore, embedPdfChunks } from "./pdf-embeddings.js";

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
  chunks?: string[];
  pageCount: number;
  fileSize: number;
}

const PDF_CHUNK_TARGET = 1400;
const PDF_CHUNK_OVERLAP = 180;

const pdfIngesterDir = path.dirname(fileURLToPath(import.meta.url));

function resolvePdfWorkerSrc(): string | undefined {
  const candidates = [
    path.join(pdfIngesterDir, "pdf.worker.mjs"),
    path.join(pdfIngesterDir, "pdf.worker.min.mjs"),
    path.join(process.cwd(), "pdf.worker.mjs"),
    path.join(process.cwd(), "dist", "pdf.worker.mjs"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }

  return undefined;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function commandExists(command: string): boolean {
  try {
    execSync(`command -v ${shellQuote(command)}`, {
      stdio: "pipe",
      shell: "/bin/sh",
    });
    return true;
  } catch {
    return false;
  }
}

function runShellCommand(command: string): string | undefined {
  try {
    return execSync(command, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: "/bin/sh",
      maxBuffer: 20 * 1024 * 1024,
    }).toString("utf8");
  } catch {
    return undefined;
  }
}

function isLowTextPdf(text: string, pages: number): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  const threshold = Math.max(400, pages * 120);
  return normalized.length < threshold;
}

function splitPdfTextIntoChunks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const cleaned = current.trim();
    if (cleaned) {
      chunks.push(cleaned);
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if (current.length + paragraph.length + 2 <= PDF_CHUNK_TARGET) {
      current += `\n\n${paragraph}`;
      continue;
    }

    pushCurrent();

    if (paragraph.length <= PDF_CHUNK_TARGET) {
      current = paragraph;
      continue;
    }

    const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
    let sentenceBuffer = "";

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      if (!sentenceBuffer) {
        sentenceBuffer = trimmedSentence;
        continue;
      }

      if (
        sentenceBuffer.length + trimmedSentence.length + 1 <=
        PDF_CHUNK_TARGET
      ) {
        sentenceBuffer += ` ${trimmedSentence}`;
      } else {
        chunks.push(sentenceBuffer);
        const overlapTail = sentenceBuffer
          .slice(Math.max(0, sentenceBuffer.length - PDF_CHUNK_OVERLAP))
          .trim();
        sentenceBuffer = overlapTail
          ? `${overlapTail} ${trimmedSentence}`
          : trimmedSentence;
      }
    }

    current = sentenceBuffer;
  }

  pushCurrent();
  return chunks;
}

async function extractWithPdftotext(
  filepath: string,
): Promise<string | undefined> {
  if (!commandExists("pdftotext")) {
    return undefined;
  }

  const output = runShellCommand(
    `pdftotext -layout -enc UTF-8 -q ${shellQuote(filepath)} -`,
  );

  const cleaned = output?.trim();
  return cleaned ? cleaned : undefined;
}

async function extractWithOcrmypdf(
  filepath: string,
): Promise<string | undefined> {
  if (!commandExists("ocrmypdf")) {
    return undefined;
  }

  const tempDir = await fs.mkdtemp(path.join(tmpdir(), "rowboat-pdf-"));
  const outputPdf = path.join(tempDir, "ocr.pdf");

  try {
    const result = runShellCommand(
      `ocrmypdf --skip-text --quiet --output-type pdf ${shellQuote(filepath)} ${shellQuote(outputPdf)}`,
    );

    if (result === undefined) {
      return undefined;
    }

    const outputExists = await fs
      .access(outputPdf)
      .then(() => true)
      .catch(() => false);

    if (!outputExists) {
      return undefined;
    }

    const buffer = await fs.readFile(outputPdf);
    const pdfWorkerSrc = resolvePdfWorkerSrc();
    if (pdfWorkerSrc) {
      PDFParse.setWorker(pdfWorkerSrc);
    }

    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const textResult = await parser.getText();
      const cleaned = textResult.text.replace(/\s+/g, " ").trim();
      return cleaned ? textResult.text : undefined;
    } finally {
      await parser.destroy();
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
  embeddingIndexPath?: string;
  embeddedChunks?: number;
  embeddingProvider?: string;
  embeddingModel?: string;
  errors?: string[];
}

/**
 * Main PDF ingester class
 */
export class PDFIngester {
  private pdfExtractor: PDFExtractor;
  private metadataParser: MetadataParser;
  private embeddingStore: PdfEmbeddingStore;

  constructor(
    private vaultPath: string,
    private llmAgent: LlmAgent, // LLM agent for intelligent parsing
  ) {
    this.pdfExtractor = new PDFExtractor();
    this.metadataParser = new MetadataParser();
    this.embeddingStore = new PdfEmbeddingStore(vaultPath);
  }

  /**
   * Ingest a single PDF file
   */
  async ingestPDF(
    filepath: string,
    options: IngestOptions,
  ): Promise<IngestResult> {
    try {
      const pdfContent = await this.pdfExtractor.extract(filepath);

      const metadata = await this.metadataParser.parse(pdfContent, filepath);

      const embeddingSummary = await this.persistEmbeddings(metadata, options);

      const suggestions = await this.generateIngestSuggestions(
        metadata,
        options,
      );

      return {
        success: true,
        filepath,
        metadata,
        ...embeddingSummary,
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

  private async persistEmbeddings(
    metadata: PDFMetadata,
    options: IngestOptions,
  ): Promise<
    | {
        embeddingIndexPath: string;
        embeddedChunks: number;
        embeddingProvider?: string;
        embeddingModel?: string;
      }
    | undefined
  > {
    if (!options.courseId.trim()) {
      return undefined;
    }

    const chunks =
      metadata.chunks ?? splitPdfTextIntoChunks(metadata.extractedText);
    if (chunks.length === 0) {
      return undefined;
    }

    try {
      const embeddings = await embedPdfChunks(chunks);
      const embeddingIndexPath = await this.embeddingStore.upsertDocument(
        options.courseId,
        {
          filepath: metadata.filepath,
          filename: metadata.filename,
          title: metadata.title,
          pageCount: metadata.pageCount,
          updatedAt: new Date().toISOString(),
          embeddingProvider: embeddings.embeddingProvider,
          embeddingModel: embeddings.embeddingModel,
          chunks: embeddings.embeddings,
        },
      );

      return {
        embeddingIndexPath,
        embeddedChunks: embeddings.embeddings.length,
        embeddingProvider: embeddings.embeddingProvider,
        embeddingModel: embeddings.embeddingModel,
      };
    } catch (error) {
      console.warn("Failed to persist PDF embeddings:", error);
      return undefined;
    }
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

    const pdfWorkerSrc = resolvePdfWorkerSrc();
    if (pdfWorkerSrc) {
      PDFParse.setWorker(pdfWorkerSrc);
    }

    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    try {
      const [textResult, infoResult] = await Promise.all([
        parser.getText(),
        parser.getInfo().catch(() => undefined),
      ]);

      let text = textResult.text;
      if (isLowTextPdf(textResult.text, textResult.total)) {
        text = (await extractWithPdftotext(filepath)) ?? text;
      }
      if (isLowTextPdf(text, textResult.total)) {
        text = (await extractWithOcrmypdf(filepath)) ?? text;
      }

      const data = {
        text,
        numpages: textResult.total,
        info: infoResult?.info,
      } as PdfParseResult;

      return {
        text: data.text,
        pageCount: data.numpages,
        metadata: data.info ?? {},
      };
    } finally {
      await parser.destroy();
    }
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
      chunks: splitPdfTextIntoChunks(pdfContent.text),
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
