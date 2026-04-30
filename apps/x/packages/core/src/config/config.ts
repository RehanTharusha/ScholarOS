import path from "path";
import fs from "fs";
import { homedir } from "os";
import { fileURLToPath } from "url";

function resolveWorkDir(): string {
  const configured = process.env.ROWBOAT_WORKDIR;
  if (!configured) {
    return path.join(homedir(), ".rowboat");
  }

  const expanded =
    configured === "~"
      ? homedir()
      : configured.startsWith("~/") || configured.startsWith("~\\")
        ? path.join(homedir(), configured.slice(2))
        : configured;

  return path.resolve(expanded);
}

// Resolve app root relative to compiled file location (dist/...)
// Allow override via ROWBOAT_WORKDIR env var for standalone pipeline usage.
// Normalize to an absolute path so workspace boundary checks behave consistently.
export const WorkDir = resolveWorkDir();

// Get the directory of this file (for locating bundled assets)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureDirs() {
  const ensure = (p: string) => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  };
  ensure(WorkDir);
  ensure(path.join(WorkDir, "agents"));
  ensure(path.join(WorkDir, "config"));
  ensure(path.join(WorkDir, "knowledge"));
}

function ensureDefaultConfigs() {
  // Create note_creation.json with default strictness if it doesn't exist
  const noteCreationConfig = path.join(WorkDir, "config", "note_creation.json");
  if (!fs.existsSync(noteCreationConfig)) {
    fs.writeFileSync(
      noteCreationConfig,
      JSON.stringify(
        {
          strictness: "medium",
          configured: false,
        },
        null,
        2,
      ),
    );
  }
}

ensureDirs();
ensureDefaultConfigs();

/**
 * Check if tools should be disabled for development/testing.
 * Useful for testing LLMs that don't support tool_choice parameter.
 *
 * Configuration priority (highest to lowest):
 * 1. SCHOLAROS_DISABLE_TOOLS environment variable
 * 2. ~/.rowboat/config/dev.json { disableTools: true }
 * 3. Default: false (tools enabled)
 */
export function shouldDisableTools(): boolean {
  // Check environment variable first
  if (process.env.SCHOLAROS_DISABLE_TOOLS === "true") {
    return true;
  }

  // Check dev config file
  try {
    const devConfigPath = path.join(WorkDir, "config", "dev.json");
    if (fs.existsSync(devConfigPath)) {
      const config = JSON.parse(fs.readFileSync(devConfigPath, "utf-8"));
      if (config.disableTools === true) {
        return true;
      }
    }
  } catch {
    // Ignore config errors
  }

  return false;
}

// Ensure default knowledge files exist
import("../knowledge/ensure_daily_note.js")
  .then((m) => m.ensureDailyNote())
  .catch((err) => {
    console.error("[DailyNote] Failed to ensure daily note:", err);
  });

// Initialize version history repo (async, fire-and-forget on startup)
import("../knowledge/version_history.js")
  .then((m) => m.initRepo())
  .catch((err) => {
    console.error("[VersionHistory] Failed to init repo:", err);
  });
