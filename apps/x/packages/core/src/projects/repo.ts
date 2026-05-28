import z from "zod";
import path from "path";
import fsp from "fs/promises";
import fs from "fs";
import {
  Project,
  ProjectSummary,
  CreateProjectOptions,
  UpdateProjectOptions,
} from "@x/shared/dist/projects.js";
import { WorkDir } from "../config/config.js";

function projectsDir(): string {
  return path.join(WorkDir, "projects");
}

function projectDir(id: string): string {
  return path.join(projectsDir(), id);
}

function projectJsonPath(id: string): string {
  return path.join(projectDir(id), "project.json");
}

function activeJsonPath(): string {
  return path.join(projectsDir(), "_active.json");
}

function trashDir(): string {
  return path.join(WorkDir, ".trash", "projects");
}

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "proj_";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function ensureProjectsDir(): Promise<void> {
  await fsp.mkdir(projectsDir(), { recursive: true });
}

async function countFiles(dir: string): Promise<number> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(".jsonl")).length;
  } catch {
    return 0;
  }
}

export interface IProjectsRepo {
  list(): Promise<z.infer<typeof ProjectSummary>[]>;
  get(id: string): Promise<z.infer<typeof Project> | null>;
  create(opts: z.infer<typeof CreateProjectOptions>): Promise<z.infer<typeof Project>>;
  rename(id: string, name: string): Promise<void>;
  update(id: string, updates: z.infer<typeof UpdateProjectOptions>): Promise<void>;
  delete(id: string): Promise<void>;
  setActive(id: string | null): Promise<void>;
  getActive(): Promise<z.infer<typeof Project> | null>;
  getContext(id: string): Promise<string>;
  appendContext(id: string, text: string): Promise<void>;
  getRunsDir(id: string): string;
  getArtifactsDir(id: string): string;
}

export class FSProjectsRepo implements IProjectsRepo {
  async list(): Promise<z.infer<typeof ProjectSummary>[]> {
    await ensureProjectsDir();
    const entries = await fsp.readdir(projectsDir(), { withFileTypes: true });
    const projects: z.infer<typeof ProjectSummary>[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("proj_")) continue;
      try {
        const raw = await fsp.readFile(projectJsonPath(entry.name), "utf-8");
        const project = Project.parse(JSON.parse(raw));
        projects.push({
          id: project.id,
          name: project.name,
          description: project.description,
          course: project.course,
          color: project.color,
          tags: project.tags,
          status: project.status,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          lastActiveAt: project.lastActiveAt,
        });
      } catch {
        // Skip corrupt project dirs
      }
    }

    projects.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return projects;
  }

  async get(id: string): Promise<z.infer<typeof Project> | null> {
    try {
      const raw = await fsp.readFile(projectJsonPath(id), "utf-8");
      return Project.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async create(
    opts: z.infer<typeof CreateProjectOptions>,
  ): Promise<z.infer<typeof Project>> {
    await ensureProjectsDir();
    const now = new Date().toISOString();
    const id = generateId();
    const project: z.infer<typeof Project> = {
      id,
      name: opts.name,
      description: opts.description,
      course: opts.course,
      color: opts.color,
      tags: opts.tags,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    };

    const dir = projectDir(id);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.mkdir(path.join(dir, "runs"), { recursive: true });
    await fsp.mkdir(path.join(dir, "artifacts"), { recursive: true });
    await fsp.mkdir(path.join(dir, "notes"), { recursive: true });
    await fsp.writeFile(
      projectJsonPath(id),
      JSON.stringify(project, null, 2),
      "utf-8",
    );
    await fsp.writeFile(
      path.join(dir, "memory.md"),
      `# Project: ${opts.name}\n\n## Overview\n\n${opts.description || "No description yet."}\n\n## Key Decisions\n\n## Next Steps\n\n## Artifacts\n\n## Session Log\n\n## Related Knowledge\n`,
      "utf-8",
    );

    return project;
  }

  async rename(id: string, name: string): Promise<void> {
    const project = await this.get(id);
    if (!project) throw new Error(`Project ${id} not found`);
    const now = new Date().toISOString();
    const updated = { ...project, name, updatedAt: now };
    await fsp.writeFile(
      projectJsonPath(id),
      JSON.stringify(updated, null, 2),
      "utf-8",
    );
  }

  async update(
    id: string,
    updates: z.infer<typeof UpdateProjectOptions>,
  ): Promise<void> {
    const project = await this.get(id);
    if (!project) throw new Error(`Project ${id} not found`);
    const now = new Date().toISOString();
    const updated = { ...project, ...updates, updatedAt: now };
    await fsp.writeFile(
      projectJsonPath(id),
      JSON.stringify(updated, null, 2),
      "utf-8",
    );
  }

  async delete(id: string): Promise<void> {
    const dir = projectDir(id);
    if (!fs.existsSync(dir)) throw new Error(`Project ${id} not found`);

    await fsp.mkdir(trashDir(), { recursive: true });
    const trashDest = path.join(trashDir(), id);
    if (fs.existsSync(trashDest)) {
      await fsp.rm(trashDest, { recursive: true, force: true });
    }
    await fsp.rename(dir, trashDest);

    // Remove from _active.json if it was active
    const active = await this.getActive();
    if (active?.id === id) {
      await this.setActive(null);
    }
  }

  async setActive(id: string | null): Promise<void> {
    await ensureProjectsDir();
    if (id === null) {
      await fsp.writeFile(
        activeJsonPath(),
        JSON.stringify({}),
        "utf-8",
      );
    } else {
      const project = await this.get(id);
      if (!project) throw new Error(`Project ${id} not found`);
      await fsp.writeFile(
        activeJsonPath(),
        JSON.stringify({ activeProjectId: id }),
        "utf-8",
      );
      // Update lastActiveAt
      const now = new Date().toISOString();
      const updated = { ...project, lastActiveAt: now, updatedAt: now };
      await fsp.writeFile(
        projectJsonPath(id),
        JSON.stringify(updated, null, 2),
        "utf-8",
      );
    }
  }

  async getActive(): Promise<z.infer<typeof Project> | null> {
    try {
      const raw = await fsp.readFile(activeJsonPath(), "utf-8");
      const data = JSON.parse(raw);
      if (data.activeProjectId) {
        return this.get(data.activeProjectId);
      }
    } catch {
      // No active project file or corrupt
    }
    return null;
  }

  async getContext(id: string): Promise<string> {
    const memoryPath = path.join(projectDir(id), "memory.md");
    try {
      return await fsp.readFile(memoryPath, "utf-8");
    } catch {
      return "";
    }
  }

  async appendContext(id: string, text: string): Promise<void> {
    const memoryPath = path.join(projectDir(id), "memory.md");
    await fsp.appendFile(memoryPath, `\n${text}`, "utf-8");
  }

  getRunsDir(id: string): string {
    return path.join(projectDir(id), "runs");
  }

  getArtifactsDir(id: string): string {
    return path.join(projectDir(id), "artifacts");
  }
}
