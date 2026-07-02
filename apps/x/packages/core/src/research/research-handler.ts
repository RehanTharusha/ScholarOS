import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { DeepResearcher } from "./deep-researcher.js";
import type { DeepResearcherOptions } from "./deep-researcher.js";
import type { AcademicCategoryId } from "./academic-categories.js";
import type { ResearchProgress, ResearchSource, ResearchFinding, ResearchSession } from "@scholaros/shared/dist/research.js";

interface ActiveTask {
  promise: Promise<void>;
  abortController: AbortController;
  query: string;
  status: ResearchSession["status"];
  progress: ResearchProgress;
  error?: string;
  resolve: () => void;
}

type ProgressCallback = (sessionId: string, progress: ResearchProgress, status: ResearchSession["status"]) => void;

export class ResearchHandler {
  private activeTasks = new Map<string, ActiveTask>();
  private researchDir: string;
  private emitProgress: ProgressCallback;

  constructor(emitProgress?: ProgressCallback) {
    this.researchDir = path.join(homedir(), ".scholarOS", "research");
    this.emitProgress = emitProgress ?? (() => {});
    try {
      fs.mkdirSync(this.researchDir, { recursive: true });
    } catch {
      // Directory may already exist
    }
  }

  async startResearch(
    query: string,
    category?: AcademicCategoryId,
    options?: { rounds?: number; model?: string; provider?: string },
  ): Promise<string> {
    const sessionId = `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resolvedCategory: AcademicCategoryId = category ?? "concept-exploration";
    const abortController = new AbortController();

    const progress: ResearchProgress = {
      phase: "planning",
      round: 0,
      totalRounds: options?.rounds ?? 6,
      queriesFound: 0,
      sourcesFound: 0,
      findingsCount: 0,
      message: "Starting...",
    };

    let resolvePromise: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const task: ActiveTask = {
      promise,
      abortController,
      query,
      status: "running",
      progress,
      resolve: resolvePromise,
    };

    this.activeTasks.set(sessionId, task);

    const researcher = new DeepResearcher(query, resolvedCategory, {
      maxRounds: options?.rounds ?? 6,
      model: options?.model,
      provider: options?.provider,
      abortSignal: abortController.signal,
      onProgress: (p) => {
        task.progress = p;
        this.emitProgress(sessionId, p, "running");
      },
    });

    // Run research in background
    researcher.research()
      .then(async (result) => {
        task.status = "done";
        const session: ResearchSession = {
          sessionId,
          query,
          status: "done",
          category: resolvedCategory,
          progress: task.progress,
          result: result.result,
          sources: result.sources,
          findings: result.findings,
          stats: {
            duration: result.stats.duration,
            rounds: result.stats.rounds,
            queries: result.stats.queries,
            urls: result.stats.urls,
            model: result.stats.model,
            searchProvider: result.stats.searchProvider,
            category: result.stats.category as any,
          },
          startedAt: Date.now() - (result.stats.duration * 1000),
          completedAt: Date.now(),
        };
        await this._saveSession(session);
        this.emitProgress(sessionId, task.progress, "done");
      })
      .catch((err) => {
        if (abortController.signal.aborted) {
          task.status = "cancelled";
          this.emitProgress(sessionId, task.progress, "cancelled");
        } else {
          task.status = "error";
          task.error = err instanceof Error ? err.message : "Unknown error";
          this.emitProgress(sessionId, task.progress, "error");
        }
      })
      .finally(() => {
        setTimeout(() => {
          this.activeTasks.delete(sessionId);
          task.resolve();
        }, 5000);
      });

    return sessionId;
  }

  cancelResearch(sessionId: string): void {
    const task = this.activeTasks.get(sessionId);
    if (task && task.status === "running") {
      task.abortController.abort();
    }
  }

  getProgress(sessionId: string): { progress: ResearchProgress; status: string } | null {
    const task = this.activeTasks.get(sessionId);
    if (task) {
      return { progress: task.progress, status: task.status };
    }
    // Check completed sessions
    const session = this._loadSession(sessionId);
    if (session) {
      return { progress: session.progress ?? { phase: "finalizing", round: 0, totalRounds: 0, queriesFound: 0, sourcesFound: 0, findingsCount: 0 }, status: session.status };
    }
    return null;
  }

  getResult(sessionId: string): ResearchSession | null {
    const task = this.activeTasks.get(sessionId);
    if (task && (task.status === "done" || task.status === "error" || task.status === "cancelled")) {
      // Try to load from disk
    }
    return this._loadSession(sessionId);
  }

  async listCompleted(): Promise<ResearchSession[]> {
    try {
      const files = await fsp.readdir(this.researchDir);
      const sessions: ResearchSession[] = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const content = await fsp.readFile(path.join(this.researchDir, file), "utf-8");
            const parsed = JSON.parse(content) as ResearchSession;
            if (parsed.status === "done" || parsed.status === "error" || parsed.status === "cancelled") {
              sessions.push(parsed);
            }
          } catch {
            // Skip corrupt files
          }
        }
      }
      sessions.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
      return sessions;
    } catch {
      return [];
    }
  }

  async deleteResearch(sessionId: string): Promise<void> {
    const filePath = path.join(this.researchDir, `${sessionId}.json`);
    try {
      await fsp.unlink(filePath);
    } catch {
      // File may not exist
    }
    this.activeTasks.delete(sessionId);
  }

  setEmitProgress(callback: ProgressCallback): void {
    this.emitProgress = callback;
  }

  getActiveTasks(): Array<{ sessionId: string; query: string; status: string; progress: ResearchProgress }> {
    const result: Array<{ sessionId: string; query: string; status: string; progress: ResearchProgress }> = [];
    for (const [sessionId, task] of this.activeTasks) {
      result.push({ sessionId, query: task.query, status: task.status, progress: task.progress });
    }
    return result;
  }

  private async _saveSession(session: ResearchSession): Promise<void> {
    const filePath = path.join(this.researchDir, `${session.sessionId}.json`);
    await fsp.writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
  }

  private _loadSession(sessionId: string): ResearchSession | null {
    const filePath = path.join(this.researchDir, `${sessionId}.json`);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as ResearchSession;
    } catch {
      return null;
    }
  }
}
