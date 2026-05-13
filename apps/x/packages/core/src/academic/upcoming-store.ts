import { promises as fs } from "node:fs";
import path from "node:path";
import type { UpcomingTask, UpcomingTaskStore } from "@x/shared/dist/academic.js";

const STORE_VERSION = 1;
const STORE_FILENAME = "upcoming.json";
const TASKS_DIR = "tasks";

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `task-${ts}-${rand}`;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function generateSlug(title: string): string {
  const base = slugify(title) || "task";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

function formatMdFrontmatter(task: UpcomingTask): string {
  const lines = ["---"];
  const fields: Record<string, string | undefined> = {
    id: task.id,
    title: task.title,
    courseId: task.courseId,
    dueDate: task.dueDate,
    status: task.status,
    priority: task.priority,
    source: task.source,
    sourceFile: task.sourceFile,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) lines.push(`${key}: ${val}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function formatMdBody(task: UpcomingTask): string {
  const lines: string[] = [];
  lines.push(`# ${task.title}`, "");
  lines.push(`**Course:** ${task.courseId}`, "");
  lines.push(`**Due:** ${new Date(task.dueDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`, "");
  const statusLabels: Record<string, string> = {
    "not-started": "⏳ Not started",
    "in-progress": "🔄 In progress",
    "submitted": "✅ Submitted",
    "graded": "📊 Graded",
  };
  lines.push(`**Status:** ${statusLabels[task.status] ?? task.status}`, "");
  if (task.description) lines.push("", task.description, "");
  if (task.notes) lines.push("", "---", "", task.notes, "");
  if (task.sourceFile) {
    lines.push("", "---", "", `_Detected from: \`${task.sourceFile}\`_`, "");
  }
  lines.push("");
  return lines.join("\n");
}

export class UpcomingStore {
  constructor(private knowledgeDir: string) {}

  private get storePath(): string {
    return path.join(this.knowledgeDir, STORE_FILENAME);
  }

  private get tasksDir(): string {
    return path.join(this.knowledgeDir, TASKS_DIR);
  }

  private mdPath(slug: string): string {
    return path.join(this.tasksDir, `${slug}.md`);
  }

  async listTasks(courseId?: string, status?: UpcomingTask["status"]): Promise<UpcomingTask[]> {
    const store = await this.readStore();
    let tasks = store.tasks;
    if (courseId) tasks = tasks.filter((t) => t.courseId === courseId);
    if (status) tasks = tasks.filter((t) => t.status === status);
    return tasks;
  }

  async createTask(input: {
    courseId: string;
    title: string;
    description?: string;
    dueDate: string;
    status?: UpcomingTask["status"];
    priority?: UpcomingTask["priority"];
    source: UpcomingTask["source"];
    sourceFile?: string;
    notes?: string;
  }): Promise<UpcomingTask> {
    const store = await this.readStore();
    const now = new Date().toISOString();
    const slug = generateSlug(input.title);

    const task: UpcomingTask = {
      id: generateId(),
      courseId: input.courseId,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      status: input.status ?? "not-started",
      priority: input.priority ?? "medium",
      source: input.source,
      sourceFile: input.sourceFile,
      notes: input.notes,
      mdPath: `knowledge/tasks/${slug}.md`,
      createdAt: now,
      updatedAt: now,
    };

    store.tasks.push(task);
    await this.writeStore(store);
    await this.writeMdFile(task, slug);
    return task;
  }

  async updateTask(taskId: string, updates: Partial<UpcomingTask>): Promise<UpcomingTask | null> {
    const store = await this.readStore();
    const idx = store.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;

    const updated: UpcomingTask = {
      ...store.tasks[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    store.tasks[idx] = updated;
    await this.writeStore(store);
    const slug = path.basename(updated.mdPath, ".md");
    await this.writeMdFile(updated, slug);
    return updated;
  }

  async createFromIngest(
    tasks: Array<{
      title: string;
      courseId: string;
      dueDate: string;
      description?: string;
      priority?: UpcomingTask["priority"];
      sourceFile?: string;
      notes?: string;
    }>,
  ): Promise<{ created: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;
    for (const input of tasks) {
      try {
        await this.createTask({
          ...input,
          source: "ingest",
          status: "not-started",
        });
        created++;
      } catch (err) {
        errors.push(`Failed to create "${input.title}": ${err}`);
      }
    }
    return { created, errors };
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const store = await this.readStore();
    const idx = store.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;

    const task = store.tasks[idx];
    store.tasks.splice(idx, 1);
    await this.writeStore(store);

    try {
      await fs.unlink(this.mdPath(path.basename(task.mdPath, ".md")));
    } catch {
      // MD file may not exist; ignore
    }
    return true;
  }

  private async readStore(): Promise<UpcomingTaskStore> {
    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw) as UpcomingTaskStore;
      return {
        version: parsed.version ?? STORE_VERSION,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      };
    } catch {
      return { version: STORE_VERSION, tasks: [] };
    }
  }

  private async writeStore(data: UpcomingTaskStore): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(data, null, 2), "utf8");
  }

  private async writeMdFile(task: UpcomingTask, slug: string): Promise<void> {
    const mdPath = this.mdPath(slug);
    await fs.mkdir(path.dirname(mdPath), { recursive: true });
    const content = formatMdFrontmatter(task) + formatMdBody(task);
    await fs.writeFile(mdPath, content, "utf8");
  }
}
