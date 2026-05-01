import {
  ipcMain,
  BrowserWindow,
  shell,
  app,
  dialog,
  systemPreferences,
  desktopCapturer,
  session,
  type Session,
} from "electron";

const ALLOWED_SESSION_PERMISSIONS = new Set([
  "media",
  "display-capture",
  "clipboard-read",
  "clipboard-sanitized-write",
]);

function configureSessionPermissions(targetSession: Session): void {
  targetSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_SESSION_PERMISSIONS.has(permission as string);
  });

  targetSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(ALLOWED_SESSION_PERMISSIONS.has(permission as string));
    },
  );

  // Auto-approve display media requests and route system audio as loopback.
  // Electron requires a video source in the callback even if we only want audio.
  // We pass the first available screen source; the renderer discards the video track.
  targetSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    if (sources.length === 0) {
      callback({});
      return;
    }
    callback({ video: sources[0], audio: "loopback" });
  });
}
import { ipc } from "@x/shared";
import path from "node:path";
import os from "node:os";
import {
  connectProvider,
  disconnectProvider,
  listProviders,
} from "./oauth-handler.js";
import { watcher as watcherCore, workspace } from "@x/core";
import { workspace as workspaceShared } from "@x/shared";
import * as mcpCore from "@x/core/dist/mcp/mcp.js";
import * as runsCore from "@x/core/dist/runs/runs.js";
import { bus } from "@x/core/dist/runs/bus.js";
import { serviceBus } from "@x/core/dist/services/service_bus.js";
import type { FSWatcher } from "chokidar";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import z from "zod";

const execAsync = promisify(exec);
import { RunEvent } from "@x/shared/dist/runs.js";
import { ServiceEvent } from "@x/shared/dist/service-events.js";
import container from "@x/core/dist/di/container.js";
import { listOnboardingModels } from "@x/core/dist/models/models-dev.js";
import { testModelConnection } from "@x/core/dist/models/models.js";
import { isSignedIn } from "@x/core/dist/account/account.js";
import { listGatewayModels } from "@x/core/dist/models/gateway.js";
import type { IModelConfigRepo } from "@x/core/dist/models/repo.js";
import type { IOAuthRepo } from "@x/core/dist/auth/repo.js";
import { IGranolaConfigRepo } from "@x/core/dist/knowledge/granola/repo.js";
import { triggerSync as triggerGranolaSync } from "@x/core/dist/knowledge/granola/sync.js";
import { ISlackConfigRepo } from "@x/core/dist/slack/repo.js";
import {
  isOnboardingComplete,
  markOnboardingComplete,
} from "@x/core/dist/config/note_creation_config.js";
import * as composioHandler from "./composio-handler.js";
import { IAgentScheduleRepo } from "@x/core/dist/agent-schedule/repo.js";
import { IAgentScheduleStateRepo } from "@x/core/dist/agent-schedule/state-repo.js";
import { triggerRun as triggerAgentScheduleRun } from "@x/core/dist/agent-schedule/runner.js";
import { search } from "@x/core/dist/search/search.js";
import { versionHistory, voice } from "@x/core";
import {
  classifySchedule,
  processRowboatInstruction,
} from "@x/core/dist/knowledge/inline_tasks.js";
import { getBillingInfo } from "@x/core/dist/billing/billing.js";
import { getAccessToken } from "@x/core/dist/auth/tokens.js";
import { getRowboatConfig } from "@x/core/dist/config/rowboat.js";
import { triggerTrackUpdate } from "@x/core/dist/knowledge/track/runner.js";
import { trackBus } from "@x/core/dist/knowledge/track/bus.js";
import {
  fetchYaml,
  updateTrackBlock,
  replaceTrackBlockYaml,
  deleteTrackBlock,
} from "@x/core/dist/knowledge/track/fileops.js";
import {
  WorkDir,
  saveVaultPath,
  getVaultPath,
} from "@x/core/dist/config/config.js";
import {
  CardStorage,
  FSRSScheduler,
} from "@x/core/dist/academic/fsrs-scheduler.js";
import { EssayGrader } from "@x/core/dist/academic/essay-grader.js";
import {
  TaskManager,
  type KanbanStatus,
} from "@x/core/dist/academic/task-manager.js";
import type {
  FlashCard,
  FSRSCard,
  AcademicDashboardSummary,
} from "@x/shared/dist/academic.js";
import { browserIpcHandlers } from "./browser/ipc.js";
import { getRendererUrl } from "./app-url.js";

