const HIDDEN_SIDEBAR_ROOT_FOLDERS = new Set([
  "agents",
  "bases",
  "config",
  "events",
  "logs",
  "runs",
  "sites",
]);

const HIDDEN_SIDEBAR_ROOT_FILES = new Set([
  "app.js",
  "claude.md",
  "college-index.md",
  "index.html",
  "index.md",
  "log.md",
  "mcp.json",
  "models.json",
  "note_creation.json",
  "note-making-guide.md",
  "oauth.json",
  "security.json",
  "styles.css",
]);

export const isHiddenSidebarRootEntry = (entry: {
  path: string;
  kind: "file" | "dir";
}) => {
  const rootName = entry.path.split("/")[0]?.toLowerCase() ?? "";
  if (HIDDEN_SIDEBAR_ROOT_FOLDERS.has(rootName)) return true;
  if (entry.kind === "file" && !entry.path.includes("/")) {
    return HIDDEN_SIDEBAR_ROOT_FILES.has(rootName);
  }
  return false;
};
