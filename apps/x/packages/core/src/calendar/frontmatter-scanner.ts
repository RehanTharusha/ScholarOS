import fs from "fs";
import path from "path";
import { WorkDir } from "../config/config.js";
import { frontmatter } from "@scholaros/shared";
import { Task, CreateTask } from "./types.js";
import { getTaskRepo, ITaskRepo } from "./repo.js";

function scanMdFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    if (entry.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);

    if (
      entry === ".knowledge-history" ||
      entry === ".trash" ||
      entry === "raw" ||
      entry === "meta" ||
      entry === "assets"
    ) {
      continue;
    }

    if (stat.isDirectory()) {
      files.push(...scanMdFiles(fullPath));
    } else if (stat.isFile() && entry.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  const bodyLines = content.split("\n").filter((l) => l.trim());
  return bodyLines[0]?.slice(0, 80) || "Untitled";
}

function extractDateFromFrontmatter(
  fields: Record<string, string | string[]>,
): string | null {
  const candidates = [
    "due",
    "date",
    "deadline",
    "exam_date",
    "due_date",
    "event_date",
  ];
  for (const key of candidates) {
    const val = fields[key];
    if (val && typeof val === "string") {
      const normalized = normalizeDate(val);
      if (normalized) return normalized;
    }
  }
  return null;
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.replace(/['"]/g, "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split("T")[0];
  }

  return null;
}

function determineTaskType(
  fields: Record<string, string | string[]>,
  filePath: string,
): Task["type"] {
  const relPath = path.relative(WorkDir, filePath);
  if (relPath.includes("/assignments/") || fields["type"] === "assignment")
    return "assignment";
  if (relPath.includes("/lectures/") || fields["type"] === "lecture")
    return "lecture";
  if (fields["due"] || fields["deadline"]) return "deadline";
  return "custom";
}

function deriveTitleFromPath(filePath: string): string {
  const basename = path.basename(filePath, ".md");
  return basename.replace(/[-_]/g, " ");
}

export interface FrontmatterTask {
  task: CreateTask;
  sourceFile: string;
}

export function scanFrontmatterForTasks(): FrontmatterTask[] {
  const mdFiles = scanMdFiles(WorkDir);
  const tasks: FrontmatterTask[] = [];

  for (const filePath of mdFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const { fields, body } = frontmatter.parseFrontmatter(content);

      const due = extractDateFromFrontmatter(fields);
      if (!due) continue;

      const title =
        (typeof fields["title"] === "string" ? fields["title"] : null) ||
        extractTitle(body) ||
        deriveTitleFromPath(filePath);

      const description =
        typeof fields["description"] === "string"
          ? fields["description"]
          : undefined;

      const taskType = determineTaskType(fields, filePath);

      tasks.push({
        task: {
          title,
          due,
          type: taskType,
          source: path.relative(WorkDir, filePath),
          description,
        },
        sourceFile: filePath,
      });
    } catch {
      // Skip files that can't be read or parsed
    }
  }

  return tasks;
}

/**
 * Merge frontmatter-scanned tasks with manually created tasks.
 * Frontmatter tasks are re-generated each time (source of truth is the file).
 * Manual tasks persist in tasks.json.
 */
export async function getMergedTasks(repo?: ITaskRepo): Promise<Task[]> {
  const taskRepo = repo || getTaskRepo();
  const allTasks = await taskRepo.list();
  const frontmatterTasks = scanFrontmatterForTasks();

  // Manual tasks (no source = user-created)
  const userTasks = allTasks.filter((t) => !t.source);

  // Frontmatter tasks get synthetic IDs based on source path
  const fmTasks: Task[] = frontmatterTasks.map((ft, i) => ({
    id: `fm_${ft.sourceFile}_${i}`,
    title: ft.task.title,
    due: ft.task.due,
    dueTime: ft.task.dueTime,
    type: ft.task.type,
    status: "pending" as const,
    source: ft.task.source,
    description: ft.task.description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  }));

  return [...userTasks, ...fmTasks].sort((a, b) => a.due.localeCompare(b.due));
}
