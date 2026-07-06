import { ipcMain, BrowserWindow, shell, app, dialog } from "electron";
import { ipc } from "@scholaros/shared";
import path from "node:path";
import os from "node:os";
import {
  connectProvider,
  disconnectProvider,
  listProviders,
} from "./oauth-handler.js";
import { watcher as watcherCore, workspace } from "@scholaros/core";
import { refreshWorkDir } from "@scholaros/core/dist/config/config.js";
import { workspace as workspaceShared } from "@scholaros/shared";
import * as mcpCore from "@scholaros/core/dist/mcp/mcp.js";
import * as runsCore from "@scholaros/core/dist/runs/runs.js";
import { bus } from "@scholaros/core/dist/runs/bus.js";
import { serviceBus } from "@scholaros/core/dist/services/service_bus.js";
import chokidar, { type FSWatcher } from "chokidar";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import z from "zod";
import mammothModule from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mammoth = (mammothModule as any).default || mammothModule;

const execAsync = promisify(exec);

import { RunEvent } from "@scholaros/shared/dist/runs.js";
import { ServiceEvent } from "@scholaros/shared/dist/service-events.js";
import container from "@scholaros/core/dist/di/container.js";
import { KnowledgeGraphService } from "@scholaros/core/dist/knowledge/graph/service.js";
import type { KnowledgeGraph } from "@scholaros/core/dist/knowledge/graph/graph.js";
import { ReviewStore } from "@scholaros/core/dist/knowledge/review-store.js";
import { listOnboardingModels } from "@scholaros/core/dist/models/models-dev.js";
import { testModelConnection, listOpenCodeModels } from "@scholaros/core/dist/models/models.js";
import { isSignedIn } from "@scholaros/core/dist/account/account.js";
import { listGatewayModels } from "@scholaros/core/dist/models/gateway.js";
import type { IModelConfigRepo } from "@scholaros/core/dist/models/repo.js";
import type { IOAuthRepo } from "@scholaros/core/dist/auth/repo.js";
import { ISlackConfigRepo } from "@scholaros/core/dist/slack/repo.js";
import {
  isOnboardingComplete,
  markOnboardingComplete,
  resetOnboarding,
  shouldShowOnboardingOverride,
} from "@scholaros/core/dist/config/config.js";
import * as composioHandler from "./composio-handler.js";
import { search } from "@scholaros/core/dist/search/search.js";
import { ResearchHandler } from "@scholaros/core/dist/research/research-handler.js";
import { versionHistory, voice } from "@scholaros/core";
import { getBillingInfo } from "@scholaros/core/dist/billing/billing.js";
import { getAccessToken } from "@scholaros/core/dist/auth/tokens.js";
import { getScholarOSConfig } from "@scholaros/core/dist/config/scholaros.js";
import {
  WorkDir,
  saveVaultPath,
  getVaultPath,
  clearVaultPath,
  clearWorkDir,
  listVaults,
  addVault,
  removeVault,
  setActiveVault,
} from "@scholaros/core/dist/config/config.js";
import { browserIpcHandlers } from "./browser/ipc.js";

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

function emitVaultChanged(path: string): void {
  console.log(`[Vault] Emitting vault:changed -> ${path}`);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("vault:changed", { path });
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

// Research Handler (singleton, wired to Electron IPC for progress events)
const researchHandler = new ResearchHandler((sessionId, progress, status) => {
  emitResearchProgress(sessionId, progress, status);
});

function emitResearchProgress(sessionId: string, progress: import("@scholaros/shared/dist/research.js").ResearchProgress, status: string): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send("research:progress", { sessionId, progress, status });
    }
  }
}

export function getResearchHandler(): typeof researchHandler {
  return researchHandler;
}

export async function startResearchWatcher(): Promise<void> {
  // ResearchHandler already wired to emitResearchProgress — nothing extra needed
}

export function stopResearchWatcher(): void {
  // No cleanup needed
}

// Knowledge Graph Service lifecycle
let kgService: KnowledgeGraphService | null = null;

export async function initKnowledgeGraphService(): Promise<void> {
  if (kgService) return;
  try {
    const graph = container.resolve<KnowledgeGraph>('knowledgeGraph');
    kgService = new KnowledgeGraphService(graph);
    await kgService.init();
    console.log('[KnowledgeGraph] Service started');
  } catch (err) {
    console.error('[KnowledgeGraph] Failed to initialize service:', err);
  }
}

