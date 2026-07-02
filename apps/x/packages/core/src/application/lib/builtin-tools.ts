import { z, ZodType } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { execSync } from "child_process";
import { homedir } from "os";
import { glob } from "glob";
import { executeCommand, executeCommandAbortable } from "./command-executor.js";
import { resolveSkill, availableSkills } from "../assistant/skills/index.js";
import { executeTool, listServers, listTools } from "../../mcp/mcp.js";
import * as anki from "../../anki/service.js";
import container from "../../di/container.js";
import { IMcpConfigRepo } from "../..//mcp/repo.js";
import { McpServerDefinition } from "@scholaros/shared/dist/mcp.js";
import * as workspace from "../../workspace/workspace.js";
import { IAgentsRepo } from "../../agents/repo.js";
import { WorkDir } from "../../config/config.js";
import { composioAccountsRepo } from "../../composio/repo.js";
import {
  executeAction as executeComposioAction,
  isConfigured as isComposioConfigured,
  searchTools as searchComposioTools,
} from "../../composio/client.js";
import {
  CURATED_TOOLKITS,
  CURATED_TOOLKIT_SLUGS,
} from "@scholaros/shared/dist/composio.js";
import {
  BrowserControlInputSchema,
  type BrowserControlInput,
} from "@scholaros/shared/dist/browser-control.js";
import type { ToolContext } from "./exec-tool.js";
import { generateText } from "ai";
import { createProvider } from "../../models/models.js";
import {
  getDefaultModelAndProvider,
  resolveProviderConfig,
} from "../../models/defaults.js";
import type { IBrowserControlService } from "../browser-control/service.js";

// Statically import parser libraries so esbuild can bundle them
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import PapaParse from "papaparse";
import mammothModule from "mammoth";
import { getPdfWorkerPath } from "./pdf-worker-resolver.js";
import { classifyFiles as classifyFilesFn, suggestCourseFromFilename } from "../../academic/file-classifier.js";

// Use the imported modules directly
const Papa = (PapaParse as any).default || PapaParse;
const mammoth = (mammothModule as any).default || mammothModule;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BuiltinToolsSchema = z.record(
  z.string(),
  z.object({
    description: z.string(),
    inputSchema: z.custom<ZodType>(),
    execute: z.function({
      input: z.any(), // (input, ctx?) => Promise<any>
      output: z.promise(z.any()),
    }),
    isAvailable: z.custom<() => Promise<boolean>>().optional(),
  }),
);

const LLMPARSE_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".html": "text/html",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
};

// Robust PDF worker resolution is now handled by getPdfWorkerPath()
// See pdf-worker-resolver.ts for detailed resolution strategy

const PDF_CHUNK_TARGET = 1400;
const PDF_CHUNK_OVERLAP = 180;

const splitPdfTextIntoChunks = (text: string): string[] => {
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
};

const isLowTextPdf = (text: string, pages: number): boolean => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 100) return true;
  return normalized.length / Math.max(pages, 1) < 40;
};

const extractPptxText = async (buffer: Buffer): Promise<string> => {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] || "0", 10);
        const nb = parseInt(b.match(/\d+/)?.[0] || "0", 10);
        return na - nb;
      });

    if (slideFiles.length === 0) return "";

    const slides: string[] = [];
    for (const slideFile of slideFiles) {
      const content = await zip.files[slideFile].async("string");
      const textMatches = content.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
      const slideText = textMatches
        .map((tag) => tag.replace(/<[^>]*>/g, ""))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (slideText) {
        slides.push(slideText);
      }
    }

    return slides.join("\n\n---\n\n");
  } catch {
    return "";
  }
};

const extractTextFromImage = async (
  buffer: Buffer,
): Promise<string | undefined> => {
  try {
    const Tesseract = (await import("tesseract.js")).default;
    const worker = await Tesseract.createWorker("eng");
    try {
      const { data } = await worker.recognize(buffer);
      const text = data.text?.trim();
      return text || undefined;
    } finally {
      await worker.terminate();
    }
  } catch {
    return undefined;
  }
};

const PARSE_DEBUG = () => process.env.PARSE_DEBUG === "1";

async function tryOcrPdfViaCanvas(
  filePath: string,
): Promise<{ text: string; pages: number } | undefined> {
  try {
    const buffer = await fs.readFile(filePath);
    const pdfjsLib = await import("pdfjs-dist");
    const { getDocument, GlobalWorkerOptions } = pdfjsLib;

    const pdfWorkerSrc = getPdfWorkerPath();
    if (pdfWorkerSrc) {
      GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    }

    if (PARSE_DEBUG()) console.log("[parse] Rendering PDF pages via OffscreenCanvas...");
    const pdfDoc = await getDocument({ data: buffer.slice(0) }).promise;
    if (PARSE_DEBUG()) console.log(`[parse] PDF has ${pdfDoc.numPages} pages`);

    const Tesseract = (await import("tesseract.js")).default;
    const worker = await Tesseract.createWorker("eng");

    try {
      const pageTexts: string[] = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          if (PARSE_DEBUG()) console.log(`[parse] Page ${i}: no 2d context`);
          continue;
        }

        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (!imageData?.data?.length) {
          if (PARSE_DEBUG()) console.log(`[parse] Page ${i}: empty render`);
          continue;
        }

        if (PARSE_DEBUG()) console.log(`[parse] Page ${i}: OCR ${viewport.width}x${viewport.height}...`);
        const { data } = await worker.recognize(imageData);
        if (data.text?.trim()) {
          pageTexts.push(data.text.trim());
          if (PARSE_DEBUG()) console.log(`[parse] Page ${i}: ${data.text.trim().length} chars`);
        } else if (PARSE_DEBUG()) {
          console.log(`[parse] Page ${i}: no text extracted`);
        }
      }

      const combined = pageTexts.join("\n\n");
      if (PARSE_DEBUG()) console.log(`[parse] Canvas OCR total: ${combined.length} chars from ${pageTexts.length} pages`);
      return combined ? { text: combined, pages: pdfDoc.numPages } : undefined;
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    if (PARSE_DEBUG()) console.log("[parse] Canvas render error:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

const extractPdfTextWithTesseractJs = async (
  filePath: string,
): Promise<{ text: string; pages: number } | undefined> => {
  const canvasResult = await tryOcrPdfViaCanvas(filePath);
  if (canvasResult) {
    return canvasResult;
  }

  // Last-resort: render pages one at a time via Buffer to PNG → tesseract.js
  try {
    const buffer = await fs.readFile(filePath);
    const pdfjsLib = await import("pdfjs-dist");
    const { getDocument } = pdfjsLib;
    const pdfDoc = await getDocument({ data: buffer.slice(0) }).promise;

    const Tesseract = (await import("tesseract.js")).default;
    const worker = await Tesseract.createWorker("eng");
    try {
      const pageTexts: string[] = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = await worker.recognize(imageData);
        if (data.text?.trim()) pageTexts.push(data.text.trim());
      }
      const combined = pageTexts.join("\n\n");
      return combined ? { text: combined, pages: pdfDoc.numPages } : undefined;
    } finally {
      await worker.terminate();
    }
  } catch {
    return undefined;
  }
};

const extractTextWithLLM = async (
  filePath: string,
  mimeType: string,
): Promise<string | undefined> => {
  try {
    let buffer: Buffer;
    if (path.isAbsolute(filePath)) {
      buffer = await fs.readFile(filePath);
    } else {
      const result = await workspace.readFile(filePath, "base64");
      buffer = Buffer.from(result.data, "base64");
    }

    const base64 = buffer.toString("base64");
    const { model: modelId, provider: providerName } =
      await getDefaultModelAndProvider();
    const providerConfig = await resolveProviderConfig(providerName);
    const model = createProvider(providerConfig).languageModel(modelId);

    const response = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text content from this file. Return only the extracted text, no commentary.",
            },
            { type: "file", data: base64, mediaType: mimeType },
          ],
        },
      ],
    });

    const text = response.text?.trim();
    return text || undefined;
  } catch {
    return undefined;
  }
};

