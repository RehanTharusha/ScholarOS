/**
 * Local embedding-based file classifier.
 *
 * Classifies files into course folders using cosine similarity
 * against existing course material embeddings. Zero API calls,
 * runs entirely on local hardware.
 *
 * Strategy:
 * 1. Build a centroid embedding for each known course from its concept pages and PDF embeddings
 * 2. Embed the new file's content (hashed embedding for speed, or Ollama if available)
 * 3. Compare against course centroids via cosine similarity
 * 4. Return best match, or flag as new course if below threshold
 */

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CourseCandidate {
  courseId: string;
  courseName: string;
  similarity: number;
}

export interface FileClassification {
  /** Best matching course, or null if no match above threshold */
  course: CourseCandidate | null;
  /** Whether this file likely belongs to a new course */
  isNewCourse: boolean;
  /** Suggested course name if isNewCourse is true (derived from filename) */
  suggestedNewCourse?: string;
  /** All candidates sorted by similarity (descending) */
  allCandidates: CourseCandidate[];
}

const SIMILARITY_THRESHOLD = 0.15;
const HASHED_DIMENSIONS = 512;

/**
 * Generate a deterministic embedding from text using token hashing.
 * Fast, zero dependencies, runs in <1ms. Good enough for course-level classification
 * because academic subjects have distinct vocabulary distributions.
 */
function hashedEmbedding(text: string, dimensions = HASHED_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? [];

  for (const token of tokens) {
    const digest = crypto.createHash("sha256").update(token).digest();
    const index = digest.readUInt32LE(0) % dimensions;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  return normalizeVector(vector);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (!magnitude) return vector;
  return vector.map((v) => v / magnitude);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Try to get a real embedding from Ollama if available.
 * Falls back to hashed embedding if Ollama isn't running or model isn't installed.
 */
async function tryOllamaEmbedding(text: string): Promise<number[] | null> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-s",
        "-X", "POST",
        "http://localhost:11434/api/embeddings",
        "-H", "Content-Type: application/json",
        "-d", JSON.stringify({
          model: "nomic-embed-text",
          prompt: text,
        }),
      ],
      { timeout: 5000 },
    );
    const result = JSON.parse(stdout);
    if (result.embedding && Array.isArray(result.embedding)) {
      return normalizeVector(result.embedding);
    }
  } catch {
    // Ollama not available or model not installed
  }
  return null;
}

/**
 * Embed text, preferring Ollama for quality but falling back to hashed for speed.
 */
async function embedText(text: string): Promise<number[]> {
  const ollama = await tryOllamaEmbedding(text);
  if (ollama) return ollama;
  return hashedEmbedding(text);
}

interface CourseProfile {
  courseId: string;
  courseName: string;
  centroid: number[];
  docCount: number;
}

/**
 * Scan the knowledge base and build embedding centroids for each course.
 * Centroids are averaged from all concept pages in the course.
 */
async function buildCourseProfiles(knowledgeDir: string): Promise<CourseProfile[]> {
  const coursesDir = path.join(knowledgeDir, "courses");
  try {
    const entries = await fs.readdir(coursesDir, { withFileTypes: true });
    const courses = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const profiles: CourseProfile[] = [];

    for (const courseName of courses) {
      const conceptDir = path.join(coursesDir, courseName, "concepts");
      const allText: string[] = [];

      // Read concept pages
      try {
        const conceptFiles = await fs.readdir(conceptDir);
        for (const file of conceptFiles) {
          if (file.endsWith(".md")) {
            const content = await fs.readFile(path.join(conceptDir, file), "utf8");
            allText.push(content);
          }
        }
      } catch {
        // No concepts folder yet
      }

      // Read PDF embeddings if they exist
      try {
        const pdfEmbPath = path.join(coursesDir, courseName, "pdf-embeddings.json");
        const raw = await fs.readFile(pdfEmbPath, "utf8");
        const pdfIndex = JSON.parse(raw) as { documents: Array<{ chunks: Array<{ text: string }> }> };
        for (const doc of pdfIndex.documents ?? []) {
          for (const chunk of doc.chunks ?? []) {
            allText.push(chunk.text);
          }
        }
      } catch {
        // No PDF embeddings yet
      }

      if (allText.length === 0) continue;

      // Build centroid by averaging embeddings
      const combined = allText.join("\n");
      const centroid = await embedText(combined);

      profiles.push({
        courseId: courseName,
        courseName,
        centroid,
        docCount: allText.length,
      });
    }

    return profiles;
  } catch {
    return [];
  }
}

/**
 * Classify a file's content against known course profiles.
 */
export async function classifyFile(
  content: string,
  knowledgeDir: string,
): Promise<FileClassification> {
  const profiles = await buildCourseProfiles(knowledgeDir);

  // No courses yet — definitely a new course
  if (profiles.length === 0) {
    return {
      course: null,
      isNewCourse: true,
      suggestedNewCourse: undefined,
      allCandidates: [],
    };
  }

  const fileEmbedding = await embedText(content);

  const candidates: CourseCandidate[] = profiles.map((profile) => ({
    courseId: profile.courseId,
    courseName: profile.courseName,
    similarity: cosineSimilarity(fileEmbedding, profile.centroid),
  }));

  candidates.sort((a, b) => b.similarity - a.similarity);

  const best = candidates[0];
  const isNewCourse = best.similarity < SIMILARITY_THRESHOLD;

  return {
    course: isNewCourse ? null : best,
    isNewCourse,
    suggestedNewCourse: isNewCourse ? undefined : undefined,
    allCandidates: candidates,
  };
}

/**
 * Classify multiple files in batch. More efficient than calling classifyFile individually
 * because course profiles are built once and reused.
 */
export async function classifyFiles(
  files: Array<{ filepath: string; content: string }>,
  knowledgeDir: string,
): Promise<Array<{ filepath: string; classification: FileClassification }>> {
  const profiles = await buildCourseProfiles(knowledgeDir);

  const results: Array<{ filepath: string; classification: FileClassification }> = [];

  for (const file of files) {
    const fileEmbedding = await embedText(file.content);

    const candidates: CourseCandidate[] = profiles.map((profile) => ({
      courseId: profile.courseId,
      courseName: profile.courseName,
      similarity: cosineSimilarity(fileEmbedding, profile.centroid),
    }));

    candidates.sort((a, b) => b.similarity - a.similarity);

    const best = candidates[0];
    const isNewCourse = profiles.length === 0 || best.similarity < SIMILARITY_THRESHOLD;

    results.push({
      filepath: file.filepath,
      classification: {
        course: isNewCourse ? null : best,
        isNewCourse,
        allCandidates: candidates,
      },
    });
  }

  return results;
}

/**
 * Extract a suggested course name from a filename.
 * E.g., "lecture1.pdf" → undefined, "Biology 101 - Week 3.pdf" → "Biology 101"
 */
export function suggestCourseFromFilename(filename: string): string | undefined {
  const base = filename.replace(/\.[^.]+$/, "");
  const courseKeywords = "lecture|week|chapter|module|assignment|exam|quiz|midterm|final|notes|slides";
  const pattern = new RegExp(`^([A-Za-z][A-Za-z0-9\\s]+?)(?:\\s*[-_–—]\\s|\\s+(?:${courseKeywords}))`, "i");
  const match = base.match(pattern);
  if (match) {
    const name = match[1].trim();
    if (name.length >= 3) return name;
  }
  return undefined;
}
