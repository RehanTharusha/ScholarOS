import {
  app,
  BrowserWindow,
  protocol,
  net,
  shell,
  session,
  dialog,
} from "electron";
import path from "node:path";
import {
  setupIpcHandlers,
  startRunsWatcher,
  startServicesWatcher,
  startResearchWatcher,
  startWorkspaceWatcher,
  stopRunsWatcher,
  stopServicesWatcher,
  stopResearchWatcher,
  stopWorkspaceWatcher,
  initKnowledgeGraphService,
  shutdownKnowledgeGraphService,
  initReviewStore,
} from "./ipc.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { updateElectronApp, UpdateSourceType } from "update-electron-app";
import {
  init as initLocalSites,
  shutdown as shutdownLocalSites,
} from "@scholaros/core/dist/local-sites/server.js";

import { initConfigs } from "@scholaros/core/dist/config/initConfigs.js";
import started from "electron-squirrel-startup";
import { execSync, execFileSync } from "node:child_process";
import { registerBrowserControlService } from "@scholaros/core/dist/di/container.js";
import { browserViewManager, BROWSER_PARTITION } from "./browser/view.js";
import { setupBrowserEventForwarding } from "./browser/ipc.js";
import { ElectronBrowserControlService } from "./browser/control-service.js";
import { getRendererUrl } from "./app-url.js";
import { configureSessionPermissions } from "./session-utils.js";
import {
  cleanupPreviousInstall,
  shouldRunCleanup,
  markCleanupDone,
} from "./cleanup.js";
import pkg from "../package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Memory pressure sampler. Samples process.memoryUsage() every
 * 30s and warns (or pushes a `main:mempressure` IPC event) if RSS
 * exceeds 1.5GB. The main process can leak memory in long-running
 * sessions â€” a 24h session can easily reach 2-3GB if not watched.
 *
 * The thresholds are conservative; tune in production.
 */
const MEM_PRESSURE_WARN_MB = 1500;
const MEM_PRESSURE_CRITICAL_MB = 2200;
const MEM_SAMPLE_INTERVAL_MS = 30_000;

let lastMemWarnMB = 0;
const memSampler = setInterval(() => {
  const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  if (rssMB >= MEM_PRESSURE_CRITICAL_MB) {
    console.warn(
      `[Main] CRITICAL memory pressure: ${rssMB}MB RSS. ` +
        `Consider restarting the app.`,
    );
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send("main:mempressure", { level: "critical", rssMB });
      }
    }
  } else if (rssMB >= MEM_PRESSURE_WARN_MB && rssMB - lastMemWarnMB >= 100) {
    lastMemWarnMB = rssMB;
    console.warn(`[Main] memory pressure: ${rssMB}MB RSS`);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send("main:mempressure", { level: "warn", rssMB });
      }
    }
  }
}, MEM_SAMPLE_INTERVAL_MS);
memSampler.unref?.();

// Handle EPIPE errors that can occur when stdout/stderr pipes are closed
// (e.g., when running under concurrently with broken pipes)
// This must be done very early to catch any errors from initialization code
if (process.stdout) {
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      // Silently ignore broken pipe errors
      return;
    }
    console.error("Stdout error:", err);
  });
}
if (process.stderr) {
  process.stderr.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") {
      // Silently ignore broken pipe errors
      return;
    }
    console.error("Stderr error:", err);
  });

/**
 * Process-level crash handlers. Without these, a single uncaught
 * exception or unhandled promise rejection in the main process takes
 * the entire app down — losing unsaved work, breaking long-running
 * agents, and producing a frustrating experience.
 *
 * Strategy: log the error with full context, surface it to the user via
 * a dialog (only for uncaughtException, since rejections are usually
 * already-handled async errors), but do NOT exit. The next IPC roundtrip
 * from the renderer that touches a broken subsystem will surface the
 * actual error in a more useful place.
 */
