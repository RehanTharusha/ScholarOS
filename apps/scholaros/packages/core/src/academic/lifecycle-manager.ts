import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { hashedEmbedding, cosineSimilarity } from "./file-classifier.js";
import { getMergedTasks } from "../calendar/frontmatter-scanner.js";

export type Lifecycle = "fresh" | "needs-review" | "stale";

const SEMESTER_CONFIG_PATH = ".scholarOS/current-semester.json";
const EXAM_KEYWORDS = ["exam", "test", "midterm", "final", "assessment", "quiz"];
const OVERLAP_THRESHOLD = 0.3;

interface PageMetadata {
  lifecycle?: Lifecycle;
  semester?: string;
  course?: string;
  title?: string;
}

interface ConceptPageEntry {
  relativePath: string;
  metadata: PageMetadata;
}

const EXAM_EXTRACT_PATTERNS = [
  /^(.+?)\s+\d{3,4}\b/,
  /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
];

export async function readPageMetadata(
  vaultPath: string,
  pagePath: string,
): Promise<PageMetadata> {
  const absPath = path.join(vaultPath, pagePath);
  try {
    const content = await fs.readFile(absPath, "utf-8");
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return {};

    const fm = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
    return {
      lifecycle: fm.lifecycle as Lifecycle,
      semester: fm.semester as string,
      course: fm.course as string,
      title: fm.title as string,
    };
  } catch {
    return {};
  }
}

export async function updatePageLifecycle(
  vaultPath: string,
  pagePath: string,
  lifecycle: Lifecycle,
): Promise<boolean> {
  const absPath = path.join(vaultPath, pagePath);
  try {
    const content = await fs.readFile(absPath, "utf-8");
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return false;

    const fm = parseYaml(frontmatterMatch[1]) as Record<string, unknown>;
    fm.lifecycle = lifecycle;
    fm.lastUpdated = new Date().toISOString();

    const newFrontmatter = stringifyYaml(fm).trim();
    const newContent = content.replace(
      /^---\n[\s\S]*?\n---/,
      `---\n${newFrontmatter}\n---`,
    );
    await fs.writeFile(absPath, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function getCurrentSemester(vaultPath: string): Promise<string> {
  const configPath = path.join(vaultPath, SEMESTER_CONFIG_PATH);
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    return config.semester || "unknown";
  } catch {
    return "unknown";
  }
}

async function findAllConceptPages(vaultPath: string): Promise<ConceptPageEntry[]> {
  const coursesDir = path.join(vaultPath, "courses");
  const entries: ConceptPageEntry[] = [];

  try {
    const courseDirs = await fs.readdir(coursesDir, { withFileTypes: true });
    for (const courseDir of courseDirs) {
      if (!courseDir.isDirectory()) continue;
      const conceptDir = path.join(coursesDir, courseDir.name, "concepts");
      try {
        const files = await fs.readdir(conceptDir);
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          const relativePath = `courses/${courseDir.name}/concepts/${file}`;
          const metadata = await readPageMetadata(vaultPath, relativePath);
          entries.push({ relativePath, metadata });
        }
      } catch {
        // No concepts folder yet
      }
    }
  } catch {
    // No courses folder yet
  }

  return entries;
}

export async function flagOverlappingPages(
  vaultPath: string,
  newSourceContent: string,
  courseName: string,
): Promise<number> {
  const newEmbedding = hashedEmbedding(newSourceContent);
  const conceptDir = path.join(vaultPath, "courses", courseName, "concepts");
  let flagged = 0;

  try {
    const files = await fs.readdir(conceptDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(conceptDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const pageEmbedding = hashedEmbedding(content);
      const similarity = cosineSimilarity(newEmbedding, pageEmbedding);

      if (similarity > OVERLAP_THRESHOLD) {
        const relativePath = `courses/${courseName}/concepts/${file}`;
        const metadata = await readPageMetadata(vaultPath, relativePath);
        if (metadata.lifecycle === "fresh") {
          await updatePageLifecycle(vaultPath, relativePath, "needs-review");
          flagged++;
        }
      }
    }
  } catch {
    // No concepts folder yet
  }

  return flagged;
}

export async function refreshLifecycles(vaultPath: string): Promise<{
  markedStale: number;
  markedNeedsReview: number;
  totalExamApproaching: number;
}> {
  const currentSemester = await getCurrentSemester(vaultPath);
  const pages = await findAllConceptPages(vaultPath);

  let markedStale = 0;
  let markedNeedsReview = 0;

  for (const page of pages) {
    if (
      page.metadata.lifecycle === "fresh" &&
      page.metadata.semester &&
      page.metadata.semester !== currentSemester
    ) {
      await updatePageLifecycle(vaultPath, page.relativePath, "stale");
      markedStale++;
    }
  }

  let totalExamApproaching = 0;
  try {
    const tasks = await getMergedTasks();
    const todayMs = Date.now();

    const examTasks = tasks.filter((t) => {
      const title = t.title.toLowerCase();
      return EXAM_KEYWORDS.some((k) => title.includes(k));
    });

    for (const exam of examTasks) {
      const examDateMs = new Date(exam.due).getTime();
      const daysUntil = Math.ceil((examDateMs - todayMs) / 86400000);

      if (daysUntil >= 0 && daysUntil <= 14) {
        totalExamApproaching++;
        const examCourse = extractCourseFromTaskName(exam.title);

        for (const page of pages) {
          if (
            page.metadata.lifecycle === "stale" &&
            page.metadata.course &&
            examCourse &&
            page.metadata.course.toLowerCase().includes(examCourse.toLowerCase())
          ) {
            await updatePageLifecycle(vaultPath, page.relativePath, "needs-review");
            markedNeedsReview++;
          }
        }
      }
    }
  } catch {
    // Calendar not available
  }

  return { markedStale, markedNeedsReview, totalExamApproaching };
}

export async function runPreExamLint(vaultPath: string): Promise<{
  refreshed: number;
  examsFound: number;
}> {
  let refreshed = 0;
  let examsFound = 0;

  try {
    const tasks = await getMergedTasks();
    const todayMs = Date.now();

    const examTasks = tasks.filter((t) => {
      const title = t.title.toLowerCase();
      return EXAM_KEYWORDS.some((k) => title.includes(k));
    });

    for (const exam of examTasks) {
      const examDateMs = new Date(exam.due).getTime();
      const daysUntil = Math.ceil((examDateMs - todayMs) / 86400000);

      if (daysUntil >= 0 && daysUntil <= 14) {
        examsFound++;
        const examCourse = extractCourseFromTaskName(exam.title);
        if (!examCourse) continue;

        const pages = await findAllConceptPages(vaultPath);
        for (const page of pages) {
          if (
            page.metadata.course &&
            page.metadata.course.toLowerCase().includes(examCourse.toLowerCase()) &&
            page.metadata.lifecycle === "stale"
          ) {
            await updatePageLifecycle(vaultPath, page.relativePath, "needs-review");
            refreshed++;
          }
        }
      }
    }
  } catch {
    // Calendar not available
  }

  return { refreshed, examsFound };
}

function extractCourseFromTaskName(title: string): string | null {
  let cleaned = title;
  for (const phrase of [...EXAM_KEYWORDS].sort((a, b) => b.length - a.length)) {
    const idx = cleaned.toLowerCase().indexOf(phrase);
    if (idx !== -1) {
      cleaned = cleaned.substring(0, idx).trim();
      break;
    }
  }

  for (const pattern of EXAM_EXTRACT_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) return match[1].trim();
  }

  return cleaned.length > 0 ? cleaned : null;
}