export const BuiltinTools: z.infer<typeof BuiltinToolsSchema> = {
  loadSkill: {
    description:
      "Load a ScholarOS skill definition into context by fetching its guidance string",
    inputSchema: z.object({
      skillName: z
        .string()
        .describe(
          "Skill identifier or path (e.g., 'workflow-run-ops' or 'src/application/assistant/skills/workflow-run-ops/skill.ts')",
        ),
    }),
    execute: async ({ skillName }: { skillName: string }) => {
      const resolved = resolveSkill(skillName);

      if (!resolved) {
        return {
          success: false,
          message: `Skill '${skillName}' not found. Available skills: ${availableSkills.join(", ")}`,
        };
      }

      return {
        success: true,
        skillName: resolved.id,
        path: resolved.catalogPath,
        content: resolved.content,
      };
    },
  },

  "workspace-getRoot": {
    description: "Get the workspace root directory path",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        return await workspace.getRoot();
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-exists": {
    description: "Check if a file or directory exists in the workspace",
    inputSchema: z.object({
      path: z.string().min(1).describe("Workspace-relative path to check"),
    }),
    execute: async ({ path: relPath }: { path: string }) => {
      try {
        return await workspace.exists(relPath);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-stat": {
    description:
      "Get file or directory statistics (size, modification time, etc.)",
    inputSchema: z.object({
      path: z.string().min(1).describe("Workspace-relative path to stat"),
    }),
    execute: async ({ path: relPath }: { path: string }) => {
      try {
        return await workspace.stat(relPath);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-readdir": {
    description:
      "List directory contents. Can recursively explore directory structure with options.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("Workspace-relative directory path (empty string for root)"),
      recursive: z
        .boolean()
        .optional()
        .describe("Recursively list all subdirectories (default: false)"),
      includeStats: z
        .boolean()
        .optional()
        .describe(
          "Include file stats like size and modification time (default: false)",
        ),
      includeHidden: z
        .boolean()
        .optional()
        .describe("Include hidden files starting with . (default: false)"),
      allowedExtensions: z
        .array(z.string())
        .optional()
        .describe('Filter by file extensions (e.g., [".json", ".ts"])'),
    }),
    execute: async ({
      path: relPath,
      recursive,
      includeStats,
      includeHidden,
      allowedExtensions,
    }: {
      path: string;
      recursive?: boolean;
      includeStats?: boolean;
      includeHidden?: boolean;
      allowedExtensions?: string[];
    }) => {
      try {
        const entries = await workspace.readdir(relPath || "", {
          recursive,
          includeStats,
          includeHidden,
          allowedExtensions,
        });
        return entries;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-readFile": {
    description:
      "Read a file from the workspace. For text files (utf8, the default), returns the content with each line prefixed by its 1-indexed line number (e.g. `12: some text`). Use the `offset` and `limit` parameters to page through large files; defaults read up to 2000 lines starting at line 1. Output is wrapped in `<path>`, `<type>`, `<content>` tags and ends with a footer indicating whether the read reached end-of-file or was truncated. Line numbers in the output are display-only — do NOT include them when later writing or editing the file. For `base64` / `binary` encodings, returns the raw bytes as a string and ignores `offset` / `limit`.",
    inputSchema: z.object({
      path: z.string().min(1).describe("Workspace-relative file path"),
      offset: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "1-indexed line to start reading from (default: 1). Utf8 only.",
        ),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "Maximum number of lines to read (default: 2000). Utf8 only.",
        ),
      encoding: z
        .enum(["utf8", "base64", "binary"])
        .optional()
        .describe("File encoding (default: utf8)"),
    }),
    execute: async ({
      path: relPath,
      offset,
      limit,
      encoding = "utf8",
    }: {
      path: string;
      offset?: number;
      limit?: number;
      encoding?: "utf8" | "base64" | "binary";
    }) => {
      try {
        if (encoding !== "utf8") {
          return await workspace.readFile(relPath, encoding);
        }

        const DEFAULT_READ_LIMIT = 2000;
        const MAX_LINE_LENGTH = 2000;
        const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`;
        const MAX_BYTES = 50 * 1024;
        const MAX_BYTES_LABEL = `${MAX_BYTES / 1024} KB`;

        const absPath = workspace.resolveWorkspacePath(relPath);
        const stats = await fs.lstat(absPath);
        const stat = workspace.statToSchema(stats, "file");
        const etag = workspace.computeEtag(stats.size, stats.mtimeMs);

        const effectiveOffset = offset ?? 1;
        const effectiveLimit = limit ?? DEFAULT_READ_LIMIT;
        const start = effectiveOffset - 1;

        const stream = createReadStream(absPath, { encoding: "utf8" });
        const rl = createInterface({ input: stream, crlfDelay: Infinity });

        const collected: string[] = [];
        let totalLines = 0;
        let bytes = 0;
        let truncatedByBytes = false;
        let hasMoreLines = false;

        try {
          for await (const text of rl) {
            totalLines += 1;
            if (totalLines <= start) continue;

            if (collected.length >= effectiveLimit) {
              hasMoreLines = true;
              continue;
            }

            const line =
              text.length > MAX_LINE_LENGTH
                ? text.substring(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX
                : text;
            const size =
              Buffer.byteLength(line, "utf-8") + (collected.length > 0 ? 1 : 0);
            if (bytes + size > MAX_BYTES) {
              truncatedByBytes = true;
              hasMoreLines = true;
              break;
            }

            collected.push(line);
            bytes += size;
          }
        } finally {
          rl.close();
          stream.destroy();
        }

        if (
          totalLines < effectiveOffset &&
          !(totalLines === 0 && effectiveOffset === 1)
        ) {
          return {
            error: `Offset ${effectiveOffset} is out of range for this file (${totalLines} lines)`,
          };
        }

        const prefixed = collected.map(
          (line, index) => `${index + effectiveOffset}: ${line}`,
        );
        const lastReadLine = effectiveOffset + collected.length - 1;
        const nextOffset = lastReadLine + 1;

        let footer: string;
        if (truncatedByBytes) {
          footer = `(Output capped at ${MAX_BYTES_LABEL}. Showing lines ${effectiveOffset}-${lastReadLine}. Use offset=${nextOffset} to continue.)`;
        } else if (hasMoreLines) {
          footer = `(Showing lines ${effectiveOffset}-${lastReadLine} of ${totalLines}. Use offset=${nextOffset} to continue.)`;
        } else {
          footer = `(End of file - total ${totalLines} lines)`;
        }

        const content = [
          `<path>${relPath}</path>`,
          `<type>file</type>`,
          `<content>`,
          prefixed.join("\n"),
          "",
          footer,
          `</content>`,
        ].join("\n");

        return {
          path: relPath,
          encoding: "utf8" as const,
          content,
          stat,
          etag,
          offset: effectiveOffset,
          limit: effectiveLimit,
          totalLines,
          hasMore: hasMoreLines || truncatedByBytes,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-writeFile": {
    description:
      "Write or update file contents in the workspace. Automatically creates parent directories and supports atomic writes.",
    inputSchema: z.object({
      path: z.string().min(1).describe("Workspace-relative file path"),
      data: z.string().describe("File content to write"),
      encoding: z
        .enum(["utf8", "base64", "binary"])
        .optional()
        .describe("Data encoding (default: utf8)"),
      atomic: z
        .boolean()
        .optional()
        .describe("Use atomic write (default: true)"),
      mkdirp: z
        .boolean()
        .optional()
        .describe("Create parent directories if needed (default: true)"),
      expectedEtag: z
        .string()
        .optional()
        .describe(
          "ETag to check for concurrent modifications (conflict detection)",
        ),
    }),
    execute: async ({
      path: relPath,
      data,
      encoding,
      atomic,
      mkdirp,
      expectedEtag,
    }: {
      path: string;
      data: string;
      encoding?: "utf8" | "base64" | "binary";
      atomic?: boolean;
      mkdirp?: boolean;
      expectedEtag?: string;
    }) => {
      try {
        return await workspace.writeFile(relPath, data, {
          encoding,
          atomic,
          mkdirp,
          expectedEtag,
        });
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-edit": {
    description:
      "Make precise edits to a file by replacing specific text. Safer than rewriting entire files - produces smaller diffs and reduces risk of data loss.",
    inputSchema: z.object({
      path: z.string().min(1).describe("Workspace-relative file path"),
      oldString: z.string().describe("Exact text to find and replace"),
      newString: z.string().describe("Replacement text"),
      replaceAll: z
        .boolean()
        .optional()
        .describe(
          "Replace all occurrences (default: false, fails if not unique)",
        ),
    }),
    execute: async ({
      path: relPath,
      oldString,
      newString,
      replaceAll = false,
    }: {
      path: string;
      oldString: string;
      newString: string;
      replaceAll?: boolean;
    }) => {
      try {
        const result = await workspace.readFile(relPath, "utf8");
        const content = result.data;

        const occurrences = content.split(oldString).length - 1;

        if (occurrences === 0) {
          return { error: "oldString not found in file" };
        }

        if (occurrences > 1 && !replaceAll) {
          return {
            error: `oldString found ${occurrences} times. Use replaceAll: true or provide more context to make it unique.`,
          };
        }

        const newContent = replaceAll
          ? content.replaceAll(oldString, newString)
          : content.replace(oldString, newString);

        await workspace.writeFile(relPath, newContent, { encoding: "utf8" });

        return {
          success: true,
          replacements: replaceAll ? occurrences : 1,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-mkdir": {
    description: "Create a directory in the workspace",
    inputSchema: z.object({
      path: z.string().min(1).describe("Workspace-relative directory path"),
      recursive: z
        .boolean()
        .optional()
        .describe("Create parent directories if needed (default: true)"),
    }),
    execute: async ({
      path: relPath,
      recursive = true,
    }: {
      path: string;
      recursive?: boolean;
    }) => {
      try {
        return await workspace.mkdir(relPath, recursive);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-rename": {
    description: "Rename or move a file or directory in the workspace",
    inputSchema: z.object({
      from: z.string().min(1).describe("Source workspace-relative path"),
      to: z.string().min(1).describe("Destination workspace-relative path"),
      overwrite: z
        .boolean()
        .optional()
        .describe("Overwrite destination if it exists (default: false)"),
    }),
    execute: async ({
      from,
      to,
      overwrite = false,
    }: {
      from: string;
      to: string;
      overwrite?: boolean;
    }) => {
      try {
        return await workspace.rename(from, to, overwrite);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-copy": {
    description: "Copy a file in the workspace (directories not supported)",
    inputSchema: z.object({
      from: z.string().min(1).describe("Source workspace-relative file path"),
      to: z
        .string()
        .min(1)
        .describe("Destination workspace-relative file path"),
      overwrite: z
        .boolean()
        .optional()
        .describe("Overwrite destination if it exists (default: false)"),
    }),
    execute: async ({
      from,
      to,
      overwrite = false,
    }: {
      from: string;
      to: string;
      overwrite?: boolean;
    }) => {
      try {
        return await workspace.copy(from, to, overwrite);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-remove": {
    description:
      "Remove a file or directory from the workspace. Files are moved to trash by default for safety.",
    inputSchema: z.object({
      path: z.string().min(1).describe("Workspace-relative path to remove"),
      recursive: z
        .boolean()
        .optional()
        .describe("Required for directories (default: false)"),
      trash: z
        .boolean()
        .optional()
        .describe("Move to trash instead of permanent delete (default: true)"),
    }),
    execute: async ({
      path: relPath,
      recursive,
      trash,
    }: {
      path: string;
      recursive?: boolean;
      trash?: boolean;
    }) => {
      try {
        return await workspace.remove(relPath, {
          recursive,
          trash,
        });
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-glob": {
    description:
      'Find files matching a glob pattern (e.g., "**/*.ts", "src/**/*.json"). Much faster than recursive readdir for finding files.',
    inputSchema: z.object({
      pattern: z.string().describe("Glob pattern to match files"),
      cwd: z
        .string()
        .optional()
        .describe(
          "Subdirectory to search in, relative to workspace root (default: workspace root)",
        ),
    }),
    execute: async ({ pattern, cwd }: { pattern: string; cwd?: string }) => {
      try {
        const searchDir = cwd ? path.join(WorkDir, cwd) : WorkDir;

        // Ensure search directory is within workspace
        const resolvedSearchDir = path.resolve(searchDir);
        if (!resolvedSearchDir.startsWith(WorkDir)) {
          return { error: "Search directory must be within workspace" };
        }

        const files = await glob(pattern, {
          cwd: searchDir,
          nodir: true,
          ignore: ["node_modules/**", ".git/**"],
        });

        return {
          files,
          count: files.length,
          pattern,
          cwd: cwd || ".",
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "workspace-grep": {
    description:
      "Search file contents using regex. Returns matching files and lines. Uses ripgrep if available, falls back to grep.",
    inputSchema: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      searchPath: z
        .string()
        .optional()
        .describe(
          "Directory or file to search, relative to workspace root (default: workspace root)",
        ),
      fileGlob: z
        .string()
        .optional()
        .describe('File pattern filter (e.g., "*.ts", "*.md")'),
      contextLines: z
        .number()
        .optional()
        .describe("Lines of context around matches (default: 0)"),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum results to return (default: 100)"),
    }),
    execute: async ({
      pattern,
      searchPath,
      fileGlob,
      contextLines = 0,
      maxResults = 100,
    }: {
      pattern: string;
      searchPath?: string;
      fileGlob?: string;
      contextLines?: number;
      maxResults?: number;
    }) => {
      try {
        const targetPath = searchPath
          ? path.join(WorkDir, searchPath)
          : WorkDir;

        // Ensure target path is within workspace
        const resolvedTargetPath = path.resolve(targetPath);
        if (!resolvedTargetPath.startsWith(WorkDir)) {
          return { error: "Search path must be within workspace" };
        }

        // Try ripgrep first
        try {
          const rgArgs = [
            "--json",
            "-e",
            JSON.stringify(pattern),
            contextLines > 0 ? `-C ${contextLines}` : "",
            fileGlob ? `--glob ${JSON.stringify(fileGlob)}` : "",
            `--max-count ${maxResults}`,
            "--ignore-case",
            JSON.stringify(resolvedTargetPath),
          ]
            .filter(Boolean)
            .join(" ");

          const output = execSync(`rg ${rgArgs}`, {
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
            cwd: WorkDir,
          });

          const matches = output
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter((m) => m && m.type === "match");

          return {
            matches: matches.map((m) => ({
              file: path.relative(WorkDir, m.data.path.text),
              line: m.data.line_number,
              content: m.data.lines.text.trim(),
            })),
            count: matches.length,
            tool: "ripgrep",
          };
        } catch {
          // Fallback: Node.js-based file search (cross-platform)
          // Ripgrep and grep aren't available on all systems (esp. Windows)
          try {
            const regex = new RegExp(pattern, "i");
            const matches: Array<{
              line: number;
              file: string;
              content: string;
            }> = [];

            // Build glob to limit which files we search
            const globPattern = fileGlob || "**/*";

            // Stat the target to check if it's a file or directory
            let targetFiles: string[];
            try {
              const stat = await fs.stat(resolvedTargetPath);
              if (stat.isFile()) {
                targetFiles = [resolvedTargetPath];
              } else {
                targetFiles = await glob(globPattern, {
                  cwd: resolvedTargetPath,
                  nodir: true,
                  ignore: ["node_modules/**", ".git/**"],
                  absolute: true,
                });
              }
            } catch {
              targetFiles = await glob(globPattern, {
                cwd: resolvedTargetPath,
                nodir: true,
                ignore: ["node_modules/**", ".git/**"],
                absolute: true,
              });
            }

            for (const filePath of targetFiles) {
              if (matches.length >= maxResults) break;
              try {
                const rl = createInterface({
                  input: createReadStream(filePath, {
                    encoding: "utf-8",
                    highWaterMark: 64 * 1024,
                  }),
                  crlfDelay: Infinity,
                });

                let lineNum = 0;
                for await (const line of rl) {
                  lineNum++;
                  if (matches.length >= maxResults) break;
                  if (regex.test(line)) {
                    matches.push({
                      file: path.relative(WorkDir, filePath),
                      line: lineNum,
                      content: line.trim().slice(0, 500),
                    });
                  }
                }
                rl.close();
              } catch {
                // Skip unreadable files
              }
            }

            return {
              matches,
              count: matches.length,
              tool: "node-grep",
            };
          } catch {
            return { matches: [], count: 0, tool: "grep" };
          }
        }
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  parseFile: {
    description:
      "Parse and extract text content from files (PDF, PPTX, DOCX, XLSX, CSV, PNG, JPG). Auto-detects format from file extension. PDFs use automatic fallback chain: pdf-parse (text PDFs) → tesseract.js OCR (scanned PDFs) → LLM vision. Images use tesseract.js OCR → LLM vision.",
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe(
          "File path to parse. Can be an absolute path or a workspace-relative path.",
        ),
    }),
    execute: async ({ path: filePath }: { path: string }) => {
      try {
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const supportedExts = [".pdf", ".pptx", ".xlsx", ".xls", ".csv", ".docx", ".png", ".jpg", ".jpeg", ".md", ".txt", ".html", ".htm"];

        if (!supportedExts.includes(ext)) {
          return {
            success: false,
            error: `Unsupported file format '${ext}'. Supported formats: ${supportedExts.join(", ")}`,
          };
        }

        // Plain text formats — just read the file content
        if (ext === ".md" || ext === ".txt" || ext === ".html" || ext === ".htm") {
          let content: string;
          if (path.isAbsolute(filePath)) {
            content = await fs.readFile(filePath, "utf-8");
          } else {
            const result = await workspace.readFile(filePath, "utf8");
            content = result.data;
          }
          return {
            success: true,
            fileName,
            format: ext === ".md" ? "markdown" : ext === ".txt" ? "text" : "html",
            content,
          };
        }

        // Read file as buffer — support both absolute and workspace-relative paths
        let buffer: Buffer;
        if (path.isAbsolute(filePath)) {
          buffer = await fs.readFile(filePath);
        } else {
          const result = await workspace.readFile(filePath, "base64");
          buffer = Buffer.from(result.data, "base64");
        }

        if (ext === ".pdf") {
          // --- Primary extraction via pdf-parse ---
          let pdfPrimaryText = "";
          let pdfPages = 0;
          let pdfTitle: string | undefined;
          let pdfAuthor: string | undefined;

          try {
            const pdfWorkerSrc = getPdfWorkerPath();
            if (pdfWorkerSrc) {
              PDFParse.setWorker(pdfWorkerSrc);
            }

            const parser = new PDFParse({ data: new Uint8Array(buffer) });
            try {
              const [textResult, infoResult] = await Promise.all([
                parser.getText(),
                parser.getInfo().catch(() => undefined),
              ]);
              pdfPrimaryText = textResult.text;
              pdfPages = textResult.total;
              pdfTitle = infoResult?.info?.Title || undefined;
              pdfAuthor = infoResult?.info?.Author || undefined;

              if (!isLowTextPdf(pdfPrimaryText, pdfPages)) {
                const chunks = splitPdfTextIntoChunks(pdfPrimaryText);
                return {
                  success: true,
                  fileName,
                  format: "pdf",
                  content: pdfPrimaryText,
                  chunks,
                  metadata: {
                    pages: pdfPages,
                    title: pdfTitle,
                    author: pdfAuthor,
                    chunkCount: chunks.length,
                    chunkTarget: PDF_CHUNK_TARGET,
                  },
                };
              }
            } finally {
              await parser.destroy();
            }
          } catch {
            // pdf-parse failed (worker missing, corrupt file, etc.) —
            // fall through to CLI / OCR fallback chain below
          }

          // --- Fallback chain (runs when pdf-parse failed or returned low text) ---
          const pdfFallbackMetadata = {
            title: pdfTitle,
            author: pdfAuthor,
          };

          const jsOcrResult = await extractPdfTextWithTesseractJs(filePath);
          if (jsOcrResult) {
            const chunks = splitPdfTextIntoChunks(jsOcrResult.text);
            return {
              success: true,
              fileName,
              format: "pdf",
              content: jsOcrResult.text,
              chunks,
              metadata: {
                pages: jsOcrResult.pages || pdfPages || 0,
                ...pdfFallbackMetadata,
                fallback: "tesseract.js",
                chunkCount: chunks.length,
                chunkTarget: PDF_CHUNK_TARGET,
              },
            };
          }

          const llmResult = await extractTextWithLLM(filePath, "application/pdf");
          if (llmResult) {
            const chunks = splitPdfTextIntoChunks(llmResult);
            return {
              success: true,
              fileName,
              format: "pdf",
              content: llmResult,
              chunks,
              metadata: {
                pages: pdfPages || 0,
                ...pdfFallbackMetadata,
                fallback: "llm",
                chunkCount: chunks.length,
                chunkTarget: PDF_CHUNK_TARGET,
              },
            };
          }

          // All fallbacks exhausted — return whatever pdf-parse gave us
          const hasContent = pdfPrimaryText.replace(/\s+/g, " ").trim().length > 50;
          const chunks = splitPdfTextIntoChunks(pdfPrimaryText);
          return {
            success: true,
            fileName,
            format: "pdf",
            content: pdfPrimaryText,
            chunks,
            metadata: {
              pages: pdfPages || 0,
              ...pdfFallbackMetadata,
              fallback: hasContent ? "partial" : "low-text",
              chunkCount: chunks.length,
              chunkTarget: PDF_CHUNK_TARGET,
            },
          };
        }

        if (ext === ".xlsx" || ext === ".xls") {
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const sheets: Record<string, string> = {};
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            sheets[sheetName] = XLSX.utils.sheet_to_csv(sheet);
          }
          return {
            success: true,
            fileName,
            format: ext === ".xlsx" ? "xlsx" : "xls",
            content: Object.values(sheets).join("\n\n"),
            metadata: {
              sheetNames: workbook.SheetNames,
              sheetCount: workbook.SheetNames.length,
            },
            sheets,
          };
        }

        if (ext === ".csv") {
          const text = buffer.toString("utf8");
          const parsed = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
          });
          return {
            success: true,
            fileName,
            format: "csv",
            content: text,
            metadata: {
              rowCount: parsed.data.length,
              headers: parsed.meta.fields || [],
            },
            data: parsed.data,
          };
        }

        if (ext === ".pptx") {
          const content = await extractPptxText(buffer);
          return {
            success: true,
            fileName,
            format: "pptx",
            content,
          };
        }

        if (ext === ".docx") {
          const docResult = await mammoth.extractRawText({ buffer });
          return {
            success: true,
            fileName,
            format: "docx",
            content: docResult.value,
          };
        }

        if ([".png", ".jpg", ".jpeg"].includes(ext)) {
          let content = await extractTextFromImage(buffer);
          if (!content) {
            content = await extractTextWithLLM(filePath, LLMPARSE_MIME_TYPES[ext]);
          }
          return {
            success: true,
            fileName,
            format: ext === ".png" ? "png" : "jpeg",
            content: content || "",
            metadata: content
              ? undefined
              : { note: "Could not extract text from this image" },
          };
        }

        return { success: false, error: "Unexpected error" };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "classifyFiles": {
    description:
      "Classify files into course folders using local embeddings. Zero API calls, runs entirely on your machine. Returns the best matching course for each file, or flags files that likely belong to a new course. Use this instead of guessing course assignments manually.",
    inputSchema: z.object({
      files: z
        .array(
          z.object({
            filepath: z.string().min(1).describe("Absolute or workspace-relative path to the file"),
            content: z.string().min(1).describe("Extracted text content of the file (use parseFile first)"),
          }),
        )
        .min(1)
        .max(50)
        .describe("Files to classify (1-50)"),
    }),
    execute: async ({
      files,
    }: {
      files: Array<{ filepath: string; content: string }>;
    }) => {
      try {
        const results = await classifyFilesFn(files, WorkDir);

        return {
          success: true,
          classifications: results.map((r) => ({
            filepath: r.filepath,
            course: r.classification.course
              ? {
                  id: r.classification.course.courseId,
                  name: r.classification.course.courseName,
                  similarity: Math.round(r.classification.course.similarity * 100) / 100,
                }
              : null,
            isNewCourse: r.classification.isNewCourse,
            suggestedNewCourse: r.classification.isNewCourse
              ? suggestCourseFromFilename(path.basename(r.filepath))
              : undefined,
            allCandidates: r.classification.allCandidates
              .slice(0, 3)
              .map((c) => ({
                name: c.courseName,
                similarity: Math.round(c.similarity * 100) / 100,
              })),
          })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  LLMParse: {
    description:
      "Disabled by default. Use parseFile with local fallbacks for PDF ingestion. Enable only with ENABLE_LLM_PARSE=1 for rare, explicit multimodal extraction needs.",
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe(
          "File path to parse. Can be an absolute path or a workspace-relative path.",
        ),
      prompt: z
        .string()
        .optional()
        .describe(
          'Custom instruction for the LLM (defaults to "Convert this file to well-structured markdown.")',
        ),
    }),
    execute: async ({
      path: filePath,
      prompt,
    }: {
      path: string;
      prompt?: string;
    }) => {
      try {
        if (process.env.ENABLE_LLM_PARSE !== "1") {
          return {
            success: false,
            error:
              "LLMParse is disabled. Use parseFile or set ENABLE_LLM_PARSE=1.",
          };
        }

        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = LLMPARSE_MIME_TYPES[ext];

        if (!mimeType) {
          return {
            success: false,
            error: `Unsupported file format '${ext}'. Supported formats: ${Object.keys(LLMPARSE_MIME_TYPES).join(", ")}`,
          };
        }

        // Read file as buffer — support both absolute and workspace-relative paths
        let buffer: Buffer;
        if (path.isAbsolute(filePath)) {
          buffer = await fs.readFile(filePath);
        } else {
          const result = await workspace.readFile(filePath, "base64");
          buffer = Buffer.from(result.data, "base64");
        }

        const base64 = buffer.toString("base64");

        const { model: modelId, provider: providerName } =
          await getDefaultModelAndProvider();
        const providerConfig = await resolveProviderConfig(providerName);
        const model = createProvider(providerConfig).languageModel(modelId);

        const userPrompt =
          prompt || "Convert this file to well-structured markdown.";

        const response = await generateText({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                { type: "file", data: base64, mediaType: mimeType },
              ],
            },
          ],
        });

        return {
          success: true,
          fileName,
          format: ext.slice(1),
          mimeType,
          content: response.text,
          usage: response.usage,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  analyzeAgent: {
    description:
      "Read and analyze an agent file to understand its structure, tools, and configuration",
    inputSchema: z.object({
      agentName: z
        .string()
        .describe(
          "Name of the agent file to analyze (with or without .json extension)",
        ),
    }),
    execute: async ({ agentName }: { agentName: string }) => {
      const repo = container.resolve<IAgentsRepo>("agentsRepo");
      try {
        const agent = await repo.fetch(agentName);

        // Extract key information
        const toolsList = agent.tools ? Object.keys(agent.tools) : [];
        const agentTools = agent.tools
          ? Object.entries(agent.tools).map(([key, tool]) => ({
              key,
              type: tool.type,
              name: tool.name,
            }))
          : [];

        const analysis = {
          name: agent.name,
          description: agent.description || "No description",
          model: agent.model || "Not specified",
          toolCount: toolsList.length,
          tools: agentTools,
          hasOtherAgents: agentTools.some((t) => t.type === "agent"),
          structure: agent,
        };

        return {
          success: true,
          analysis,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to analyze agent: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  },

  addMcpServer: {
    description:
      "Add or update an MCP server in the configuration with validation. This ensures the server definition is valid before saving.",
    inputSchema: z.object({
      serverName: z.string().describe("Name/alias for the MCP server"),
      config: McpServerDefinition,
    }),
    execute: async ({
      serverName,
      config,
    }: {
      serverName: string;
      config: z.infer<typeof McpServerDefinition>;
    }) => {
      try {
        const validationResult = McpServerDefinition.safeParse(config);
        if (!validationResult.success) {
          return {
            success: false,
            message:
              "Server definition failed validation. Check the errors below.",
            validationErrors: validationResult.error.issues.map(
              (e) => `${e.path.join(".")}: ${e.message}`,
            ),
            providedDefinition: config,
          };
        }

        const repo = container.resolve<IMcpConfigRepo>("mcpConfigRepo");
        await repo.upsert(serverName, config);

        return {
          success: true,
          serverName,
        };
      } catch (error) {
        return {
          error: `Failed to update MCP server: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  },

  listMcpServers: {
    description: "List all available MCP servers from the configuration",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const result = await listServers();

        return {
          result,
          count: Object.keys(result.mcpServers).length,
        };
      } catch (error) {
        return {
          error: `Failed to list MCP servers: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  },

  listMcpTools: {
    description: "List all available tools from a specific MCP server",
    inputSchema: z.object({
      serverName: z.string().describe("Name of the MCP server to query"),
      cursor: z.string().optional(),
    }),
    execute: async ({
      serverName,
      cursor,
    }: {
      serverName: string;
      cursor?: string;
    }) => {
      try {
        const result = await listTools(serverName, cursor);
        return {
          serverName,
          result,
          count: result.tools.length,
        };
      } catch (error) {
        return {
          error: `Failed to list MCP tools: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  },

  executeMcpTool: {
    description:
      "Execute a specific tool from an MCP server. Use this to run MCP tools on behalf of the user. IMPORTANT: Always use listMcpTools first to get the tool's inputSchema, then match the required parameters exactly in the arguments field.",
    inputSchema: z.object({
      serverName: z
        .string()
        .describe("Name of the MCP server that provides the tool"),
      toolName: z.string().describe("Name of the tool to execute"),
      arguments: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "Arguments to pass to the tool (as key-value pairs matching the tool's input schema). MUST include all required parameters from the tool's inputSchema.",
        ),
    }),
    execute: async ({
      serverName,
      toolName,
      arguments: args = {},
    }: {
      serverName: string;
      toolName: string;
      arguments?: Record<string, unknown>;
    }) => {
      try {
        const result = await executeTool(serverName, toolName, args);
        return {
          success: true,
          serverName,
          toolName,
          result,
          message: `Successfully executed tool '${toolName}' from server '${serverName}'`,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to execute MCP tool: ${error instanceof Error ? error.message : "Unknown error"}`,
          hint: "Use listMcpTools to verify the tool exists and check its schema. Ensure all required parameters are provided in the arguments field.",
        };
      }
    },
  },

  executeCommand: {
    description:
      "Execute a shell command and return the output. Use this to run bash/shell commands.",
    inputSchema: z.object({
      command: z
        .string()
        .describe(
          'The shell command to execute (e.g., "ls -la", "cat file.txt")',
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory to execute the command in (defaults to workspace root). You do not need to set this unless absolutely necessary.",
        ),
    }),
    execute: async (
      { command, cwd }: { command: string; cwd?: string },
      ctx?: ToolContext,
    ) => {
      try {
        const rootDir = path.resolve(WorkDir);
        const workingDir = cwd ? path.resolve(rootDir, cwd) : rootDir;

        // TODO: Re-enable this check
        // const rootPrefix = rootDir.endsWith(path.sep)
        //     ? rootDir
        //     : `${rootDir}${path.sep}`;
        // if (workingDir !== rootDir && !workingDir.startsWith(rootPrefix)) {
        //     return {
        //         success: false,
        //         message: 'Invalid cwd: must be within workspace root.',
        //         command,
        //         workingDir,
        //     };
        // }

        // Use abortable version when we have a signal
        if (ctx?.signal) {
          const { promise, process: proc } = executeCommandAbortable(command, {
            cwd: workingDir,
            signal: ctx.signal,
          });

          // Register process with abort registry for force-kill
          ctx.abortRegistry.registerProcess(ctx.runId, proc);

          const result = await promise;

          return {
            success: result.exitCode === 0 && !result.wasAborted,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            wasAborted: result.wasAborted,
            command,
            workingDir,
          };
        }

        // Fallback to original for backward compatibility
        const result = await executeCommand(command, { cwd: workingDir });

        return {
          success: result.exitCode === 0,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          command,
          workingDir,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to execute command: ${error instanceof Error ? error.message : "Unknown error"}`,
          command,
        };
      }
    },
  },

  // ============================================================================
  // Browser Control
  // ============================================================================

  "browser-control": {
    description:
      "Control the embedded browser pane. Read the current page, inspect indexed interactable elements, and navigate/click/type/press keys in the active browser tab.",
    inputSchema: BrowserControlInputSchema,
    isAvailable: async () => {
      try {
        container.resolve<IBrowserControlService>("browserControlService");
        return true;
      } catch {
        return false;
      }
    },
    execute: async (input: BrowserControlInput, ctx?: ToolContext) => {
      try {
        const browserControlService = container.resolve<IBrowserControlService>(
          "browserControlService",
        );
        return await browserControlService.execute(input, {
          signal: ctx?.signal,
        });
      } catch (error) {
        return {
          success: false,
          action: input.action,
          error:
            error instanceof Error
              ? error.message
              : "Browser control is unavailable.",
          browser: {
            activeTabId: null,
            tabs: [],
          },
        };
      }
    },
  },

  // ============================================================================
  // App Navigation
  // ============================================================================

  "app-navigation": {
    description:
      "Control the app UI - navigate to notes, switch views, filter/search the knowledge base, and manage saved views.",
    inputSchema: z.object({
      action: z
        .enum([
          "open-note",
          "open-view",
          "update-base-view",
          "get-base-state",
          "create-base",
          "open-dashboard",
          "start-review",
          "open-writing-mode",
          "open-citation-import",
          "switch-sidebar",
          "get-study-stats",
        ])
        .describe("The navigation action to perform"),
      // open-note
      path: z
        .string()
        .optional()
        .describe(
          "Knowledge file path for open-note, e.g. People/John.md",
        ),
      // open-view
      view: z
        .enum(["bases", "graph"])
        .optional()
        .describe("Which view to open (for open-view action)"),
      // update-base-view
      filters: z
        .object({
          set: z
            .array(z.object({ category: z.string(), value: z.string() }))
            .optional()
            .describe("Replace all filters with these"),
          add: z
            .array(z.object({ category: z.string(), value: z.string() }))
            .optional()
            .describe("Add these filters"),
          remove: z
            .array(z.object({ category: z.string(), value: z.string() }))
            .optional()
            .describe("Remove these filters"),
          clear: z.boolean().optional().describe("Clear all filters"),
        })
        .optional()
        .describe("Filter modifications (for update-base-view)"),
      columns: z
        .object({
          set: z
            .array(z.string())
            .optional()
            .describe("Replace visible columns with these"),
          add: z.array(z.string()).optional().describe("Add these columns"),
          remove: z
            .array(z.string())
            .optional()
            .describe("Remove these columns"),
        })
        .optional()
        .describe("Column modifications (for update-base-view)"),
      sort: z
        .object({
          field: z.string(),
          dir: z.enum(["asc", "desc"]),
        })
        .optional()
        .describe("Sort configuration (for update-base-view)"),
      search: z
        .string()
        .optional()
        .describe("Search query to filter notes (for update-base-view)"),
      // get-base-state
      base_name: z
        .string()
        .optional()
        .describe(
          "Name of a saved base to inspect (for get-base-state). Omit for the current/default view.",
        ),
      // create-base
      name: z
        .string()
        .optional()
        .describe("Name for the saved base view (for create-base)"),
      // open-writing-mode
      notePath: z
        .string()
        .optional()
        .describe(
          "Path to the note to open in writing mode (for open-writing-mode)",
        ),
      course: z
        .string()
        .optional()
        .describe(
          "Course name for context (for open-writing-mode, start-review)",
        ),
      // switch-sidebar
      sidebarView: z
        .enum(["courses", "files"])
        .optional()
        .describe("Which sidebar view to show (for switch-sidebar)"),
    }),
    execute: async (input: { action: string; [key: string]: unknown }) => {
      switch (input.action) {
        case "open-note": {
          const filePath = input.path as string;
          try {
            const result = await workspace.exists(filePath);
            if (!result.exists) {
              return { success: false, error: `File not found: ${filePath}` };
            }
            return { success: true, action: "open-note", path: filePath };
          } catch {
            return {
              success: false,
              error: `Could not access file: ${filePath}`,
            };
          }
        }

        case "open-view": {
          const view = input.view as string;
          return { success: true, action: "open-view", view };
        }

        case "update-base-view": {
          const updates: Record<string, unknown> = {};
          if (input.filters) updates.filters = input.filters;
          if (input.columns) updates.columns = input.columns;
          if (input.sort) updates.sort = input.sort;
          if (input.search !== undefined) updates.search = input.search;
          return { success: true, action: "update-base-view", updates };
        }

        case "get-base-state": {
          // Scan knowledge files and extract frontmatter properties
          try {
            const { parseFrontmatter } =
              await import("@scholaros/shared/dist/frontmatter.js");
            const entries = await workspace.readdir("", {
              recursive: true,
              allowedExtensions: [".md"],
              excludeDirPrefixes: ["raw", "meta", "assets"],
            });
            const files = entries.filter((e) => e.kind === "file");
            const properties = new Map<string, Set<string>>();
            let noteCount = 0;

            for (const file of files) {
              try {
                const { data } = await workspace.readFile(file.path);
                const { fields } = parseFrontmatter(data);
                noteCount++;
                for (const [key, value] of Object.entries(fields)) {
                  if (!value) continue;
                  let set = properties.get(key);
                  if (!set) {
                    set = new Set();
                    properties.set(key, set);
                  }
                  const values = Array.isArray(value) ? value : [value];
                  for (const v of values) {
                    const trimmed = v.trim();
                    if (trimmed) set.add(trimmed);
                  }
                }
              } catch {
                // skip unreadable files
              }
            }

            const availableProperties: Record<string, string[]> = {};
            for (const [key, values] of properties) {
              availableProperties[key] = [...values].sort();
            }

            return {
              success: true,
              action: "get-base-state",
              noteCount,
              availableProperties,
            };
          } catch (error) {
            return {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to read knowledge base",
            };
          }
        }

        case "create-base": {
          const name = input.name as string;
          const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
          if (!safeName) {
            return { success: false, error: "Invalid base name" };
          }
          const basePath = `bases/${safeName}.base`;
          try {
            const config = { name: safeName, filters: [], columns: [] };
            await workspace.writeFile(
              basePath,
              JSON.stringify(config, null, 2),
              { mkdirp: true },
            );
            return {
              success: true,
              action: "create-base",
              name: safeName,
              path: basePath,
            };
          } catch (error) {
            return {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to create base",
            };
          }
        }

        case "open-dashboard": {
          return { success: true, action: "open-dashboard" };
        }

        case "start-review": {
          const courseFilter = input.course as string | undefined;
          return {
            success: true,
            action: "start-review",
            course: courseFilter,
          };
        }

        case "open-writing-mode": {
          const noteFilePath = input.notePath as string | undefined;
          const courseName = input.course as string | undefined;
          return {
            success: true,
            action: "open-writing-mode",
            notePath: noteFilePath,
            course: courseName,
          };
        }

        case "open-citation-import": {
          return { success: true, action: "open-citation-import" };
        }

        case "switch-sidebar": {
          const view = input.sidebarView as string;
          return { success: true, action: "switch-sidebar", view };
        }

        case "get-study-stats": {
          try {
            const { default: fs } = await import("node:fs/promises");
            const { join } = await import("node:path");
            const { root } = await workspace.getRoot();
            const reviewPath = join(root, ".scholar", "review", "cards.json");
            try {
              const raw = await fs.readFile(reviewPath, "utf-8");
              const data = JSON.parse(raw);
              const cards = data.cards ?? [];
              const sessions = data.sessions ?? [];
              const now = new Date();
              const due = cards.filter(
                (c: { nextReview: string }) =>
                  new Date(c.nextReview) <= now,
              ).length;
              const total = cards.length;
              const courses = [
                ...new Set(cards.map((c: { course: string }) => c.course)),
              ];
              const totalSessions = sessions.length;
              const totalReviewed = sessions.reduce(
                (s: number, r: { cardsReviewed: number }) =>
                  s + r.cardsReviewed,
                0,
              );
              return {
                success: true,
                action: "get-study-stats",
                due,
                total,
                courses,
                totalSessions,
                totalReviewed,
              };
            } catch {
              return {
                success: true,
                action: "get-study-stats",
                due: 0,
                total: 0,
                courses: [],
                totalSessions: 0,
                totalReviewed: 0,
              };
            }
          } catch {
            return { success: false, error: "Failed to read study stats" };
          }
        }

        default:
          return { success: false, error: `Unknown action: ${input.action}` };
      }
    },
  },

  // ============================================================================
  // Web Search (Exa Search API)
  // ============================================================================

  "web-search": {
    description:
      "Search the web using the embedded browser. Opens the browser pane, navigates to a search engine, reads the results page, and returns the page content so you can answer the user's question. Call this once — it handles all browser interaction internally.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
    }),
    isAvailable: async () => {
      try {
        container.resolve<IBrowserControlService>("browserControlService");
        return true;
      } catch {
        return false;
      }
    },
    execute: async (
      { query }: { query: string },
      ctx?: ToolContext,
    ) => {
      try {
        const browserControlService =
          container.resolve<IBrowserControlService>("browserControlService");

        // Open the browser pane
        const openResult = await browserControlService.execute(
          { action: "open" },
          { signal: ctx?.signal },
        );
        if (!openResult.success) {
          return {
            success: false,
            error: "Could not open the embedded browser for search.",
          };
        }

        // Navigate to Google with the search query
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
        const navResult = await browserControlService.execute(
          { action: "navigate", target: searchUrl },
          { signal: ctx?.signal },
        );
        if (!navResult.success) {
          return {
            success: false,
            error: `Failed to load search results: ${navResult.error || "navigation failed"}`,
          };
        }

        // Wait for the results page to render
        await browserControlService.execute(
          { action: "wait", ms: 2000 },
          { signal: ctx?.signal },
        );

        // Read the page
        const readResult = await browserControlService.execute(
          { action: "read-page", maxTextLength: 10000 },
          { signal: ctx?.signal },
        );

        if (!readResult.success || !readResult.page) {
          return {
            success: false,
            error: "Could not read the search results page.",
          };
        }

        return {
          success: true,
          query,
          results: [
            {
              title: readResult.page.title,
              url: readResult.page.url,
              description: readResult.page.text.slice(0, 2000),
            },
          ],
          rawText: readResult.page.text,
          count: 1,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Web search failed",
        };
      }
    },
  },
  "save-to-memory": {
    description:
      "Save a note about the user to the agent memory inbox. Use this when you observe something worth remembering — their preferences, communication patterns, relationship context, scheduling habits, or explicit instructions about how they want things done.",
    inputSchema: z.object({
      note: z
        .string()
        .describe(
          "The observation or preference to remember. Be specific and concise.",
        ),
    }),
    execute: async ({ note }: { note: string }) => {
      const inboxPath = path.join(homedir(), ".scholarOS", "memory", "inbox.md");
      const dir = path.dirname(inboxPath);
      await fs.mkdir(dir, { recursive: true });

      const timestamp = new Date().toISOString();
      const entry = `\n- [${timestamp}] ${note}\n`;

      await fs.appendFile(inboxPath, entry, "utf-8");

      return {
        success: true,
        message: `Saved to memory: ${note}`,
      };
    },
  },

  // ========================================================================
  // Anki / Flashcard Tools
  // ========================================================================

  "anki-checkConnect": {
    description:
      "Check if Anki is running with AnkiConnect add-on installed. Returns true if AnkiConnect is reachable at localhost:8765. Always call this first before using other anki-* tools.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const connected = await anki.checkConnect();
        return { connected };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
          hint: "Make sure Anki is running and the AnkiConnect add-on (code 2055492159) is installed.",
        };
      }
    },
  },

  "anki-deckNames": {
    description: "List all Anki deck names. Returns an array of deck names.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const names = await anki.deckNames();
        return { deckNames: names, count: names.length };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "anki-createDeck": {
    description: "Create a new Anki deck with the given name.",
    inputSchema: z.object({
      deck: z.string().min(1).describe("Name of the deck to create (e.g., 'Computer Science::Algorithms')"),
    }),
    execute: async ({ deck }: { deck: string }) => {
      try {
        await anki.createDeck(deck);
        return { success: true, deck };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "anki-modelNames": {
    description: "List all available Anki note types (models) like 'Basic', 'Cloze', 'Basic (and reversed card)', etc. Use this to discover what note types are available before adding cards.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const names = await anki.modelNames();
        return { modelNames: names, count: names.length };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "anki-modelFieldNames": {
    description: "Get the field names for a specific Anki note type. Use this before adding cards to know what fields to fill.",
    inputSchema: z.object({
      modelName: z.string().min(1).describe("The note type name (e.g., 'Basic', 'Cloze')"),
    }),
    execute: async ({ modelName }: { modelName: string }) => {
      try {
        const fields = await anki.modelFieldNames(modelName);
        return { modelName, fields };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "anki-addNotes": {
    description:
      "Add multiple flashcard notes to Anki in a single batch. Each note requires deckName, modelName, and fields. Use 'anki-modelNames' first to discover available note types, then 'anki-modelFieldNames' to see which fields each type needs. Standard 'Basic' type has 'Front' and 'Back' fields. 'Cloze' type has 'Text' and 'Back Extra' fields.",
    inputSchema: z.object({
      notes: z
        .array(
          z.object({
            deckName: z.string().min(1).describe("Target deck name"),
            modelName: z.string().min(1).describe("Note type (e.g., 'Basic', 'Cloze')"),
            fields: z
              .record(z.string(), z.string())
              .describe("Field values (e.g., {'Front': 'question', 'Back': 'answer'} for Basic type)"),
            tags: z
              .array(z.string())
              .optional()
              .describe("Optional tags to add to the note"),
          }),
        )
        .min(1)
        .max(100)
        .describe("Array of notes to create (1-100)"),
    }),
    execute: async ({
      notes,
    }: {
      notes: Array<{
        deckName: string;
        modelName: string;
        fields: Record<string, string>;
        tags?: string[];
      }>;
    }) => {
      try {
        const result = await anki.addNotes(notes);
        // result is an array of note IDs (null for failed)
        const succeeded = result.filter((id) => id !== null).length;
        const failed = result.filter((id) => id === null).length;
        return {
          success: true,
          noteIds: result,
          total: result.length,
          succeeded,
          failed,
          message: `Added ${succeeded}/${result.length} notes to Anki${failed > 0 ? ` (${failed} failed — likely duplicates)` : ""}.`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "anki-canAddNotes": {
    description:
      "Check if notes can be added to Anki without creating duplicates. Returns an array of booleans matching the input order. Use this before 'anki-addNotes' to preview which notes are new and which already exist.",
    inputSchema: z.object({
      notes: z
        .array(
          z.object({
            deckName: z.string().min(1),
            modelName: z.string().min(1),
            fields: z.record(z.string(), z.string()),
            tags: z.array(z.string()).optional(),
          }),
        )
        .min(1)
        .max(100),
    }),
    execute: async ({
      notes,
    }: {
      notes: Array<{
        deckName: string;
        modelName: string;
        fields: Record<string, string>;
        tags?: string[];
      }>;
    }) => {
      try {
        const result = await anki.canAddNotes(notes);
        const addable = result.filter(Boolean).length;
        return {
          results: result,
          addable,
          total: result.length,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  // ========================================================================
  // Composio Meta-Tools
  // ========================================================================

  "composio-list-toolkits": {
    description:
      "List available Composio integrations (Gmail, Slack, GitHub, etc.) and their connection status. Use this to show the user what services they can connect to.",
    inputSchema: z.object({
      category: z
        .enum([
          "all",
          "communication",
          "productivity",
          "development",
          "crm",
          "social",
          "storage",
          "support",
        ])
        .optional()
        .describe('Filter by category. Defaults to "all".'),
    }),
    execute: async ({ category }: { category?: string }) => {
      const toolkits = CURATED_TOOLKITS.filter(
        (t) => !category || category === "all" || t.category === category,
      ).map((t) => ({
        slug: t.slug,
        name: t.displayName,
        category: t.category,
        isConnected: composioAccountsRepo.isConnected(t.slug),
      }));

      const connectedCount = toolkits.filter((t) => t.isConnected).length;
      return {
        toolkits,
        connectedCount,
        totalCount: toolkits.length,
      };
    },
    isAvailable: async () => isComposioConfigured(),
  },

  "composio-search-tools": {
    description:
      'Search for Composio tools by use case across connected services. Returns tool slugs, descriptions, and input schemas so you can call composio-execute-tool with the right parameters. Example: search "send email" to find Gmail tools, "create issue" to find GitHub/Jira tools.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Natural language description of what you want to do (e.g., "send an email", "create a GitHub issue", "schedule a meeting")',
        ),
      toolkitSlug: z
        .string()
        .optional()
        .describe(
          'Optional: limit search to a specific toolkit (e.g., "gmail", "github")',
        ),
    }),
    execute: async ({
      query,
      toolkitSlug,
    }: {
      query: string;
      toolkitSlug?: string;
    }) => {
      try {
        const toolkitFilter = toolkitSlug ? [toolkitSlug] : undefined;
        const result = await searchComposioTools(query, toolkitFilter);

        // Filter to curated toolkits only (skip if a specific toolkit was requested —
        // the API already filtered server-side)
        const filtered = toolkitSlug
          ? result.items
          : result.items.filter((t) =>
              CURATED_TOOLKIT_SLUGS.has(t.toolkitSlug),
            );

        // Annotate with connection status
        const tools = filtered.map((t) => ({
          slug: t.slug,
          name: t.name,
          description: t.description,
          toolkitSlug: t.toolkitSlug,
          isConnected: composioAccountsRepo.isConnected(t.toolkitSlug),
          inputSchema: t.inputParameters,
        }));

        return {
          tools,
          resultCount: tools.length,
          hint: tools.some((t) => !t.isConnected)
            ? "Some tools require connecting the toolkit first. Use composio-connect-toolkit to help the user authenticate."
            : undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { tools: [], resultCount: 0, error: message };
      }
    },
    isAvailable: async () => isComposioConfigured(),
  },

  "composio-execute-tool": {
    description:
      'Execute a Composio tool by its slug. You MUST pass the arguments field with all required parameters from the search results inputSchema. Example: composio-execute-tool({ toolSlug: "GITHUB_ISSUES_LIST_FOR_REPO", toolkitSlug: "github", arguments: { owner: "scholaroslabs", repo: "scholaros", state: "open", per_page: 100 } })',
    inputSchema: z.object({
      toolSlug: z
        .string()
        .describe(
          'EXACT tool slug from search results (e.g., "GITHUB_ISSUES_LIST_FOR_REPO"). Copy it exactly — do not modify it.',
        ),
      toolkitSlug: z
        .string()
        .describe('The toolkit slug (e.g., "gmail", "github")'),
      arguments: z
        .record(z.string(), z.unknown())
        .describe(
          "REQUIRED: Tool input parameters as key-value pairs. Get the required fields from the inputSchema returned by composio-search-tools. Never omit this.",
        ),
    }),
    execute: async ({
      toolSlug,
      toolkitSlug,
      arguments: args,
    }: {
      toolSlug: string;
      toolkitSlug: string;
      arguments?: Record<string, unknown>;
    }) => {
      // Default arguments to {} if the LLM omits the field entirely
      const toolArgs = args ?? {};

      // Check connection
      const account = composioAccountsRepo.getAccount(toolkitSlug);
      if (!account || account.status !== "ACTIVE") {
        return {
          successful: false,
          data: null,
          error: `Toolkit "${toolkitSlug}" is not connected. Use composio-connect-toolkit to help the user connect it first.`,
        };
      }

      try {
        return await executeComposioAction(toolSlug, {
          connected_account_id: account.id,
          user_id: "scholaros-user",
          version: "latest",
          arguments: toolArgs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[Composio] Tool execution failed for ${toolSlug}:`,
          message,
        );
        return {
          successful: false,
          data: null,
          error: `Failed to execute ${toolSlug}: ${message}. If fields are missing, check the inputSchema and retry with the correct arguments.`,
        };
      }
    },
    isAvailable: async () => isComposioConfigured(),
  },

  "composio-connect-toolkit": {
    description:
      "Connect a Composio service (Gmail, Slack, GitHub, etc.) via OAuth. Shows a connect card for the user to authenticate.",
    inputSchema: z.object({
      toolkitSlug: z
        .string()
        .describe(
          'The toolkit slug to connect (e.g., "gmail", "github", "slack", "notion")',
        ),
    }),
    execute: async ({ toolkitSlug }: { toolkitSlug: string }) => {
      // Validate against curated list
      if (!CURATED_TOOLKIT_SLUGS.has(toolkitSlug)) {
        const available = CURATED_TOOLKITS.map(
          (t) => `${t.slug} (${t.displayName})`,
        ).join(", ");
        return {
          success: false,
          error: `Unknown toolkit "${toolkitSlug}". Available toolkits: ${available}`,
        };
      }

      // Check if already connected
      if (composioAccountsRepo.isConnected(toolkitSlug)) {
        return {
          success: true,
          message: `${toolkitSlug} is already connected. You can search for and execute its tools.`,
          alreadyConnected: true,
        };
      }

      // Return signal — the UI renders a ComposioConnectCard with a Connect button.
      // OAuth only starts when the user clicks that button.
      const toolkit = CURATED_TOOLKITS.find((t) => t.slug === toolkitSlug);
      return {
        success: true,
        message: `Please connect ${toolkit?.displayName ?? toolkitSlug} to continue.`,
      };
    },
    isAvailable: async () => isComposioConfigured(),
  },

  // ── Task Tools ───────────────────────────────────────────────────────────────

  "tasks-list": {
    description:
      "List all tasks (manual + from MD file frontmatter). Returns tasks sorted by due date. Use to check deadlines, assignments, and upcoming tasks. Filter by status (pending/done), date range, or type.",
    inputSchema: z.object({
      startDate: z
        .string()
        .optional()
        .describe("Filter start date (YYYY-MM-DD). Defaults to no lower bound."),
      endDate: z
        .string()
        .optional()
        .describe("Filter end date (YYYY-MM-DD). Defaults to no upper bound."),
      status: z
        .enum(["pending", "done"])
        .optional()
        .describe("Filter by task status."),
      type: z
        .enum(["manual", "assignment", "lecture", "deadline", "custom"])
        .optional()
        .describe("Filter by task type."),
    }),
    execute: async ({
      startDate,
      endDate,
      status,
      type,
    }: {
      startDate?: string;
      endDate?: string;
      status?: string;
      type?: string;
    }) => {
      try {
        const { getMergedTasks } = await import(
          "../../calendar/frontmatter-scanner.js"
        );
        let tasks = await getMergedTasks();

        if (startDate) tasks = tasks.filter((t) => t.due >= startDate);
        if (endDate) tasks = tasks.filter((t) => t.due <= endDate);
        if (status) tasks = tasks.filter((t) => t.status === status);
        if (type) tasks = tasks.filter((t) => t.type === type);

        return { tasks, count: tasks.length };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "tasks-create": {
    description:
      "Create a new task. Parse natural language like 'assignment due May 12' into structured fields before calling this tool.",
    inputSchema: z.object({
      title: z.string().min(1).describe("Task title"),
      due: z.string().describe("Due date in YYYY-MM-DD format"),
      dueTime: z
        .string()
        .optional()
        .describe("Optional time in HH:mm format (24-hour)"),
      type: z
        .enum(["manual", "assignment", "lecture", "deadline", "custom"])
        .default("manual")
        .describe("Task type"),
      description: z
        .string()
        .optional()
        .describe("Optional description or notes"),
    }),
    execute: async ({
      title,
      due,
      dueTime,
      type,
      description,
    }: {
      title: string;
      due: string;
      dueTime?: string;
      type?: string;
      description?: string;
    }) => {
      try {
        const { getTaskRepo } = await import("../../calendar/repo.js");
        const repo = getTaskRepo();
        const task = await repo.create({
          title,
          due,
          dueTime,
          type: (type as "manual" | "assignment" | "lecture" | "deadline" | "custom") || "manual",
          description,
        });
        return {
          success: true,
          task,
          message: `Created "${title}" due ${due}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "tasks-complete": {
    description: "Mark a task as done by its ID.",
    inputSchema: z.object({
      id: z.string().describe("The task ID to mark as done"),
    }),
    execute: async ({ id }: { id: string }) => {
      try {
        const { getTaskRepo } = await import("../../calendar/repo.js");
        const repo = getTaskRepo();
        const task = await repo.complete(id);
        return {
          success: true,
          task,
          message: `Marked "${task.title}" as done`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },

  "tasks-delete": {
    description: "Delete a task by its ID.",
    inputSchema: z.object({
      id: z.string().describe("The task ID to delete"),
    }),
    execute: async ({ id }: { id: string }) => {
      try {
        const { getTaskRepo } = await import("../../calendar/repo.js");
        const repo = getTaskRepo();
        await repo.delete(id);
        return { success: true, message: `Deleted task ${id}` };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  },
  "deep-research": {
    description: "Perform deep multi-round academic research on a topic. Use for complex questions requiring synthesis from multiple sources. Returns immediately with a sessionId — the user tracks progress in the Deep Research panel.",
    inputSchema: z.object({
      query: z.string().describe("The research question or topic to investigate"),
      category: z.enum(["literature-review", "compare-contrast", "methodology", "fact-check", "concept-exploration", "problem-solving"]).optional().describe("Academic category for the research"),
      rounds: z.number().int().min(2).max(12).optional().default(6).describe("Number of research rounds (more = deeper but slower)"),
    }),
    execute: async (input: { query: string; category?: string; rounds?: number }) => {
      try {
        const { ResearchHandler } = await import("../../research/research-handler.js");
        const handler = new ResearchHandler(() => {});
        const sessionId = await handler.startResearch(input.query, input.category as any, { rounds: input.rounds });
        return {
          sessionId,
          message: `Started deep research on "${input.query}". Track progress in the Deep Research panel.`,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Failed to start research",
          message: "Failed to start research. Please try again or check model configuration.",
        };
      }
    },
    isAvailable: async () => true,
  },
};