process.on("uncaughtException", (err, origin) => {
  console.error(
    `[Main] UNCAUGHT EXCEPTION (${origin}). Continuing.\n${err.stack ?? err}`,
  );
  try {
    // Show a dialog only if the app is initialized; otherwise it crashes.
    if (app.isReady()) {
      dialog.showErrorBox(
        "ScholarOS hit an unexpected error",
        `${err.message}\n\nThe error has been logged. You can keep working, but some features may be affected.`,
      );
    }
  } catch {
    // ignore - dialog may not be available
  }
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error(
    `[Main] UNHANDLED PROMISE REJECTION. Continuing.\n${err.stack ?? err.message ?? err}`,
  );
  // Intentionally not showing a dialog here. Unhandled rejections are often
  // benign (e.g., a fire-and-forget IPC that the renderer no longer cares
  // about). Logging is enough; surfacing them as a modal would be noisy.
});

process.on("warning", (warning) => {
  // Deprecation warnings, unhandled experimental flags, etc. Log to help
  // diagnose issues without crashing the app.
  console.warn(`[Main] Node warning: ${warning.name}: ${warning.message}`);
});

}

// Clean up old ScholarOS cache/config on Squirrel install/update
// (Windows). Never touches the user's vault.
if (started) {
  const isInstallOrUpdate = process.argv.some(
    (arg) => arg === "--squirrel-install" || arg === "--squirrel-updated",
  );
  if (isInstallOrUpdate) {
    cleanupPreviousInstall();
  }
  app.quit();
}

// Fix PATH for packaged Electron apps on macOS/Linux.
// Packaged apps inherit a minimal environment that doesn't include paths from
// the user's shell profile (such as those provided by nvm, Homebrew, etc.).
// The function below spawns the user's login shell and runs a Node.js one-liner
// to print the full environment as JSON, then merges it into process.env.
// This ensures the Electron app has the same PATH and environment as user shell
// (helping find tools installed via Homebrew/nvm/npm, etc.)
function initializeExecutionEnvironment(): void {
  if (process.platform === "win32") return;

  const shell = process.env.SHELL || "/bin/zsh";

  try {
    const stdout = execFileSync(
      shell,
      ["-l", "-c", `node -p "JSON.stringify(process.env)"`],
      { encoding: "utf8" },
    ).trim();

    const env = JSON.parse(stdout) as Record<string, string>;
    process.env = { ...env, ...process.env };
  } catch (error) {
    console.error("Failed to load shell environment", error);
  }
}
initializeExecutionEnvironment();

// Path resolution differs between development and production:
const preloadPath = app.isPackaged
  ? path.join(__dirname, "../preload/dist/preload.js")
  : path.join(__dirname, "../../../preload/dist/preload.js");
console.log("preloadPath", preloadPath);

const rendererPath = app.isPackaged
  ? path.join(__dirname, "../renderer/dist")
  : path.join(__dirname, "../../../renderer/dist");

