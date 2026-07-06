import path from "path";
import fs from "fs";
import { homedir } from "os";

export const SCHOLAROS_INTERNAL_ROOT = ".scholarOS";
export const SCHOLAROS_INTERNAL_TOP_LEVEL_NAMES = new Set([
  "agents",
  "bases",
  "calendar",
  "config",
  "data",
  "events",
  "logs",
  "runs",
  "sites",
  "agent-notes",
  "gmail_sync",
  ".knowledge-graph",
  ".knowledge-history",
  ".trash",
  "agent_notes_state.json",
]);

export function getScholarOSDir(): string {
  return path.join(WorkDir, SCHOLAROS_INTERNAL_ROOT);
}

export function getScholarOSPath(...segments: string[]): string {
  return path.join(getScholarOSDir(), ...segments);
}

export function mapWorkspaceRelPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return normalized;
  if (
    normalized === SCHOLAROS_INTERNAL_ROOT ||
    normalized.startsWith(`${SCHOLAROS_INTERNAL_ROOT}/`)
  ) {
    return normalized;
  }

  const topLevel = normalized.split("/")[0]?.toLowerCase() ?? "";
  if (SCHOLAROS_INTERNAL_TOP_LEVEL_NAMES.has(topLevel)) {
    return path.posix.join(SCHOLAROS_INTERNAL_ROOT, normalized);
  }

  return normalized;
}

function resolveWorkDir(): string {
  // Check for saved vault path first
  const vaultConfigPath = path.join(
    homedir(),
    ".scholarOS",
    "config",
    "vault.json",
  );
  try {
    if (fs.existsSync(vaultConfigPath)) {
      const vaultConfig = JSON.parse(fs.readFileSync(vaultConfigPath, "utf-8"));
      if (vaultConfig.path && typeof vaultConfig.path === "string") {
        let expandedPath = vaultConfig.path;
        // Expand ~ if present
        if (
          expandedPath === "~" ||
          expandedPath.startsWith("~/") ||
          expandedPath.startsWith("~\\")
        ) {
          expandedPath = path.join(homedir(), expandedPath.slice(2));
        }
        expandedPath = path.resolve(expandedPath);
        // Verify the path exists
        if (fs.existsSync(expandedPath)) {
          console.log(`[Config] Using vault path: ${expandedPath}`);
          return expandedPath;
        } else {
          console.warn(
            `[Config] Saved vault path ${expandedPath} does not exist, falling back to default`,
          );
        }
      }
    }
  } catch (error) {
    console.error("[Config] Failed to read vault config:", error);
  }

  // Fallback to environment variable or default
  const configured = process.env.SCHOLAROS_WORKDIR;
  if (!configured) {
    const defaultPath = path.join(homedir(), ".scholarOS");
    console.log(`[Config] Using default vault path: ${defaultPath}`);
    return defaultPath;
  }

  const expanded =
    configured === "~"
      ? homedir()
      : configured.startsWith("~/") || configured.startsWith("~\\")
        ? path.join(homedir(), configured.slice(2))
        : configured;

  const resolvedPath = path.resolve(expanded);
  console.log(`[Config] Using env-configured vault path: ${resolvedPath}`);
  return resolvedPath;
}

/**
 * Global config directory — lives at ~/.scholarOS/config/
 * This is the default location for app-wide settings that persist across vault switches:
 * model config, MCP servers, OAuth tokens, Slack config, security allow-lists, voice config,
 * Composio config, user profile, and the models.dev catalog cache.
 *
 * Switching vaults (WorkDir) only changes where the agent works, NOT the app's own config.
 */
export const GlobalConfigDir = path.join(homedir(), ".scholarOS", "config");

// Resolve app root relative to compiled file location (dist/...)
// Allow override via SCHOLAROS_WORKDIR env var for standalone pipeline usage.
// Normalize to an absolute path so workspace boundary checks behave consistently.
// Export WorkDir as a live binding so it can be refreshed at runtime when vault changes
export let WorkDir = resolveWorkDir();

/**
 * Set WorkDir to an empty string (no vault active).
 * Any workspace operations will short-circuit gracefully.
 */
export function clearWorkDir(): void {
  WorkDir = "";
  console.log("[Config] WorkDir cleared (no vault active)");
}

/**
 * Refresh WorkDir value by re-resolving vault config and ensuring directories exist
 */
export function refreshWorkDir(): void {
  WorkDir = resolveWorkDir();
  try {
    ensureDirs();
    ensureDefaultConfigs();
  } catch (err) {
    console.error("[Config] Failed to ensure dirs after refresh:", err);
  }
  console.log(`[Config] WorkDir refreshed: ${WorkDir}`);
}

/**
 * Save the selected vault path to config.
 * This allows the app to remember which vault/folder was last opened.
 */
