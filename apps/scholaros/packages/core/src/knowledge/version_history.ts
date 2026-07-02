import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import { WorkDir, getScholarOSPath } from "../config/config.js";

const KNOWLEDGE_DIR = WorkDir;
const GIT_DIR = getScholarOSPath(".knowledge-history");
const NON_KNOWLEDGE_DIRS = ["raw/", "meta/", "assets/"];

function isKnowledgeRelPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/").toLowerCase();
  for (const dir of NON_KNOWLEDGE_DIRS) {
    if (normalized.startsWith(dir)) return false;
  }
  return true;
}

function isKnowledgeMarkdownFile(filepath: string): boolean {
  return filepath.endsWith(".md") && isKnowledgeRelPath(filepath);
}

// Simple promise-based mutex to serialize commits
let commitLock: Promise<void> = Promise.resolve();

// Commit listeners for notifying other layers (e.g. renderer refresh)
type CommitListener = () => void;
const commitListeners: CommitListener[] = [];

export function onCommit(listener: CommitListener): () => void {
  commitListeners.push(listener);
  return () => {
    const idx = commitListeners.indexOf(listener);
    if (idx >= 0) commitListeners.splice(idx, 1);
  };
}

/**
 * Migrate the old git repo from WorkDir/knowledge/.git to WorkDir/.scholarOS/.knowledge-history
 * if it exists and the new location doesn't.
 */
function migrateOldGitRepo(): void {
  const oldGitDir = path.join(WorkDir, "knowledge", ".git");
  if (fs.existsSync(oldGitDir) && !fs.existsSync(GIT_DIR)) {
    fs.mkdirSync(path.dirname(GIT_DIR), { recursive: true });
    fs.renameSync(oldGitDir, GIT_DIR);
  }
}

/**
 * Initialize a git repo for knowledge version history if one doesn't exist.
 * Uses a separate gitdir to avoid conflicts with the project's own .git.
 */
export async function initRepo(): Promise<void> {
  migrateOldGitRepo();

  if (fs.existsSync(GIT_DIR)) {
    return;
  }

  fs.mkdirSync(path.dirname(GIT_DIR), { recursive: true });
  await git.init({ fs, dir: KNOWLEDGE_DIR, gitdir: GIT_DIR });

  // Stage all existing .md knowledge files
  const files = getAllKnowledgeMdFiles(KNOWLEDGE_DIR, "");
  for (const file of files) {
    await git.add({ fs, dir: KNOWLEDGE_DIR, gitdir: GIT_DIR, filepath: file });
  }

  if (files.length > 0) {
    await git.commit({
      fs,
      dir: KNOWLEDGE_DIR,
      gitdir: GIT_DIR,
      message: "Initial snapshot",
      author: { name: "ScholarOS", email: "local" },
    });
  }
}

/**
 * Recursively find all knowledge .md files, skipping non-knowledge dirs.
 */
function getAllKnowledgeMdFiles(baseDir: string, relDir: string): string[] {
  const results: string[] = [];
  const absDir = relDir ? path.join(baseDir, relDir) : baseDir;
  let entries: string[];
  try {
    entries = fs.readdirSync(absDir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === ".git" || entry.startsWith(".")) continue;
    const fullPath = path.join(absDir, entry);
    const relPath = relDir ? `${relDir}/${entry}` : entry;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!isKnowledgeRelPath(relPath + "/")) continue;
      results.push(...getAllKnowledgeMdFiles(baseDir, relPath));
    } else if (isKnowledgeMarkdownFile(relPath)) {
      results.push(relPath);
    }
  }
  return results;
}

/**
 * Stage all changes to knowledge .md files and commit. No-op if nothing changed.
 * Serialized via a promise lock to prevent concurrent git index corruption.
 */
export async function commitAll(
  message: string,
  authorName: string,
): Promise<void> {
  const prev = commitLock;
  let resolve: () => void;
  commitLock = new Promise((r) => {
    resolve = r;
  });

  await prev;
  try {
    await commitAllInner(message, authorName);
  } finally {
    resolve!();
  }
}