// Register custom protocol for serving built renderer files in production.
// This keeps SPA routes working when users deep link into the packaged app.
function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);

    // url.pathname starts with "/"
    let urlPath = url.pathname;

    // If it's "/" or a SPA route (no extension), serve index.html
    if (urlPath === "/" || !path.extname(urlPath)) {
      urlPath = "/index.html";
    }

    const filePath = path.join(rendererPath, urlPath);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
      // optional but often helpful:
      // stream: true,
    },
  },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 600,
    minHeight: 480,
    show: false, // Don't show until ready
    backgroundColor: "#252525", // Prevent white flash (matches dark mode)
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      // IMPORTANT: keep Node out of renderer
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadPath,
    },
  });

  configureSessionPermissions(session.defaultSession);
  configureSessionPermissions(session.fromPartition(BROWSER_PARTITION));

  // Set Content Security Policy to mitigate XSS and data injection
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
          "img-src 'self' data: blob:; " +
          "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
          "connect-src 'self' ws: wss: http://localhost:5173 https://cdn.jsdelivr.net; " +
          "media-src 'self' mediastream:; " +
          "frame-src 'self' http://localhost:*; " +
          "object-src 'none';",
        ],
      },
    });
  });

  // Show window when content is ready to prevent blank screen
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  // Open external links in system browser (not sandboxed Electron window)
  // This handles window.open() and target="_blank" links
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Handle navigation to external URLs (e.g., clicking a link without target="_blank")
  win.webContents.on("will-navigate", (event, url) => {
    const isInternal =
      url.startsWith("app://") || url.startsWith("http://localhost:5173");
    if (!isInternal) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Attach the embedded browser pane manager to this window.
  // The WebContentsView is created lazily on first `browser:setVisible`.
  browserViewManager.attach(win);

  // In development, open devtools and forward renderer console messages
  if (!app.isPackaged) {
    try {
      win.webContents.openDevTools({ mode: "detach" });
      win.webContents.on(
        "console-message",
        (_event, level, message, line, sourceId) => {
          console.log(
            `[Renderer][console:${level}] ${message} (${sourceId}:${line})`,
          );
        },
      );
    } catch (err) {
      console.warn("Failed to open devtools or attach console listener:", err);
    }
  }

  if (app.isPackaged) {
    win.loadURL(getRendererUrl());
  } else {
    win.loadURL(getRendererUrl());
  }
}

app.whenReady().then(async () => {
  try {
    // Clean up old cache/config from previous versions (runs once per version).
    // On Windows this is already handled by squirrel install/update events above.
    if (shouldRunCleanup(pkg.version)) {
      cleanupPreviousInstall();
      markCleanupDone(pkg.version);
    }

    // Register custom protocol before creating window (for production builds)
    if (app.isPackaged) {
      registerAppProtocol();
    }

    // Initialize auto-updater (only in production)
    if (app.isPackaged) {
      updateElectronApp({
        updateSource: {
          type: UpdateSourceType.ElectronPublicUpdateService,
          repo: "RehanTharusha/ScholarOS",
        },
        notifyUser: true, // Shows native dialog when update is available
      });
    }

    // Ensure agent-slack CLI is available
    try {
      execSync("agent-slack --version", { stdio: "ignore", timeout: 5000 });
    } catch {
      console.warn(
        "agent-slack not found; Slack connector features will stay disabled until it is installed.",
      );
    }

    // Initialize all config files before UI can access them
    console.log("[Main] Initializing config files...");
    await initConfigs();
    console.log("[Main] Config files initialized successfully");

    registerBrowserControlService(new ElectronBrowserControlService());

    setupIpcHandlers();
    setupBrowserEventForwarding();

    createWindow();

    // Start workspace watcher as a main-process service
    // Watcher runs independently and catches ALL filesystem changes:
    // - Changes made via IPC handlers (workspace:writeFile, etc.)
    // - External changes (terminal, git, other editors)
    // Only starts once (guarded in startWorkspaceWatcher)
    startWorkspaceWatcher();

    // start runs watcher
    startRunsWatcher();

    // start services watcher
    startServicesWatcher();

    // start research watcher
    startResearchWatcher();

    // start local sites server for iframe dashboards and other mini apps
    initLocalSites().catch((error) => {
      console.error("[LocalSites] Failed to start:", error);
    });

    // start knowledge graph service
    initKnowledgeGraphService().catch((error) => {
      console.error("[KnowledgeGraph] Failed to start:", error);
    });

    // start review store
    initReviewStore().catch((error) => {
      console.error("[ReviewStore] Failed to start:", error);
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error("[Main] Fatal error during initialization:", error);
    // Show error dialog and quit
    dialog.showErrorBox(
      "Application Error",
      "Failed to initialize application. Please check the logs.",
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // On all platforms except macOS, quit the app when all windows are closed
  // On macOS, apps typically stay active until explicitly quit
  if (process.platform !== "darwin") {
    // Force quit to ensure all processes are terminated
    app.quit();
  }
});

app.on("before-quit", () => {
  // Clean up all services on app quit
  stopWorkspaceWatcher();
  stopRunsWatcher();
  stopServicesWatcher();
  stopResearchWatcher();
  shutdownKnowledgeGraphService().catch((error) => {
    console.error("[KnowledgeGraph] Failed to shut down cleanly:", error);
  });
  shutdownLocalSites().catch((error) => {
    console.error("[LocalSites] Failed to shut down cleanly:", error);
  });
});
