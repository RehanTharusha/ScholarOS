import { homedir, tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";

const ROWBOAT_DIR = path.join(homedir(), ".rowboat");
const APP_NAME = "ScholarOS";
const CLEANUP_SENTINEL = path.join(
  ROWBOAT_DIR,
  "config",
  ".cleanup-sentinel",
);

function getElectronUserDataPath(): string {
  const home = homedir();
  switch (process.platform) {
    case "win32":
      return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), APP_NAME);
    case "darwin":
      return path.join(home, "Library", "Application Support", APP_NAME);
    default:
      return path.join(home, ".config", APP_NAME);
  }
}

// read vault path to know what to NEVER touch
function getVaultPath(): string | null {
  const vaultConfigPath = path.join(ROWBOAT_DIR, "config", "vault.json");
  try {
    if (fs.existsSync(vaultConfigPath)) {
      const cfg = JSON.parse(fs.readFileSync(vaultConfigPath, "utf-8"));
      if (typeof cfg.path === "string") {
        return path.resolve(cfg.path);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function safeRmdir(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`[Cleanup] Removed: ${dirPath}`);
    }
  } catch (err) {
    console.warn(`[Cleanup] Failed to remove ${dirPath}:`, err);
  }
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Cleanup] Removed: ${filePath}`);
    }
  } catch (err) {
    console.warn(`[Cleanup] Failed to remove ${filePath}:`, err);
  }
}

function cleanElectronCaches(): void {
  const userData = getElectronUserDataPath();
  const cacheDirs = ["Cache", "Code Cache", "GPUCache", "Partitions"];
  for (const dir of cacheDirs) {
    safeRmdir(path.join(userData, dir));
  }
}

function cleanSystemTemp(): void {
  const tmp = tmpdir();
  try {
    for (const entry of fs.readdirSync(tmp)) {
      if (entry.startsWith("rowboat-")) {
        const fullPath = path.join(tmp, entry);
        safeRmdir(fullPath);
      }
    }
  } catch (err) {
    console.warn(`[Cleanup] Failed to scan temp dir:`, err);
  }
}

// holds paths to clean that we know are safe (never vault content)
const SAFE_CLEAN_PATHS = [
  // Global config (recreated on startup)
  path.join(ROWBOAT_DIR, "config"),
  // Research cache
  path.join(ROWBOAT_DIR, "research"),
  // Logs
  path.join(ROWBOAT_DIR, "logs"),
  // Agent memory inbox (regenerated from conversations)
  path.join(ROWBOAT_DIR, "memory", "inbox.md"),
  // Old .rowboat root junk files
  path.join(ROWBOAT_DIR, ".last-run"),
  path.join(ROWBOAT_DIR, ".lock"),
];

export function cleanupPreviousInstall(): void {
  try {
    console.log("[Cleanup] Starting cleanup of previous install artifacts...");
    const vaultPath = getVaultPath();

    for (const cleanPath of SAFE_CLEAN_PATHS) {
      if (!fs.existsSync(cleanPath)) continue;

      // Never touch the vault
      if (vaultPath) {
        const resolved = path.resolve(cleanPath);
        const resolvedVault = path.resolve(vaultPath);
        if (
          resolved === resolvedVault ||
          resolved.startsWith(resolvedVault + path.sep)
        ) {
          console.log(`[Cleanup] Skipping ${cleanPath} (inside vault)`);
          continue;
        }
      }

      if (fs.statSync(cleanPath).isDirectory()) {
        safeRmdir(cleanPath);
      } else {
        safeUnlink(cleanPath);
      }
    }

    cleanSystemTemp();
    cleanElectronCaches();

    console.log("[Cleanup] Cleanup complete");
  } catch (err) {
    console.error("[Cleanup] Error during cleanup:", err);
  }
}

export function shouldRunCleanup(currentVersion?: string): boolean {
  try {
    if (fs.existsSync(CLEANUP_SENTINEL)) {
      const storedVersion = fs.readFileSync(CLEANUP_SENTINEL, "utf-8").trim();
      if (storedVersion === currentVersion) {
        return false; // already cleaned for this version
      }
    }
  } catch {
    // ignore
  }
  return true;
}

export function markCleanupDone(version: string): void {
  try {
    const dir = path.dirname(CLEANUP_SENTINEL);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CLEANUP_SENTINEL, version, "utf-8");
  } catch (err) {
    console.warn(`[Cleanup] Failed to write sentinel:`, err);
  }
}