async function commitAllInner(
  message: string,
  authorName: string,
): Promise<void> {
  const matrix = await git.statusMatrix({
    fs,
    dir: KNOWLEDGE_DIR,
    gitdir: GIT_DIR,
  });

  let hasChanges = false;
  for (const [filepath, head, workdir, stage] of matrix) {
    // Skip non-knowledge files
    if (!isKnowledgeMarkdownFile(filepath)) continue;

    if (head === 1 && workdir === 1 && stage === 1) continue;

    hasChanges = true;

    if (workdir === 0) {
      await git.remove({ fs, dir: KNOWLEDGE_DIR, gitdir: GIT_DIR, filepath });
    } else {
      await git.add({ fs, dir: KNOWLEDGE_DIR, gitdir: GIT_DIR, filepath });
    }
  }

  if (!hasChanges) return;

  await git.commit({
    fs,
    dir: KNOWLEDGE_DIR,
    gitdir: GIT_DIR,
    message,
    author: { name: authorName, email: "local" },
  });

  for (const listener of commitListeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export interface CommitInfo {
  oid: string;
  message: string;
  timestamp: number;
  author: string;
}

const MAX_FILE_HISTORY = 50;

/**
 * Get commit history for a specific file.
 * Returns commits where the file content changed, most recent first.
 * Capped at MAX_FILE_HISTORY entries.
 */
export async function getFileHistory(
  knowledgeRelPath: string,
): Promise<CommitInfo[]> {
  const filepath = knowledgeRelPath.replace(/\\/g, "/");

  let commits: Awaited<ReturnType<typeof git.log>>;
  try {
    commits = await git.log({ fs, dir: KNOWLEDGE_DIR, gitdir: GIT_DIR });
  } catch {
    return [];
  }

  if (commits.length === 0) return [];

  const result: CommitInfo[] = [];

  for (let i = 0; i < commits.length; i++) {
    if (result.length >= MAX_FILE_HISTORY) break;

    const commit = commits[i]!;
    const parentCommit = commits[i + 1];

    const currentOid = await getBlobOidAtCommit(commit.oid, filepath);
    const parentOid = parentCommit
      ? await getBlobOidAtCommit(parentCommit.oid, filepath)
      : null;

    if (currentOid !== parentOid) {
      result.push({
        oid: commit.oid,
        message: commit.commit.message.trim(),
        timestamp: commit.commit.author.timestamp,
        author: commit.commit.author.name,
      });
    }
  }

  return result;
}

async function getBlobOidAtCommit(
  commitOid: string,
  filepath: string,
): Promise<string | null> {
  try {
    const result = await git.readBlob({
      fs,
      dir: KNOWLEDGE_DIR,
      gitdir: GIT_DIR,
      oid: commitOid,
      filepath,
    });
    return result.oid;
  } catch {
    return null;
  }
}

/**
 * Read file content at a specific commit.
 */
export async function getFileAtCommit(
  knowledgeRelPath: string,
  oid: string,
): Promise<string> {
  const filepath = knowledgeRelPath.replace(/\\/g, "/");
  const result = await git.readBlob({
    fs,
    dir: KNOWLEDGE_DIR,
    gitdir: GIT_DIR,
    oid,
    filepath,
  });
  return Buffer.from(result.blob).toString("utf-8");
}

/**
 * Restore a file to its content at a given commit, then commit the restoration.
 */
export async function restoreFile(
  knowledgeRelPath: string,
  oid: string,
): Promise<void> {
  const content = await getFileAtCommit(knowledgeRelPath, oid);
  const absPath = path.join(KNOWLEDGE_DIR, knowledgeRelPath);

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(absPath, content, "utf-8");

  const filename = path.basename(knowledgeRelPath);
  await commitAll(`Restored ${filename}`, "You");
}