export function saveVaultPath(vaultPath: string): void {
  const vaultConfigPath = path.join(
    homedir(),
    ".scholarOS",
    "config",
    "vault.json",
  );
  const dir = path.dirname(vaultConfigPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const expandedPath =
    vaultPath.startsWith("~/") || vaultPath.startsWith("~\\")
      ? path.join(homedir(), vaultPath.slice(2))
      : path.resolve(vaultPath);

  fs.writeFileSync(
    vaultConfigPath,
    JSON.stringify({ path: expandedPath }, null, 2),
  );
  // Keep vaults.json in sync
  const vaultsCfg = readVaultsConfig();
  if (!vaultsCfg.vaults.find((v) => v.path === expandedPath)) {
    const name = expandedPath.split(/[\\/]/).pop() || "Vault";
    vaultsCfg.vaults.push({ id: generateVaultId(), name, path: expandedPath });
    if (!vaultsCfg.activeVaultId) {
      const added = vaultsCfg.vaults[vaultsCfg.vaults.length - 1];
      vaultsCfg.activeVaultId = added?.id ?? null;
    }
    writeVaultsConfig(vaultsCfg);
  }
}

// ============================================================================
// Multi-vault management
// ============================================================================

const VAULTS_CONFIG_PATH = path.join(homedir(), ".scholarOS", "config", "vaults.json");

interface VaultsConfig {
  vaults: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  activeVaultId: string | null;
}

function generateVaultId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function readVaultsConfig(): VaultsConfig {
  try {
    if (fs.existsSync(VAULTS_CONFIG_PATH)) {
      const raw = fs.readFileSync(VAULTS_CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.vaults)) {
        return parsed as VaultsConfig;
      }
    }
  } catch (err) {
    console.error("[Config] Failed to read vaults config:", err);
  }
  return { vaults: [], activeVaultId: null };
}

