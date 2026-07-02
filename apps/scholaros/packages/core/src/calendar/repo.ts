import fs from "fs/promises";
import path from "path";
import { getScholarOSPath } from "../config/config.js";
import { Task, TaskSchema, CreateTask } from "./types.js";

export interface ITaskRepo {
  list(): Promise<Task[]>;
  listPending(): Promise<Task[]>;
  listInRange(startDate: string, endDate: string): Promise<Task[]>;
  create(task: CreateTask): Promise<Task>;
  update(task: Task): Promise<Task>;
  complete(id: string): Promise<Task>;
  delete(id: string): Promise<void>;
  getUpcoming(days?: number): Promise<Task[]>;
}

export class FSTaskRepo implements ITaskRepo {
  private get tasksPath(): string {
    return path.join(getScholarOSPath("calendar"), "tasks.json");
  }

  private async ensureFile(): Promise<void> {
    const dir = path.dirname(this.tasksPath);
    try {
      await fs.access(this.tasksPath);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.tasksPath, JSON.stringify([], null, 2));
    }
  }

  async list(): Promise<Task[]> {
    try {
      await this.ensureFile();
      const content = await fs.readFile(this.tasksPath, "utf8");
      const parsed = JSON.parse(content);
      return parsed.map((t: unknown) => TaskSchema.parse(t));
    } catch {
      return [];
    }
  }

  async listPending(): Promise<Task[]> {
    const all = await this.list();
    return all.filter((t) => t.status === "pending");
  }

  async listInRange(startDate: string, endDate: string): Promise<Task[]> {
    const all = await this.list();
    return all.filter((t) => t.due >= startDate && t.due <= endDate);
  }

  async create(task: CreateTask): Promise<Task> {
    const now = new Date().toISOString();
    const newTask: Task = {
      ...task,
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: task.status || "pending",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    const validated = TaskSchema.parse(newTask);
    const tasks = await this.list();
    tasks.push(validated);
    await this.save(tasks);
    return validated;
  }

  async update(task: Task): Promise<Task> {
    const tasks = await this.list();
    const idx = tasks.findIndex((t) => t.id === task.id);
    if (idx === -1) throw new Error(`Task not found: ${task.id}`);

    const updated: Task = {
      ...task,
      updatedAt: new Date().toISOString(),
    };
    const validated = TaskSchema.parse(updated);
    tasks[idx] = validated;
    await this.save(tasks);
    return validated;
  }

  async complete(id: string): Promise<Task> {
    const tasks = await this.list();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Task not found: ${id}`);

    const completed: Task = {
      ...tasks[idx],
      status: "done",
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const validated = TaskSchema.parse(completed);
    tasks[idx] = validated;
    await this.save(tasks);
    return validated;
  }

  async delete(id: string): Promise<void> {
    const tasks = await this.list();
    const filtered = tasks.filter((t) => t.id !== id);
    if (filtered.length === tasks.length) {
      throw new Error(`Task not found: ${id}`);
    }
    await this.save(filtered);
  }

  async getUpcoming(days: number = 14): Promise<Task[]> {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days);

    const startDateStr = today.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const tasks = await this.listInRange(startDateStr, endDateStr);
    return tasks.filter((t) => t.status === "pending");
  }

  private async save(tasks: Task[]): Promise<void> {
    await this.ensureFile();
    await fs.writeFile(this.tasksPath, JSON.stringify(tasks, null, 2));
  }
}

let _instance: ITaskRepo | null = null;

export function getTaskRepo(): ITaskRepo {
  if (!_instance) {
    _instance = new FSTaskRepo();
  }
  return _instance;
}
