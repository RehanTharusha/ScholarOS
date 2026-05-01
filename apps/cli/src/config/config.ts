import path from "path";
import fs from "fs";
import { homedir } from "os";

function resolveWorkDir(): string {
  const vaultConfigPath = path.join(
    homedir(),
    ".rowboat",
    "config",
    "vault.json",
  );
  try {
    if (fs.existsSync(vaultConfigPath)) {
      const vaultConfig = JSON.parse(fs.readFileSync(vaultConfigPath, "utf-8"));
      if (vaultConfig.path && typeof vaultConfig.path === "string") {
        let expandedPath = vaultConfig.path;
        if (
          expandedPath === "~" ||
          expandedPath.startsWith("~/") ||
          expandedPath.startsWith("~\\")
        ) {
          expandedPath = path.join(homedir(), expandedPath.slice(2));
        }
        expandedPath = path.resolve(expandedPath);
        if (fs.existsSync(expandedPath)) {
          return expandedPath;
        } else {
          console.warn(
            `[CLI Config] Saved vault path ${expandedPath} does not exist, falling back to default`,
          );
        }
      }
    }
  } catch (err) {
    console.error("[CLI Config] Failed to read vault config:", err);
  }

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

export const WorkDir = resolveWorkDir();

function ensureDirs() {
  const ensure = (p: string) => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  };
  ensure(WorkDir);
  ensure(path.join(WorkDir, "agents"));
  ensure(path.join(WorkDir, "config"));
}

ensureDirs();
