import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { embedMany } from "ai";
import { createProvider } from "../models/models.js";
import {
  getDefaultModelAndProvider,
  resolveProviderConfig,
} from "../models/defaults.js";
import container from "../di/container.js";
import type { IModelConfigRepo } from "../models/repo.js";

export interface PdfChunkEmbedding {
  index: number;
  text: string;
  embedding: number[];
  source: "provider" | "hashed";
}

export interface PdfEmbeddingDocument {
  filepath: string;
  filename: string;
  title?: string;
  pageCount: number;
  updatedAt: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  chunks: PdfChunkEmbedding[];
}

export interface PdfEmbeddingIndex {
  courseId: string;
  updatedAt: string;
  documents: PdfEmbeddingDocument[];
}

const DEFAULT_EMBEDDING_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: "text-embedding-3-small",
  "openai-compatible": "text-embedding-3-small",
  openrouter: "text-embedding-3-small",
  aigateway: "text-embedding-3-small",
  rowboat: "text-embedding-3-small",
  google: "text-embedding-004",
  ollama: "nomic-embed-text",
};

function sanitizeCourseId(courseId: string): string {
  return courseId.trim().replace(/[/\\?%*:|"<>]/g, "-");
}

function toNumberArray(embedding: unknown): number[] {
  if (Array.isArray(embedding)) {
    return embedding.map((value) => Number(value));
  }

  if (ArrayBuffer.isView(embedding)) {
    return Array.from(embedding as unknown as ArrayLike<number>, (value) =>
      Number(value),
    );
  }

  return [];
}

function normalizeEmbeddingVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

function hashedEmbedding(text: string, dimensions = 256): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? [];

  for (const token of tokens) {
    const digest = crypto.createHash("sha256").update(token).digest();
    const index = digest.readUInt32LE(0) % dimensions;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  return normalizeEmbeddingVector(vector);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function embeddingModelCandidates(
  providerFlavor: string,
  configuredModels: string[] | undefined,
): string[] {
  const envModel = process.env.ROWBOAT_EMBEDDING_MODEL?.trim();
  const providerDefaults = DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[providerFlavor]
    ? [DEFAULT_EMBEDDING_MODEL_BY_PROVIDER[providerFlavor]]
    : [];
  const configuredEmbeddings = (configuredModels ?? []).filter((model) =>
    /embed|embedding/i.test(model),
  );

  return unique([
    ...(envModel ? [envModel] : []),
    ...configuredEmbeddings,
    ...providerDefaults,
  ]);
}

export async function embedPdfChunks(chunks: string[]): Promise<{
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddings: PdfChunkEmbedding[];
}> {
  if (chunks.length === 0) {
    return { embeddings: [] };
  }

  const { provider: providerName } = await getDefaultModelAndProvider();
  const repo = container.resolve<IModelConfigRepo>("modelConfigRepo");
  const config = await repo.getConfig();
  const providerModels =
    config.providers?.[providerName]?.models ??
    (config.provider.flavor === providerName ? config.models : undefined);
  const candidates = embeddingModelCandidates(providerName, providerModels);
  const providerConfig = await resolveProviderConfig(providerName);
  const provider = createProvider(providerConfig);

  for (const candidate of candidates) {
    try {
      const model = provider.textEmbeddingModel(candidate);
      const result = await embedMany({ model, values: chunks });
      return {
        embeddingProvider: providerName,
        embeddingModel: candidate,
        embeddings: result.embeddings.map((embedding, index) => ({
          index,
          text: chunks[index],
          embedding: normalizeEmbeddingVector(toNumberArray(embedding)),
          source: "provider",
        })),
      };
    } catch {
      // Try the next candidate.
    }
  }

  return {
    embeddingProvider: providerName,
    embeddingModel: undefined,
    embeddings: chunks.map((chunk, index) => ({
      index,
      text: chunk,
      embedding: hashedEmbedding(chunk),
      source: "hashed",
    })),
  };
}

export class PdfEmbeddingStore {
  constructor(private knowledgeBaseDir: string) {}

  private getCourseEmbeddingPath(courseId: string): string {
    const normalizedCourse = sanitizeCourseId(courseId);
    return path.join(
      this.knowledgeBaseDir,
      "courses",
      normalizedCourse,
      "pdf-embeddings.json",
    );
  }

  async upsertDocument(
    courseId: string,
    document: PdfEmbeddingDocument,
  ): Promise<string> {
    const filePath = this.getCourseEmbeddingPath(courseId);
    const index = await this.load(courseId);

    const nextDocuments = index.documents.filter(
      (existing) => existing.filepath !== document.filepath,
    );
    nextDocuments.push(document);

    const nextIndex: PdfEmbeddingIndex = {
      courseId,
      updatedAt: new Date().toISOString(),
      documents: nextDocuments,
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(nextIndex, null, 2), "utf8");
    return filePath;
  }

  async load(courseId: string): Promise<PdfEmbeddingIndex> {
    const filePath = this.getCourseEmbeddingPath(courseId);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as PdfEmbeddingIndex;
      return {
        courseId: parsed.courseId ?? courseId,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      };
    } catch {
      return {
        courseId,
        updatedAt: new Date().toISOString(),
        documents: [],
      };
    }
  }
}