function writeVaultsConfig(config: VaultsConfig): void {
  const dir = path.dirname(VAULTS_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(VAULTS_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Get all registered vaults and the active vault ID.
 * Auto-migrates the legacy vault.json path into vaults.json if missing.
 */
export function listVaults(): { vaults: VaultsConfig["vaults"]; activeVaultId: string | null } {
  const config = readVaultsConfig();
  const savedPath = getVaultPath();
  if (savedPath && !config.vaults.find((v) => v.path === savedPath)) {
    const name = savedPath.split(/[\\/]/).pop() || "Vault";
    config.vaults.push({ id: generateVaultId(), name, path: savedPath });
    if (!config.activeVaultId) {
      config.activeVaultId = config.vaults[config.vaults.length - 1]!.id;
    }
    writeVaultsConfig(config);
  }
  return { vaults: config.vaults, activeVaultId: config.activeVaultId };
}

/**
 * Add a vault path to the vaults list.
 * Generates an ID and derives the display name from the folder name.
 */
export function addVault(vaultPath: string): { vaults: VaultsConfig["vaults"]; activeVaultId: string | null; id: string } {
  const config = readVaultsConfig();
  const expandedPath = path.resolve(
    vaultPath.startsWith("~/") || vaultPath.startsWith("~\\")
      ? path.join(homedir(), vaultPath.slice(2))
      : vaultPath,
  );
  // Skip if already added
  const existing = config.vaults.find((v) => v.path === expandedPath);
  if (existing) return { vaults: config.vaults, activeVaultId: config.activeVaultId, id: existing.id };
  const id = generateVaultId();
  const name = expandedPath.split(/[\\/]/).pop() || "Vault";
  config.vaults.push({ id, name, path: expandedPath });
  writeVaultsConfig(config);
  return { vaults: config.vaults, activeVaultId: config.activeVaultId, id };
}

/**
 * Remove a vault from the vaults list by ID.
 * Does NOT delete the folder on disk.
 */
export function removeVault(id: string): { vaults: VaultsConfig["vaults"]; activeVaultId: string | null } {
  const config = readVaultsConfig();
  config.vaults = config.vaults.filter((v) => v.id !== id);
  if (config.activeVaultId === id) {
    config.activeVaultId = config.vaults.length > 0 ? config.vaults[0]!.id : null;
  }
  writeVaultsConfig(config);
  return { vaults: config.vaults, activeVaultId: config.activeVaultId };
}

/**
 * Set the active vault by ID, updating both vaults.json and vault.json.
 */
export function setActiveVault(id: string): boolean {
  const config = readVaultsConfig();
  const vault = config.vaults.find((v) => v.id === id);
  if (!vault) return false;
  config.activeVaultId = id;
  writeVaultsConfig(config);
  saveVaultPath(vault.path);
  return true;
}

/**
 * Clear the saved vault path (set to no vault).
 * WorkDir will fall back to ~/.scholarOS on next refresh.
 */
export function clearVaultPath(): void {
  const vaultConfigPath = path.join(
    homedir(),
    ".scholarOS",
    "config",
    "vault.json",
  );
  try {
    if (fs.existsSync(vaultConfigPath)) {
      fs.unlinkSync(vaultConfigPath);
      console.log("[Config] Vault path cleared");
    }
  } catch (err) {
    console.error("[Config] Failed to clear vault path:", err);
  }
}

/**
 * Get the saved vault path, if any.
 * Returns null if no vault has been saved.
 */
export function getVaultPath(): string | null {
  const vaultConfigPath = path.join(
    homedir(),
    ".scholarOS",
    "config",
    "vault.json",
  );
  try {
    if (fs.existsSync(vaultConfigPath)) {
      const vaultConfig = JSON.parse(fs.readFileSync(vaultConfigPath, "utf-8"));
      if (vaultConfig.path && typeof vaultConfig.path === "string") {
        return vaultConfig.path;
      }
    }
  } catch (error) {
    console.error("[Config] Failed to read vault config:", error);
  }
  return null;
}

function ensureDirs() {
  const ensure = (p: string) => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  };
  ensure(WorkDir);
  ensure(getScholarOSDir());

  // Migrate legacy top-level folders into .scholarOS/ BEFORE creating
  // subdirs so rename doesn't conflict with an empty target directory.
  const moveLegacyInternalPath = (name: string) => {
    const legacyPath = path.join(WorkDir, name);
    const nextPath = getScholarOSPath(name);
    if (!fs.existsSync(legacyPath) || fs.existsSync(nextPath)) return;
    try {
      fs.renameSync(legacyPath, nextPath);
      console.log(`[Config] Moved legacy internal path ${name} -> ${nextPath}`);
    } catch (error) {
      console.warn(
        `[Config] Failed to move legacy internal path ${name}:`,
        error,
      );
    }
  };

  for (const name of SCHOLAROS_INTERNAL_TOP_LEVEL_NAMES) {
    moveLegacyInternalPath(name);
  }

  // Now ensure required subdirs exist (after migration so empty dirs don't
  // block rename of a legacy folder with the same name)
  ensure(getScholarOSPath("agents"));
  ensure(getScholarOSPath("config"));
}

function ensureDefaultConfigs() {
  // Create note_creation.json with default strictness if it doesn't exist
  const noteCreationConfig = getScholarOSPath("config", "note_creation.json");
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
 * App-level configuration (stored globally, persists across vault changes)
 * Located at ~/.scholarOS/config/app.json
 */
const APP_CONFIG_DIR = path.join(homedir(), ".scholarOS", "config");
const APP_CONFIG_FILE = path.join(APP_CONFIG_DIR, "app.json");

interface AppConfig {
  onboardingComplete?: boolean;
  // Add other app-level settings here in the future
}

function readAppConfig(): AppConfig {
  try {
    if (!fs.existsSync(APP_CONFIG_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(APP_CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    return {};
  }
}

function writeAppConfig(config: AppConfig): void {
  if (!fs.existsSync(APP_CONFIG_DIR)) {
    fs.mkdirSync(APP_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(APP_CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Check if onboarding has been completed (app-level, persists across vaults).
 */
export function isOnboardingComplete(): boolean {
  const config = readAppConfig();
  return config.onboardingComplete === true;
}

/**
 * Mark onboarding as complete (app-level, persists across vaults).
 */
export function markOnboardingComplete(): void {
  const config = readAppConfig();
  config.onboardingComplete = true;
  writeAppConfig(config);
}

/**
 * Reset onboarding to incomplete state (dev only — for re-running onboarding).
 */
export function resetOnboarding(): void {
  const config = readAppConfig();
  config.onboardingComplete = false;
  writeAppConfig(config);
}

/**
 * Check if tools should be disabled for development/testing.
 * Useful for testing LLMs that don't support tool_choice parameter.
 *
 * Configuration priority (highest to lowest):
 * 1. SCHOLAROS_DISABLE_TOOLS environment variable
 * 2. ~/.scholarOS/config/dev.json { disableTools: true }
 * 3. Default: false (tools enabled)
 */
export function shouldDisableTools(): boolean {
  // Check environment variable first
  if (process.env.SCHOLAROS_DISABLE_TOOLS === "true") {
    return true;
  }

  // Check dev config file
  try {
    const devConfigPath = getScholarOSPath("config", "dev.json");
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

/**
 * Check if onboarding should be force-shown for development.
 * When enabled, the onboarding modal appears regardless of actual completion state.
 *
 * Configuration priority (highest to lowest):
 * 1. SCHOLAROS_SHOW_ONBOARDING environment variable ("true")
 * 2. ~/.scholarOS/config/dev.json { showOnboarding: true }
 * 3. Default: false (normal behavior)
 */
export function shouldShowOnboardingOverride(): boolean {
  if (process.env.SCHOLAROS_SHOW_ONBOARDING === "true") {
    return true;
  }

  try {
    const devConfigPath = getScholarOSPath("config", "dev.json");
    if (fs.existsSync(devConfigPath)) {
      const config = JSON.parse(fs.readFileSync(devConfigPath, "utf-8"));
      if (config.showOnboarding === true) {
        return true;
      }
    }
  } catch {
    // Ignore config errors
  }

  return false;
}

// Initialize version history repo (async, fire-and-forget on startup)
import("../knowledge/version_history.js")
  .then((m) => m.initRepo())
  .catch((err) => {
    console.error("[VersionHistory] Failed to init repo:", err);
  });
