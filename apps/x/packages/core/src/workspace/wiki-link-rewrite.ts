import fs from 'node:fs/promises';
import path from 'node:path';

const WIKI_LINK_REGEX = /\[\[([^[\]]+)\]\]/g;
const MARKDOWN_EXTENSION = '.md';
const NON_KNOWLEDGE_DIRS = ['raw/', 'meta/', 'assets/'];
const LEGACY_KNOWLEDGE_PREFIX = 'knowledge/';

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/');
}

function isKnowledgeRelPath(relPath: string): boolean {
  const normalized = normalizeRelPath(relPath).replace(/^\/+/, '');
  const lower = normalized.toLowerCase();
  for (const dir of NON_KNOWLEDGE_DIRS) {
    if (lower.startsWith(dir)) return false;
  }
  return true;
}

function stripLegacyKnowledgePrefix(relPath: string): string {
  const lower = relPath.toLowerCase();
  return lower.startsWith(LEGACY_KNOWLEDGE_PREFIX)
    ? relPath.slice(LEGACY_KNOWLEDGE_PREFIX.length)
    : relPath;
}

function isKnowledgeMarkdownPath(relPath: string): boolean {
  return isKnowledgeRelPath(relPath) && relPath.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}

function stripMarkdownExtension(wikiPath: string): string {
  return wikiPath.toLowerCase().endsWith(MARKDOWN_EXTENSION)
    ? wikiPath.slice(0, -MARKDOWN_EXTENSION.length)
    : wikiPath;
}

function toWikiPathCompareKey(wikiPath: string): string {
  return stripMarkdownExtension(wikiPath).toLowerCase();
}

function rewriteWikiLinksInMarkdown(
  markdown: string,
  fromWikiPath: string,
  toWikiPath: string,
  opts?: { allowBareSelfNameMatch?: boolean }
): string {
  const fromCompareKey = toWikiPathCompareKey(fromWikiPath);
  const fromBaseName = stripMarkdownExtension(fromWikiPath).split('/').pop()?.toLowerCase() ?? null;
  const toWikiPathWithoutExtension = stripMarkdownExtension(toWikiPath);
  const toBaseName = toWikiPathWithoutExtension.split('/').pop() ?? toWikiPathWithoutExtension;

  return markdown.replace(WIKI_LINK_REGEX, (fullMatch, innerRaw: string) => {
    const pipeIndex = innerRaw.indexOf('|');
    const pathAndAnchor = pipeIndex >= 0 ? innerRaw.slice(0, pipeIndex) : innerRaw;
    const aliasSuffix = pipeIndex >= 0 ? innerRaw.slice(pipeIndex) : '';

    const hashIndex = pathAndAnchor.indexOf('#');
    const pathPart = hashIndex >= 0 ? pathAndAnchor.slice(0, hashIndex) : pathAndAnchor;
    const anchorSuffix = hashIndex >= 0 ? pathAndAnchor.slice(hashIndex) : '';

    const leadingWhitespace = pathPart.match(/^\s*/)?.[0] ?? '';
    const trailingWhitespace = pathPart.match(/\s*$/)?.[0] ?? '';
    const rawPath = pathPart.trim();
    if (!rawPath) return fullMatch;

      const normalizedPath = rawPath.trim().replace(/^\/+/, '').replace(/^\.\//, '');
      const pathWithoutPrefix = stripLegacyKnowledgePrefix(normalizedPath);
      if (!pathWithoutPrefix) return fullMatch;

    const matchesFullPath = toWikiPathCompareKey(pathWithoutPrefix) === fromCompareKey;
    const isBareTarget = !pathWithoutPrefix.includes('/');
    const targetBaseName = stripMarkdownExtension(pathWithoutPrefix).toLowerCase();
    const matchesBareSelfName = Boolean(
      opts?.allowBareSelfNameMatch
      && fromBaseName
      && isBareTarget
      && targetBaseName === fromBaseName
    );
    if (!matchesFullPath && !matchesBareSelfName) {
      return fullMatch;
    }

    const preserveMarkdownExtension = rawPath.toLowerCase().endsWith(MARKDOWN_EXTENSION);
    const finalPath = matchesBareSelfName
      ? (preserveMarkdownExtension ? `${toBaseName}.md` : toBaseName)
      : (preserveMarkdownExtension ? toWikiPath : toWikiPathWithoutExtension);

    return `[[${leadingWhitespace}${finalPath}${trailingWhitespace}${anchorSuffix}${aliasSuffix}]]`;
  });
}

async function collectKnowledgeMarkdownFiles(workspaceRoot: string): Promise<string[]> {
  const markdownFiles: string[] = [];
  const pendingDirectories: string[] = [workspaceRoot];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    if (!currentDirectory) continue;

    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        const relativeDir = normalizeRelPath(path.relative(workspaceRoot, absolutePath));
        if (!isKnowledgeRelPath(relativeDir + '/')) continue;
        pendingDirectories.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) continue;

      const relativePath = normalizeRelPath(path.relative(workspaceRoot, absolutePath));
      markdownFiles.push(relativePath);
    }
  }

  return markdownFiles;
}

export async function rewriteWikiLinksForRenamedKnowledgeFile(
  workspaceRoot: string,
  fromRelPath: string,
  toRelPath: string
): Promise<number> {
  const normalizedFrom = normalizeRelPath(fromRelPath);
  const normalizedTo = normalizeRelPath(toRelPath);

  if (!isKnowledgeMarkdownPath(normalizedFrom) || !isKnowledgeMarkdownPath(normalizedTo)) {
    return 0;
  }

  const fromWikiPath = normalizedFrom;
  const toWikiPath = normalizedTo;
  if (toWikiPathCompareKey(fromWikiPath) === toWikiPathCompareKey(toWikiPath)) return 0;

  const markdownFiles = await collectKnowledgeMarkdownFiles(workspaceRoot);
  let rewrittenFiles = 0;

  const normalizedToLower = normalizedTo.toLowerCase();
  for (const relativePath of markdownFiles) {
    const absolutePath = path.join(workspaceRoot, ...relativePath.split('/'));
    try {
      const markdown = await fs.readFile(absolutePath, 'utf8');
      if (!markdown.includes('[[')) continue;

      const isRenamedFile = normalizeRelPath(relativePath).toLowerCase() === normalizedToLower;
      const rewritten = rewriteWikiLinksInMarkdown(markdown, fromWikiPath, toWikiPath, {
        allowBareSelfNameMatch: isRenamedFile,
      });
      if (rewritten === markdown) continue;

      await fs.writeFile(absolutePath, rewritten, 'utf8');
      rewrittenFiles += 1;
    } catch (error) {
      console.error('Failed to rewrite wiki links in file:', relativePath, error);
    }
  }

  return rewrittenFiles;
}