const flashcardStorage = new CardStorage(path.join(WorkDir, "academic"));
const flashcardScheduler = new FSRSScheduler();
const essayGrader = new EssayGrader();
const taskManager = new TaskManager(path.join(WorkDir, "academic"));

async function ensureUniqueWorkspaceDestination(
  destinationPath: string,
): Promise<string> {
  try {
    await fs.access(destinationPath);
  } catch {
    return destinationPath;
  }

  const parsed = path.parse(destinationPath);
  let counter = 1;
  while (true) {
    const candidate = path.join(
      parsed.dir,
      `${parsed.name}-${counter}${parsed.ext}`,
    );
    try {
      await fs.access(candidate);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

function createSeedFlashcards(courseId: string): FlashCard[] {
  const created = new Date().toISOString();

  const seeds: Array<
    Pick<FlashCard, "id" | "front" | "back" | "conceptId" | "difficulty">
  > = [
    {
      id: `${courseId}-photosynthesis-1`,
      front: "What is the main purpose of photosynthesis?",
      back: "To convert light energy into chemical energy stored in glucose.",
      conceptId: "photosynthesis",
      difficulty: "normal",
    },
    {
      id: `${courseId}-mechanics-1`,
      front: "State Newton's second law.",
      back: "Force equals mass times acceleration: F = ma.",
      conceptId: "newtons-second-law",
      difficulty: "easy",
    },
    {
      id: `${courseId}-essay-1`,
      front: "What makes a claim academically strong?",
      back: "It should be specific, supported by evidence, and connected to the rubric or source material.",
      conceptId: "academic-writing",
      difficulty: "hard",
    },
  ];

  return seeds.map((seed) => {
    const fsrs = flashcardScheduler.createNewCard(seed.id);
    const nextReview = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      ...seed,
      courseId,
      created,
      reviewed: [],
      nextReview,
      fsrs: {
        ...fsrs,
        state: "review",
        due: 1,
        scheduledDays: 1,
      } satisfies FSRSCard,
    };
  });
}

/**
 * Convert markdown to a styled HTML document for PDF/DOCX export.
 */
function markdownToHtml(markdown: string, title: string): string {
  // Simple markdown to HTML conversion for export purposes
  let html = markdown
    // Resolve wiki links [[Folder/Note Name]] or [[Folder/Note Name|Display]] to plain text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_match, _path, display) =>
      display.trim(),
    )
    .replace(/\[\[([^\]]+)\]\]/g, (_match, linkPath: string) => {
      // Use the last segment (filename) as the display name
      const segments = linkPath.trim().split("/");
      return segments[segments.length - 1];
    })
    // Escape HTML entities (but preserve markdown syntax)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headings (must come before other processing)
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr>");

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, "<blockquote>$1</blockquote>");

  // Paragraphs: wrap remaining lines that aren't already wrapped in HTML tags
  html = html.replace(/^(?!<[a-z/])((?!^\s*$).+)$/gm, "<p>$1</p>");

  // Clean up consecutive list items into lists
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; font-size: 14px; }
  h1 { font-size: 1.8em; margin-top: 1em; } h2 { font-size: 1.4em; margin-top: 1em; } h3 { font-size: 1.2em; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  blockquote { border-left: 3px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #555; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
  ul { padding-left: 1.5em; }
  a { color: #0066cc; }
</style></head><body>${html}</body></html>`;
}

function resolveShellPath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }

  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return workspace.resolveWorkspacePath(filePath);
}

type InvokeChannels = ipc.InvokeChannels;
type IPCChannels = ipc.IPCChannels;

/**
 * Type-safe handler function for invoke channels
 */
type InvokeHandler<K extends InvokeChannels> = (
  event: Electron.IpcMainInvokeEvent,
  args: IPCChannels[K]["req"],
) => IPCChannels[K]["res"] | Promise<IPCChannels[K]["res"]>;

/**
 * Type-safe handler registration map
 * Ensures all invoke channels have handlers
 */
type InvokeHandlers = {
  [K in InvokeChannels]: InvokeHandler<K>;
};

/**
 * Register all IPC handlers with type safety and runtime validation
 *
 * This function ensures:
 * 1. All invoke channels have handlers (exhaustiveness checking)
 * 2. Handler signatures match channel definitions
 * 3. Request/response payloads are validated at runtime
 */
export function registerIpcHandlers(handlers: InvokeHandlers) {
  // Register each handler with runtime validation
  for (const [channel, handler] of Object.entries(handlers) as [
    InvokeChannels,
    InvokeHandler<InvokeChannels>,
  ][]) {
    ipcMain.handle(channel, async (event, rawArgs) => {
      // Validate request payload
      const args = ipc.validateRequest(channel, rawArgs);

      // Call handler
      const result = await handler(event, args);

      // Validate response payload
      return ipc.validateResponse(channel, result);
    });
  }
}

// ============================================================================
// Electron-Specific Utilities
// ============================================================================

/**
 * Get application versions (Electron-specific)
 */
function getVersions(): {
  chrome: string;
  node: string;
  electron: string;
} {
  return {
    chrome: process.versions.chrome,
    node: process.versions.node,
    electron: process.versions.electron,
  };
}

// ============================================================================
// Workspace Watcher (with debouncing and lifecycle management)
// ============================================================================

let watcher: FSWatcher | null = null;
const changeQueue = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Emit knowledge commit event to all renderer windows
 */
function emitKnowledgeCommitEvent(): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("knowledge:didCommit", {});
    }
  }
}

/**
 * Emit workspace change event to all renderer windows
 */
function emitWorkspaceChangeEvent(
  event: z.infer<typeof workspaceShared.WorkspaceChangeEvent>,
): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("workspace:didChange", event);
    }
  }
}

/**
 * Process queued changes and emit events (debounced)
 */
function processChangeQueue(): void {
  if (changeQueue.size === 0) {
    return;
  }

  const paths = Array.from(changeQueue);
  changeQueue.clear();

  if (paths.length === 1) {
    // For single path, try to determine kind from file stats
    const relPath = paths[0]!;
    try {
      const absPath = workspace.resolveWorkspacePath(relPath);
      fs.lstat(absPath)
        .then((stats) => {
          const kind = stats.isDirectory() ? "dir" : "file";
          emitWorkspaceChangeEvent({ type: "changed", path: relPath, kind });
        })
        .catch(() => {
          // File no longer exists (edge case), emit without kind
          emitWorkspaceChangeEvent({ type: "changed", path: relPath });
        });
    } catch {
      // Invalid path, ignore
    }
  } else {
    // Emit bulkChanged for multiple paths
    emitWorkspaceChangeEvent({ type: "bulkChanged", paths });
  }
}

/**
 * Queue a path change for debounced emission
 */
function queueChange(relPath: string): void {
  changeQueue.add(relPath);

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    processChangeQueue();
    debounceTimer = null;
  }, 150); // 150ms debounce
}

/**
 * Handle workspace change event from core watcher
 */
function handleWorkspaceChange(
  event: z.infer<typeof workspaceShared.WorkspaceChangeEvent>,
): void {
  // Debounce 'changed' events, emit others immediately
  if (event.type === "changed" && event.path) {
    queueChange(event.path);
  } else {
    emitWorkspaceChangeEvent(event);
  }
}

/**
 * Start workspace watcher
 * Watches the configured workspace root recursively and emits change events to renderer
 *
 * This should be called once when the app starts (from main.ts).
 * The watcher runs as a main-process service and catches ALL filesystem changes
 * (both from IPC handlers and external changes like terminal/git).
 *
 * Safe to call multiple times - guards against duplicate watchers.
 */
export async function startWorkspaceWatcher(): Promise<void> {
  if (watcher) {
    // Watcher already running - safe to ignore subsequent calls
    return;
  }

  watcher = await watcherCore.createWorkspaceWatcher(handleWorkspaceChange);
}

/**
 * Stop workspace watcher
 */
export function stopWorkspaceWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  changeQueue.clear();
}

function emitRunEvent(event: z.infer<typeof RunEvent>): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("runs:events", event);
    }
  }
}

function emitServiceEvent(event: z.infer<typeof ServiceEvent>): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("services:events", event);
    }
  }
}

export function emitOAuthEvent(event: {
  provider: string;
  success: boolean;
  error?: string;
}): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("oauth:didConnect", event);
    }
  }
}

let runsWatcher: (() => void) | null = null;
export async function startRunsWatcher(): Promise<void> {
  if (runsWatcher) {
    return;
  }
  runsWatcher = await bus.subscribe("*", async (event) => {
    emitRunEvent(event);
  });
}

let servicesWatcher: (() => void) | null = null;
export async function startServicesWatcher(): Promise<void> {
  if (servicesWatcher) {
    return;
  }
  servicesWatcher = await serviceBus.subscribe(async (event) => {
    emitServiceEvent(event);
  });
}

let tracksWatcher: (() => void) | null = null;
export function startTracksWatcher(): void {
  if (tracksWatcher) return;
  tracksWatcher = trackBus.subscribe((event) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send("tracks:events", event);
      }
    }
  });
}

export function stopRunsWatcher(): void {
  if (runsWatcher) {
    runsWatcher();
    runsWatcher = null;
  }
}

export function stopServicesWatcher(): void {
  if (servicesWatcher) {
    servicesWatcher();
    servicesWatcher = null;
  }
}

// ============================================================================
// Handler Implementations
// ============================================================================

/**
 * Register all IPC handlers
 * Add new handlers here as you add channels to IPCChannels
 */
export function setupIpcHandlers() {
  // Forward knowledge commit events to renderer for panel refresh
  versionHistory.onCommit(() => emitKnowledgeCommitEvent());

  registerIpcHandlers({
    "app:getVersions": async () => {
      // args is null for this channel (no request payload)
      return getVersions();
    },
    "workspace:getRoot": async () => {
      return workspace.getRoot();
    },
    "workspace:exists": async (_, args) => {
      return workspace.exists(args.path);
    },
    "workspace:stat": async (_event, args) => {
      return workspace.stat(args.path);
    },
    "workspace:readdir": async (_event, args) => {
      return workspace.readdir(args.path, args.opts);
    },
    "workspace:readFile": async (_event, args) => {
      return workspace.readFile(args.path, args.encoding);
    },
    "workspace:writeFile": async (_event, args) => {
      return workspace.writeFile(args.path, args.data, args.opts);
    },
    "workspace:mkdir": async (_event, args) => {
      return workspace.mkdir(args.path, args.recursive);
    },
    "workspace:rename": async (_event, args) => {
      return workspace.rename(args.from, args.to, args.overwrite);
    },
    "workspace:copy": async (_event, args) => {
      return workspace.copy(args.from, args.to, args.overwrite);
    },
    "workspace:remove": async (_event, args) => {
      return workspace.remove(args.path, args.opts);
    },
    "ingest:addFiles": async (_event, args) => {
      const { root: workspaceRoot } = await workspace.getRoot();
      const rawDirectory = path.join(workspaceRoot, "raw");
      await fs.mkdir(rawDirectory, { recursive: true });

      const stagedFiles: Array<{
        sourcePath: string;
        targetPath: string;
        name: string;
      }> = [];
      const errors: string[] = [];

      for (const sourcePath of args.files) {
        try {
          const sourceStat = await fs.stat(sourcePath);
          if (!sourceStat.isFile()) {
            errors.push(`${sourcePath} is not a file`);
            continue;
          }

          const originalName = path.basename(sourcePath);
          const destinationPath = await ensureUniqueWorkspaceDestination(
            path.join(rawDirectory, originalName),
          );

          if (path.resolve(sourcePath) !== path.resolve(destinationPath)) {
            await fs.copyFile(sourcePath, destinationPath);
          }

          stagedFiles.push({
            sourcePath,
            targetPath: destinationPath,
            name: path.basename(destinationPath),
          });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      return { ok: true as const, stagedFiles, errors };
    },
    "academic:flashcards:list": async (_event, args) => {
      const courseId = args.courseId || "scholaros-demo";
      let cards = await flashcardStorage.loadCards(courseId);
      if (cards.length === 0) {
        cards = createSeedFlashcards(courseId);
        await flashcardStorage.saveCards(cards);
      }

      const now = new Date().toISOString();
      const dueCards = cards.filter(
        (card) => !card.nextReview || card.nextReview <= now,
      );
      return {
        cards,
        dueCount: dueCards.length,
        totalCount: cards.length,
      };
    },
    "academic:flashcards:grade": async (_event, args) => {
      const courseId = args.courseId || "scholaros-demo";
      const cards = await flashcardStorage.loadCards(courseId);
      const card = cards.find((item) => item.id === args.cardId);
      if (!card) {
        return { success: false, error: "Flashcard not found" };
      }

      const currentFsrs =
        card.fsrs ?? flashcardScheduler.createNewCard(card.id);
      const scheduledFsrs = flashcardScheduler.schedule(
        currentFsrs,
        args.grade,
      );
      const reviewDurationMs =
        typeof args.durationMs === "number" ? args.durationMs : undefined;
      const updatedCard: FlashCard = {
        ...card,
        reviewed: [
          ...card.reviewed,
          {
            timestamp: new Date().toISOString(),
            grade: args.grade,
            duration: reviewDurationMs,
            interval: scheduledFsrs.scheduledDays,
            easeFactor: scheduledFsrs.difficulty,
          },
        ],
        fsrs: scheduledFsrs,
        nextReview: new Date(
          Date.now() + scheduledFsrs.due * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      const nextCards = cards.map((item) =>
        item.id === updatedCard.id ? updatedCard : item,
      );
      await flashcardStorage.saveCards(nextCards);

      return {
        success: true,
        card: updatedCard,
        cards: nextCards,
        dueCount: nextCards.filter(
          (item) =>
            !item.nextReview || item.nextReview <= new Date().toISOString(),
        ).length,
        totalCount: nextCards.length,
      };
    },
    "academic:essay:grade": async (_event, args) => {
      return essayGrader.gradeEssay({
        title: args.title,
        essayText: args.essayText,
        rubricMarkdown: args.rubricMarkdown,
        sourceNames: args.sourceNames,
        wordGoal: args.wordGoal,
      });
    },
    "academic:assignments:list": async (_event, args) => {
      const assignments = await taskManager.listAssignments(args.courseId);
      return { assignments };
    },
    "academic:assignments:updateStatus": async (_event, args) => {
      const next = await taskManager.updateKanbanStatus(
        args.assignmentId,
        args.status as KanbanStatus,
      );
      if (!next) {
        return { success: false, error: "Assignment not found" };
      }

      return { success: true, assignment: next };
    },
    "academic:dashboard:summary": async (_event, args) => {
      const courseId = args.courseId || "scholaros-demo";
      let cards = await flashcardStorage.loadCards(courseId);
      if (cards.length === 0) {
        cards = createSeedFlashcards(courseId);
        await flashcardStorage.saveCards(cards);
      }

      const summary: AcademicDashboardSummary =
        await taskManager.dashboardSummary(cards, args.courseId);
      return summary;
    },
    "mcp:listTools": async (_event, args) => {
      return mcpCore.listTools(args.serverName, args.cursor);
    },
    "mcp:executeTool": async (_event, args) => {
      return {
        result: await mcpCore.executeTool(
          args.serverName,
          args.toolName,
          args.input,
        ),
      };
    },
    "runs:create": async (_event, args) => {
      return runsCore.createRun(args);
    },
    "runs:createMessage": async (_event, args) => {
      return {
        messageId: await runsCore.createMessage(
          args.runId,
          args.message,
          args.voiceInput,
          args.voiceOutput,
          args.searchEnabled,
          args.middlePaneContext,
        ),
      };
    },
    "runs:authorizePermission": async (_event, args) => {
      await runsCore.authorizePermission(args.runId, args.authorization);
      return { success: true };
    },
    "runs:provideHumanInput": async (_event, args) => {
      await runsCore.replyToHumanInputRequest(args.runId, args.reply);
      return { success: true };
    },
    "runs:stop": async (_event, args) => {
      await runsCore.stop(args.runId, args.force);
      return { success: true };
    },
    "runs:fetch": async (_event, args) => {
      return runsCore.fetchRun(args.runId);
    },
    "runs:list": async (_event, args) => {
      return runsCore.listRuns(args.cursor);
    },
    "runs:delete": async (_event, args) => {
      await runsCore.deleteRun(args.runId);
      return { success: true };
    },
    "models:list": async () => {
      if (await isSignedIn()) {
        return await listGatewayModels();
      }
      return await listOnboardingModels();
    },
    "models:test": async (_event, args) => {
      return await testModelConnection(args.provider, args.model);
    },
    "models:saveConfig": async (_event, args) => {
      const repo = container.resolve<IModelConfigRepo>("modelConfigRepo");
      await repo.setConfig(args);
      return { success: true };
    },
    "oauth:connect": async (_event, args) => {
      const credentials =
        args.clientId && args.clientSecret
          ? {
              clientId: args.clientId.trim(),
              clientSecret: args.clientSecret.trim(),
            }
          : undefined;
      return await connectProvider(args.provider, credentials);
    },
    "oauth:disconnect": async (_event, args) => {
      return await disconnectProvider(args.provider);
    },
    "oauth:list-providers": async () => {
      return listProviders();
    },
    "oauth:getState": async () => {
      const repo = container.resolve<IOAuthRepo>("oauthRepo");
      const config = await repo.getClientFacingConfig();
      return { config };
    },
    "account:getRowboat": async () => {
      const signedIn = await isSignedIn();
      if (!signedIn) {
        return { signedIn: false, accessToken: null, config: null };
      }

      const config = await getRowboatConfig();

      try {
        const accessToken = await getAccessToken();
        return { signedIn: true, accessToken, config };
      } catch {
        return { signedIn: true, accessToken: null, config };
      }
    },
    "granola:getConfig": async () => {
      const repo = container.resolve<IGranolaConfigRepo>("granolaConfigRepo");
      const config = await repo.getConfig();
      return { enabled: config.enabled };
    },
    "granola:setConfig": async (_event, args) => {
      const repo = container.resolve<IGranolaConfigRepo>("granolaConfigRepo");
      await repo.setConfig({ enabled: args.enabled });

      // Trigger sync immediately when enabled
      if (args.enabled) {
        triggerGranolaSync();
      }

      return { success: true };
    },
    "slack:getConfig": async () => {
      const repo = container.resolve<ISlackConfigRepo>("slackConfigRepo");
      const config = await repo.getConfig();
      return { enabled: config.enabled, workspaces: config.workspaces };
    },
    "slack:setConfig": async (_event, args) => {
      const repo = container.resolve<ISlackConfigRepo>("slackConfigRepo");
      await repo.setConfig({
        enabled: args.enabled,
        workspaces: args.workspaces,
      });
      return { success: true };
    },
    "slack:listWorkspaces": async () => {
      try {
        const { stdout } = await execAsync("agent-slack auth whoami", {
          timeout: 10000,
        });
        const parsed = JSON.parse(stdout);
        const workspaces = (parsed.workspaces || []).map(
          (w: { workspace_url?: string; workspace_name?: string }) => ({
            url: w.workspace_url || "",
            name: w.workspace_name || "",
          }),
        );
        return { workspaces };
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to list Slack workspaces";
        return { workspaces: [], error: message };
      }
    },
    "onboarding:getStatus": async () => {
      // Show onboarding if it hasn't been completed yet
      const complete = isOnboardingComplete();
      return { showOnboarding: !complete };
    },
    "onboarding:markComplete": async () => {
      markOnboardingComplete();
      return { success: true };
    },
    // Composio integration handlers
    "composio:is-configured": async () => {
      return composioHandler.isConfigured();
    },
    "composio:set-api-key": async (_event, args) => {
      return composioHandler.setApiKey(args.apiKey);
    },
    "composio:initiate-connection": async (_event, args) => {
      return composioHandler.initiateConnection(args.toolkitSlug);
    },
    "composio:get-connection-status": async (_event, args) => {
      return composioHandler.getConnectionStatus(args.toolkitSlug);
    },
    "composio:sync-connection": async (_event, args) => {
      return composioHandler.syncConnection(
        args.toolkitSlug,
        args.connectedAccountId,
      );
    },
    "composio:disconnect": async (_event, args) => {
      return composioHandler.disconnect(args.toolkitSlug);
    },
    "composio:list-connected": async () => {
      return composioHandler.listConnected();
    },
    // Composio Tools Library handlers
    "composio:list-toolkits": async () => {
      return composioHandler.listToolkits();
    },
    "composio:use-composio-for-google": async () => {
      return composioHandler.useComposioForGoogle();
    },
    "composio:use-composio-for-google-calendar": async () => {
      return composioHandler.useComposioForGoogleCalendar();
    },
    // Agent schedule handlers
    "agent-schedule:getConfig": async () => {
      const repo = container.resolve<IAgentScheduleRepo>("agentScheduleRepo");
      try {
        return await repo.getConfig();
      } catch {
        // Return empty config if file doesn't exist
        return { agents: {} };
      }
    },
    "agent-schedule:getState": async () => {
      const repo = container.resolve<IAgentScheduleStateRepo>(
        "agentScheduleStateRepo",
      );
      try {
        return await repo.getState();
      } catch {
        // Return empty state if file doesn't exist
        return { agents: {} };
      }
    },
    "agent-schedule:updateAgent": async (_event, args) => {
      const repo = container.resolve<IAgentScheduleRepo>("agentScheduleRepo");
      await repo.upsert(args.agentName, args.entry);
      // Trigger the runner to pick up the change immediately
      triggerAgentScheduleRun();
      return { success: true };
    },
    "agent-schedule:deleteAgent": async (_event, args) => {
      const repo = container.resolve<IAgentScheduleRepo>("agentScheduleRepo");
      const stateRepo = container.resolve<IAgentScheduleStateRepo>(
        "agentScheduleStateRepo",
      );
      await repo.delete(args.agentName);
      await stateRepo.deleteAgentState(args.agentName);
      return { success: true };
    },
    // Shell integration handlers
    "shell:openPath": async (_event, args) => {
      const filePath = resolveShellPath(args.path);
      const error = await shell.openPath(filePath);
      return { error: error || undefined };
    },
    "shell:readFileBase64": async (_event, args) => {
      const filePath = resolveShellPath(args.path);
      const stat = await fs.stat(filePath);
      if (stat.size > 10 * 1024 * 1024) {
        throw new Error("File too large (>10MB)");
      }
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".bmp": "image/bmp",
        ".ico": "image/x-icon",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".aac": "audio/aac",
        ".pdf": "application/pdf",
        ".json": "application/json",
        ".txt": "text/plain",
        ".md": "text/markdown",
      };
      const mimeType = mimeMap[ext] || "application/octet-stream";
      return { data: buffer.toString("base64"), mimeType, size: stat.size };
    },
    // Knowledge version history handlers
    "knowledge:history": async (_event, args) => {
      const commits = await versionHistory.getFileHistory(args.path);
      return { commits };
    },
    "knowledge:fileAtCommit": async (_event, args) => {
      const content = await versionHistory.getFileAtCommit(args.path, args.oid);
      return { content };
    },
    "knowledge:restore": async (_event, args) => {
      await versionHistory.restoreFile(args.path, args.oid);
      return { ok: true };
    },
    // Search handler
    "search:query": async (_event, args) => {
      return search(args.query, args.limit, args.types);
    },
    // Inline task schedule classification
    "export:note": async (event, args) => {
      const { markdown, format, title } = args;
      const sanitizedTitle =
        title.replace(/[/\\?%*:|"<>]/g, "-").trim() || "Untitled";

      const filterMap: Record<string, Electron.FileFilter[]> = {
        md: [{ name: "Markdown", extensions: ["md"] }],
        pdf: [{ name: "PDF", extensions: ["pdf"] }],
        docx: [{ name: "Word Document", extensions: ["docx"] }],
      };

      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: `${sanitizedTitle}.${format}`,
        filters: filterMap[format],
      });

      if (result.canceled || !result.filePath) {
        return { success: false };
      }

      const filePath = result.filePath;

      if (format === "md") {
        await fs.writeFile(filePath, markdown, "utf8");
        return { success: true };
      }

      if (format === "pdf") {
        // Render markdown as HTML in a hidden window, then print to PDF
        const htmlContent = markdownToHtml(markdown, sanitizedTitle);
        const hiddenWin = new BrowserWindow({
          show: false,
          width: 800,
          height: 600,
          webPreferences: { offscreen: true },
        });
        await hiddenWin.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
        );
        // Small delay to ensure CSS/fonts render
        await new Promise((resolve) => setTimeout(resolve, 300));
        const pdfBuffer = await hiddenWin.webContents.printToPDF({
          printBackground: true,
          pageSize: "A4",
        });
        hiddenWin.destroy();
        await fs.writeFile(filePath, pdfBuffer);
        return { success: true };
      }

      if (format === "docx") {
        const htmlContent = markdownToHtml(markdown, sanitizedTitle);
        const { default: htmlToDocx } = await import("html-to-docx");
        const docxBuffer = await htmlToDocx(htmlContent, undefined, {
          table: { row: { cantSplit: true } },
          footer: false,
          header: false,
        });
        await fs.writeFile(filePath, Buffer.from(docxBuffer as ArrayBuffer));
        return { success: true };
      }

      return { success: false, error: "Unknown format" };
    },
    "meeting:checkScreenPermission": async () => {
      if (process.platform !== "darwin") return { granted: true };
      const status = systemPreferences.getMediaAccessStatus("screen");
      console.log("[meeting] Screen recording permission status:", status);
      if (status === "granted") return { granted: true };
      // Not granted — call desktopCapturer.getSources() to register the app
      // in the macOS Screen Recording list. On first call this shows the
      // native permission prompt (signed apps are remembered across restarts).
      try {
        await desktopCapturer.getSources({ types: ["screen"] });
      } catch {
        /* ignore */
      }
      // Re-check after the native prompt was dismissed
      const statusAfter = systemPreferences.getMediaAccessStatus("screen");
      console.log(
        "[meeting] Screen recording permission status after prompt:",
        statusAfter,
      );
      return { granted: statusAfter === "granted" };
    },
    "meeting:openScreenRecordingSettings": async () => {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      );
      return { success: true };
    },
    "meeting:summarize": async () => {
      return {
        notes:
          "Meeting summarization is disabled in ScholarOS. Use academic ingest and notes instead.",
      };
    },
    "inline-task:classifySchedule": async (_event, args) => {
      const schedule = await classifySchedule(args.instruction);
      return { schedule };
    },
    "inline-task:process": async (_event, args) => {
      return await processRowboatInstruction(
        args.instruction,
        args.noteContent,
        args.notePath,
      );
    },
    "voice:getConfig": async () => {
      return voice.getVoiceConfig();
    },
    "voice:synthesize": async (_event, args) => {
      return voice.synthesizeSpeech(args.text);
    },
    // Track handlers
    "track:run": async (_event, args) => {
      const result = await triggerTrackUpdate(args.trackId, args.filePath);
      return {
        success: !result.error,
        summary: result.summary ?? undefined,
        error: result.error,
      };
    },
    "track:get": async (_event, args) => {
      try {
        const yaml = await fetchYaml(args.filePath, args.trackId);
        if (yaml === null) return { success: false, error: "Track not found" };
        return { success: true, yaml };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    "track:update": async (_event, args) => {
      try {
        await updateTrackBlock(
          args.filePath,
          args.trackId,
          args.updates as Record<string, unknown>,
        );
        const yaml = await fetchYaml(args.filePath, args.trackId);
        if (yaml === null)
          return { success: false, error: "Track vanished after update" };
        return { success: true, yaml };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    "track:replaceYaml": async (_event, args) => {
      try {
        await replaceTrackBlockYaml(args.filePath, args.trackId, args.yaml);
        const yaml = await fetchYaml(args.filePath, args.trackId);
        if (yaml === null)
          return { success: false, error: "Track vanished after replace" };
        return { success: true, yaml };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    "track:delete": async (_event, args) => {
      try {
        await deleteTrackBlock(args.filePath, args.trackId);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    // Billing handler
    "billing:getInfo": async () => {
      return await getBillingInfo();
    },
    // Vault selection handlers (Obsidian-like vault switcher)
    "vault:select": async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: "Select Vault Folder",
          message: "Choose a folder to use as your ScholarOS vault",
          properties: ["openDirectory", "createDirectory"],
          buttonLabel: "Select Vault",
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: false };
        }

        const selectedPath = result.filePaths[0];

        // Save the vault path for future sessions
        saveVaultPath(selectedPath);

        return { success: true, path: selectedPath };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    "vault:getPath": async () => {
      const savedPath = getVaultPath();
      return { path: savedPath };
    },
    "vault:setPath": async (_event, args) => {
      saveVaultPath(args.path);
      return { success: true as const };
    },
    // Embedded browser handlers (WebContentsView + navigation)
    ...browserIpcHandlers,
  });
}