export async function shutdownKnowledgeGraphService(): Promise<void> {
  if (!kgService) return;
  try {
    await kgService.shutdown();
    kgService = null;
    console.log('[KnowledgeGraph] Service shut down');
  } catch (err) {
    console.error('[KnowledgeGraph] Failed to shut down service:', err);
  }
}

export function getKnowledgeGraphService(): KnowledgeGraphService | null {
  return kgService;
}

// Review Store lifecycle
let reviewStore: ReviewStore | null = null;

export async function initReviewStore(): Promise<void> {
  if (reviewStore) return;
  try {
    reviewStore = new ReviewStore();
    await reviewStore.load();
    console.log('[ReviewStore] Loaded');
  } catch (err) {
    console.error('[ReviewStore] Failed to load:', err);
  }
}

export function getReviewStore(): ReviewStore | null {
  return reviewStore;
}

let rawWatcher: ReturnType<typeof chokidar.watch> | null = null;

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
    "workspace:convertToHtml": async (_event, args) => {
      const absPath = workspace.resolveWorkspacePath(args.path);
      const ext = path.extname(absPath).toLowerCase();
      if (ext === ".docx") {
        const buffer = await fs.readFile(absPath);
        const result = await mammoth.convertToHtml({ buffer });
        return { html: result.value };
      }
      return { html: `<p>Preview not supported for ${ext} files.</p>` };
    },
    "ingest:addFiles": async (_event, args) => {
      const { root: workspaceRoot } = await workspace.getRoot();
      const rawDirectory = path.join(workspaceRoot, "raw");
      await fs.mkdir(rawDirectory, { recursive: true });

      const stagedFiles: Array<{
        sourcePath: string;
        targetPath: string;
        name: string;
        size?: number;
        sourceFolder?: string;
      }> = [];
      const errors: string[] = [];

      const stageSingleFile = async (
        sourcePath: string,
        sourceFolder?: string,
      ) => {
        try {
          const sourceStat = await fs.stat(sourcePath);
          if (!sourceStat.isFile()) return;

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
            size: sourceStat.size,
            sourceFolder,
          });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      };

      const walkFolder = async (
        dirPath: string,
        rootPath: string,
      ): Promise<void> => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
              await walkFolder(fullPath, rootPath);
            } else if (entry.isFile()) {
              const relativeDir = path.relative(rootPath, path.dirname(fullPath));
              await stageSingleFile(fullPath, relativeDir || undefined);
            }
          }
        } catch (error) {
          errors.push(
            `Failed to read folder ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      };

      for (const sourcePath of args.files) {
        await stageSingleFile(sourcePath, undefined);
      }

      if (args.folders) {
        for (const folderPath of args.folders) {
          await walkFolder(folderPath, folderPath);
        }
      }

      return { ok: true as const, stagedFiles, errors };
    },
    "ingest:pickFolder": async () => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return { paths: [], cancelled: true };
      const result = await dialog.showOpenDialog(win, {
        properties: ["openDirectory", "multiSelections"],
      });
      if (result.canceled) return { paths: [], cancelled: true };
      return { paths: result.filePaths, cancelled: false };
    },
    "ingest:watchRaw": async (_event, args) => {
      if (args.enabled && !rawWatcher) {
        const { root: workspaceRoot } = await workspace.getRoot();
        const rawDir = path.join(workspaceRoot, "raw");
        await fs.mkdir(rawDir, { recursive: true });

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const pendingFiles: Array<{
          sourcePath: string;
          targetPath: string;
          name: string;
          size?: number;
          sourceFolder?: string;
        }> = [];

        rawWatcher = chokidar.watch(rawDir, {
          ignoreInitial: true,
          depth: 0,
          awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
        });

        const flushPending = () => {
          if (pendingFiles.length === 0) return;
          const files = [...pendingFiles];
          pendingFiles.length = 0;
          const windows = BrowserWindow.getAllWindows();
          for (const win of windows) {
            if (!win.isDestroyed() && win.webContents) {
              win.webContents.send("ingest:rawFileEvent", { files });
            }
          }
        };

        rawWatcher.on("add", (filePath: string) => {
          const fileName = path.basename(filePath);
          pendingFiles.push({
            sourcePath: filePath,
            targetPath: filePath,
            name: fileName,
          });
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(flushPending, 1500);
        });

        console.log("[Ingest] Raw watcher started");
      } else if (!args.enabled && rawWatcher) {
        await rawWatcher.close();
        rawWatcher = null;
        console.log("[Ingest] Raw watcher stopped");
      }
      return { ok: true };
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
    "runs:appendMessage": async (_event, args) => {
      return {
        messageId: await runsCore.appendMessage(args.runId, args.role, args.content),
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
    "runs:deleteAll": async () => {
      await runsCore.deleteAllRuns();
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
    "models:list-opencode": async (_event, args) => {
      return await listOpenCodeModels(args.flavor, args.apiKey);
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
    "account:getAccount": async () => {
      const signedIn = await isSignedIn();
      if (!signedIn) {
        return { signedIn: false, accessToken: null, config: null };
      }

      const config = await getScholarOSConfig();

      try {
        const accessToken = await getAccessToken();
        return { signedIn: true, accessToken, config };
      } catch {
        return { signedIn: true, accessToken: null, config };
      }
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
      const devOverride = shouldShowOnboardingOverride();
      if (devOverride) {
        return { showOnboarding: true, devOverride: true };
      }
      const complete = isOnboardingComplete();
      return { showOnboarding: !complete, devOverride: false };
    },
    "onboarding:markComplete": async () => {
      markOnboardingComplete();
      return { success: true };
    },
    "onboarding:reset": async () => {
      resetOnboarding();
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
    // Shell integration handlers
    "shell:openPath": async (_event, args) => {
      const filePath = resolveShellPath(args.path);
      const error = await shell.openPath(filePath);
      return { error: error || undefined };
    },
    "shell:revealInFolder": async (_event, args) => {
      const filePath = resolveShellPath(args.path);
      shell.showItemInFolder(filePath);
      return { success: true as const };
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
    "voice:getConfig": async () => {
      return voice.getVoiceConfig();
    },
    "voice:synthesize": async (_event, args) => {
      return voice.synthesizeSpeech(args.text);
    },
    // Billing handler
    "billing:getInfo": async () => {
      return await getBillingInfo();
    },
    // App control handlers
    "app:restart": async () => {
      // Schedule restart after IPC response is sent
      setImmediate(() => {
        app.relaunch();
        app.quit();
      });
      return { ok: true as const };
    },
    // Vault selection handlers (Obsidian-like vault switcher)
    "vault:select": async () => {
      try {
        console.log("[Vault] Opening folder selection dialog...");
        const result = await dialog.showOpenDialog({
          title: "Select Vault Folder",
          message: "Choose a folder to use as your ScholarOS vault",
          properties: ["openDirectory", "createDirectory"],
          buttonLabel: "Select Vault",
        });

        if (result.canceled || result.filePaths.length === 0) {
          console.log("[Vault] Selection canceled or no paths selected");
          return { success: false };
        }

        const selectedPath = result.filePaths[0];
        console.log(`[Vault] User selected path: ${selectedPath}`);

        // Save the vault path for future sessions
        console.log("[Vault] Saving vault path to config...");
        saveVaultPath(selectedPath);
        console.log("[Vault] Vault path saved successfully");

        // Refresh WorkDir so any newly-created services use the correct path
        refreshWorkDir();
        console.log("[Vault] WorkDir refreshed");

        // Restart watchers so they pick up the new WorkDir
        stopWorkspaceWatcher();
        await startWorkspaceWatcher();
        stopRunsWatcher();
        await startRunsWatcher();
        stopServicesWatcher();
        await startServicesWatcher();
        // Emit vault change to renderer
        try {
          emitVaultChanged(WorkDir);
        } catch (err) {
          console.warn("[Vault] Failed to emit vault change:", err);
        }

        return { success: true, path: selectedPath };
      } catch (err) {
        console.error("[Vault] Selection failed:", err);
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
    "vault:list": async () => {
      return listVaults();
    },
    "vault:add": async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: "Add Existing Folder",
          message: "Choose a folder to add as a vault",
          properties: ["openDirectory"],
          buttonLabel: "Add Folder",
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false };
        }
        const vaultPath = result.filePaths[0]!;
        return { success: true, ...addVault(vaultPath) };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    "vault:create": async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: "Create New Vault",
          message: "Choose a location for the new vault folder",
          properties: ["openDirectory", "createDirectory"],
          buttonLabel: "Create Vault",
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false };
        }
        const vaultPath = result.filePaths[0]!;
        // Create .scholarOS subdirectory to mark it as a ScholarOS vault
        const scholarDir = path.join(vaultPath, ".scholarOS");
        await fs.mkdir(scholarDir, { recursive: true });
        return { success: true, ...addVault(vaultPath) };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    "vault:remove": async (_event, args) => {
      try {
        const { activeVaultId } = listVaults();
        const wasActive = activeVaultId === args.id;
        const result = removeVault(args.id);
        if (wasActive) {
          if (result.activeVaultId) {
            // Another vault exists — switch to it
            const vault = result.vaults.find((v) => v.id === result.activeVaultId);
            if (vault) {
              setActiveVault(result.activeVaultId);
              refreshWorkDir();
              stopWorkspaceWatcher();
              await startWorkspaceWatcher();
              stopRunsWatcher();
              await startRunsWatcher();
              stopServicesWatcher();
              await startServicesWatcher();
              try { emitVaultChanged(WorkDir); } catch (err) {
                console.warn("[Vault] Failed to emit vault change:", err);
              }
            }
          } else {
            // Last vault removed — no vault active, disable workspace
            clearVaultPath();
            clearWorkDir();
            stopWorkspaceWatcher();
            stopRunsWatcher();
            stopServicesWatcher();
            try { emitVaultChanged(""); } catch (err) {
              console.warn("[Vault] Failed to emit vault change:", err);
            }
          }
        }
        return { success: true, ...result };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    "vault:switch": async (_event, args) => {
      try {
        const { vaults } = listVaults();
        const vault = vaults.find((v) => v.id === args.id);
        if (!vault) {
          return { success: false, error: "Vault not found" };
        }
        const ok = setActiveVault(args.id);
        if (!ok) {
          return { success: false, error: "Failed to set active vault" };
        }
        // Refresh WorkDir so any newly-created services use the correct path
        refreshWorkDir();
        // Restart watchers so they pick up the new WorkDir
        stopWorkspaceWatcher();
        await startWorkspaceWatcher();
        stopRunsWatcher();
        await startRunsWatcher();
        stopServicesWatcher();
        await startServicesWatcher();
        try {
          emitVaultChanged(WorkDir);
        } catch (err) {
          console.warn("[Vault] Failed to emit vault change:", err);
        }
        return { success: true, path: vault.path };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    // Calendar / Tasks handlers
    "calendar:list": async () => {
      const { getMergedTasks } = await import("@scholaros/core/dist/calendar/frontmatter-scanner.js");
      const tasks = await getMergedTasks();
      return { tasks };
    },
    "calendar:create": async (_event, args) => {
      const { getTaskRepo } = await import("@scholaros/core/dist/calendar/repo.js");
      const repo = getTaskRepo();
      const task = await repo.create({
        title: args.title,
        due: args.due,
        dueTime: args.dueTime,
        type: args.type,
        source: args.source,
        description: args.description,
      });
      return { task };
    },
    "calendar:complete": async (_event, args) => {
      const { getTaskRepo } = await import("@scholaros/core/dist/calendar/repo.js");
      const repo = getTaskRepo();
      const task = await repo.complete(args.id);
      return { task };
    },
    "calendar:delete": async (_event, args) => {
      const { getTaskRepo } = await import("@scholaros/core/dist/calendar/repo.js");
      const repo = getTaskRepo();
      await repo.delete(args.id);
      return { success: true as const };
    },
    "calendar:upcoming": async (_event, args) => {
      const { getTaskRepo } = await import("@scholaros/core/dist/calendar/repo.js");
      const repo = getTaskRepo();
      const tasks = await repo.getUpcoming(args.days || 14);
      return { tasks };
    },
    // Knowledge Graph handlers
    "knowledge-graph:query": async (_event, args) => {
      const service = getKnowledgeGraphService();
      if (!service) return { results: [] };
      const results = service.getGraph().query(args);
      return { results };
    },
    "knowledge-graph:getStats": async () => {
      const service = getKnowledgeGraphService();
      if (!service) return {
        totalNodes: 0,
        totalFacts: 0,
        userBranchNodes: 0,
        directivesBranchNodes: 0,
        worldBranchNodes: 0,
        lastRunTime: null,
        totalRunsProcessed: 0,
        archivedNodes: 0,
      };
      return service.getGraph().getStats();
    },
    "knowledge-graph:getWarmProfile": async () => {
      const { buildWarmProfile } = await import("@scholaros/core/dist/knowledge/graph/warm-profile.js");
      const service = getKnowledgeGraphService();
      if (!service) return { profile: null };
      const profile = buildWarmProfile(service.getGraph());
      return { profile };
    },
    "knowledge-graph:processNow": async () => {
      const service = getKnowledgeGraphService();
      if (!service) return { runsProcessed: 0, factsExtracted: 0 };
      return service.manualProcess();
    },
    "knowledge-graph:buildWiki": async (_event, args) => {
      const { buildWikiGraph } = await import("@scholaros/core/dist/knowledge/wiki-link-graph.js");
      return buildWikiGraph(args.projectPath);
    },
    "knowledge-graph:getInsights": async () => {
      const { buildWikiGraph } = await import("@scholaros/core/dist/knowledge/wiki-link-graph.js");
      const { findSurprisingConnections, detectKnowledgeGaps } = await import("@scholaros/core/dist/knowledge/graph-insights.js");
      const graph = await buildWikiGraph();
      const insights = {
        surprisingConnections: findSurprisingConnections(graph.nodes, graph.edges, graph.communities),
        knowledgeGaps: detectKnowledgeGaps(graph.nodes, graph.edges, graph.communities),
      };
      return insights;
    },
    "knowledge-graph:suggestTopics": async () => {
      const service = getKnowledgeGraphService();
      if (!service) return { topics: [] };
      const graph = service.getGraph();
      const topNodes = graph.getTopNodes(15);

      const topics = topNodes
        .filter((n) => n.facts.length > 0 && n.branch !== 'world')
        .map((n) => {
          const path = graph.getPath(n.id);
          const courseSegment = path.find(
            (p) => p !== 'root' && p !== 'User' && p !== 'Directives' && p !== 'World',
          );
          return {
            title: n.name,
            description: n.facts.slice(0, 2).join('. ') + '.',
            category: n.branch === 'user' ? 'Concepts' : 'Resources',
            course: courseSegment !== n.name ? courseSegment : undefined,
          };
        });

      return { topics };
    },
    // Review System handlers
    "review:getItems": async (_event, args) => {
      const store = getReviewStore();
      if (!store) return { items: [] };
      const items = store.getItems(args.type);
      return { items };
    },
    "review:resolve": async (_event, args) => {
      const store = getReviewStore();
      if (!store) return { success: false };
      store.resolveItem(args.id, args.action);
      return { success: true };
    },
    "review:dismiss": async (_event, args) => {
      const store = getReviewStore();
      if (!store) return { success: false };
      store.dismissItem(args.id);
      return { success: true };
    },
    "review:clearResolved": async () => {
      const store = getReviewStore();
      if (!store) return { success: false };
      store.clearResolved();
      return { success: true };
    },
    // Deep Research handlers
    "research:start": async (_event, args) => {
      const sessionId = await researchHandler.startResearch(
        args.query,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args.category as any,
        { rounds: args.rounds, model: args.model, provider: args.provider }
      );
      return { sessionId };
    },
    "research:status": async (_event, args) => {
      return researchHandler.getProgress(args.sessionId);
    },
    "research:cancel": async (_event, args) => {
      researchHandler.cancelResearch(args.sessionId);
      return { success: true };
    },
    "research:result": async (_event, args) => {
      const session = researchHandler.getResult(args.sessionId);
      return session;
    },
    "research:list": async () => {
      const sessions = await researchHandler.listCompleted();
      return { sessions };
    },
    "research:delete": async (_event, args) => {
      await researchHandler.deleteResearch(args.sessionId);
      return { success: true };
    },
    // Embedded browser handlers (WebContentsView + navigation)
    ...browserIpcHandlers,
  });
}
