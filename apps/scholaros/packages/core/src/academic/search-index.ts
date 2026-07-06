/**
 * Tokenized search index (5.1, 5.2).
 * Local, deterministic, zero API calls. TF-IDF scoring with title bonus.
 * Hybrid search: tokenized + vector (reuses existing hashed embeddings).
 */

import * as fs from "fs/promises";
import * as path from "path";
import { getScholarOSPath } from "../config/config.js";
import { glob } from "glob";
import { hashedEmbedding, cosineSimilarity } from "./file-classifier.js";
import { buildWikiGraph } from "../knowledge/wiki-link-graph.js";
import { buildRetrievalGraph, getRelatedNodes, type RetrievalGraph } from "../knowledge/graph-relevance.js";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "this", "that", "these", "those", "it", "its", "they", "them", "their",
  "we", "our", "you", "your", "he", "she", "him", "her", "his",
  "not", "no", "nor", "so", "if", "then", "than", "too", "very",
  "just", "about", "above", "after", "again", "all", "also", "any",
  "because", "before", "between", "both", "each", "few", "more",
  "most", "other", "some", "such", "only", "own", "same",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export type IndexEntry = {
  path: string;
  title: string;
  course: string;
  type: "concept" | "lecture" | "assignment" | "paper" | "synthesis" | "resource";
  tags: string[];
  tokens: Record<string, number>;
  preview: string;
  wordCount: number;
  embedding: number[];
};

export type SearchIndex = {
  entries: IndexEntry[];
  docCount: number;
  idf: Record<string, number>;
};

export type QueryMode = "fast" | "standard" | "deep";

export type SearchOptions = {
  course?: string;
  type?: IndexEntry["type"];
  topN?: number;
  mode?: QueryMode;
  vectorSearch?: boolean;
  graphExpand?: boolean;
};

export type SearchResult = {
  path: string;
  title: string;
  course: string;
  type: IndexEntry["type"];
  score: number;
  preview: string;
  source: "tokenized" | "vector" | "graph";
};

export type BudgetReport = {
  totalCandidates: number;
  returned: number;
  omitted: number;
  budgetTokens: number;
  usedTokens: number;
};

export type ContextAssembly = {
  topPages: SearchResult[];
  graphPages: SearchResult[];
  indexSnippet: string;
  budgetReport: BudgetReport;
};

export function classifyQuery(query: string): QueryMode {
  const lower = query.toLowerCase();

  const deepPatterns = [
    "summarize everything", "all the concepts", "study for the",
    "exam prep", "what should i study", "comprehensive",
    "everything about", "full overview",
  ];
  for (const p of deepPatterns) {
    if (lower.includes(p)) return "deep";
  }

  const standardPatterns = [
    "compare", "difference between", " vs ", "relate",
    "how does", "connection", "what's the relationship",
    "similarities", "contrast",
  ];
  for (const p of standardPatterns) {
    if (lower.includes(p)) return "standard";
  }

  return "fast";
}

export async function buildSearchIndex(): Promise<SearchIndex> {
  const coursesDir = getScholarOSPath("courses");
  const allFiles = await glob("**/*.md", { cwd: coursesDir });

  const entries: IndexEntry[] = [];

  for (const filePath of allFiles) {
    const absPath = path.join(coursesDir, filePath);
    const content = await fs.readFile(absPath, "utf8");
    const lines = content.split("\n");

    const titleLine = lines.find((l) => l.startsWith("# "));
    const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : path.basename(filePath, ".md");

    let type: IndexEntry["type"] = "concept";
    if (filePath.includes("/lectures/")) type = "lecture";
    else if (filePath.includes("/assignments/")) type = "assignment";
    else if (filePath.startsWith("papers/")) type = "paper";
    else if (filePath.startsWith("syntheses/")) type = "synthesis";
    else if (filePath.startsWith("resources/")) type = "resource";

    const tags: string[] = [];
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const tagMatch = fm.match(/tags:\s*\[([^\]]*)\]/);
      if (tagMatch) {
        tags.push(...tagMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, "")));
      }
    }

    const tokens = tokenize(content);
    const tokenCounts: Record<string, number> = {};
    for (const t of tokens) {
      tokenCounts[t] = (tokenCounts[t] || 0) + 1;
    }

    const previewLines = lines.filter(
      (l) => l.trim().length > 0 && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("```"),
    );
    const preview = previewLines[0]?.slice(0, 200).trim() || title;

    const courseMatch = filePath.match(/^([^/]+)/);
    const course = courseMatch ? courseMatch[1] : "uncategorized";

    const embedding = hashedEmbedding(preview + " " + title);

    entries.push({
      path: filePath,
      title,
      course,
      type,
      tags,
      tokens: tokenCounts,
      preview,
      wordCount: content.split(/\s+/).length,
      embedding,
    });
  }

  const docFreq: Record<string, number> = {};
  for (const entry of entries) {
    for (const term of Object.keys(entry.tokens)) {
      docFreq[term] = (docFreq[term] || 0) + 1;
    }
  }

  const idf: Record<string, number> = {};
  const totalDocs = entries.length;
  for (const [term, freq] of Object.entries(docFreq)) {
    idf[term] = Math.log((totalDocs + 1) / (freq + 1)) + 1;
  }

  return { entries, docCount: totalDocs, idf };
}

function scoreEntry(entry: IndexEntry, queryTokens: string[], idf: Record<string, number>): number {
  let score = 0;
  for (const qt of queryTokens) {
    const tf = (entry.tokens[qt] || 0) / (entry.wordCount || 1);
    const idfVal = idf[qt] || 1;
    score += tf * idfVal;

    if (entry.title.toLowerCase().includes(qt)) score += 10;
    if (entry.tags.some((t) => t.toLowerCase().includes(qt))) score += 5;
  }
  return score;
}

function computeTFIDFScore(entry: IndexEntry, queryTokens: string[], idf: Record<string, number>): number {
  return scoreEntry(entry, queryTokens, idf);
}

function computeVectorScore(entry: IndexEntry, queryEmbedding: number[]): number {
  if (!entry.embedding || entry.embedding.length === 0) return 0;
  return cosineSimilarity(queryEmbedding, entry.embedding);
}

export function tokenizedSearch(
  index: SearchIndex,
  query: string,
  options?: { course?: string; type?: IndexEntry["type"]; topN?: number },
): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  let candidates = index.entries;

  if (options?.course) {
    const courseLower = options.course.toLowerCase();
    candidates = candidates.filter((e) => e.course.toLowerCase().includes(courseLower));
  }

  if (options?.type) {
    candidates = candidates.filter((e) => e.type === options.type);
  }

  const scored = candidates
    .map((e) => ({
      path: e.path,
      title: e.title,
      course: e.course,
      type: e.type,
      score: computeTFIDFScore(e, queryTokens, index.idf),
      preview: e.preview,
      source: "tokenized" as const,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const topN = options?.topN ?? 10;
  return scored.slice(0, topN);
}

export function vectorSearch(
  index: SearchIndex,
  query: string,
  options?: { course?: string; type?: IndexEntry["type"]; topN?: number },
): SearchResult[] {
  const queryEmbedding = hashedEmbedding(query);
  if (!queryEmbedding || queryEmbedding.length === 0) return [];

  let candidates = index.entries;

  if (options?.course) {
    const courseLower = options.course.toLowerCase();
    candidates = candidates.filter((e) => e.course.toLowerCase().includes(courseLower));
  }

  if (options?.type) {
    candidates = candidates.filter((e) => e.type === options.type);
  }

  const scored = candidates
    .map((e) => ({
      path: e.path,
      title: e.title,
      course: e.course,
      type: e.type,
      score: computeVectorScore(e, queryEmbedding),
      preview: e.preview,
      source: "vector" as const,
    }))
    .filter((r) => r.score > 0.01)
    .sort((a, b) => b.score - a.score);

  const topN = options?.topN ?? 10;
  return scored.slice(0, topN);
}

export function hybridSearch(
  index: SearchIndex,
  query: string,
  options?: { course?: string; type?: IndexEntry["type"]; topN?: number; vectorWeight?: number },
): SearchResult[] {
  const queryTokens = tokenize(query);
  const queryEmbedding = hashedEmbedding(query);
  const vectorWeight = options?.vectorWeight ?? 0.3;

  if (queryTokens.length === 0 && !queryEmbedding) return [];

  let candidates = index.entries;

  if (options?.course) {
    const courseLower = options.course.toLowerCase();
    candidates = candidates.filter((e) => e.course.toLowerCase().includes(courseLower));
  }

  if (options?.type) {
    candidates = candidates.filter((e) => e.type === options.type);
  }

  const tokenizerScores = new Map<string, number>();
  const vectorScores = new Map<string, number>();
  let maxTokenized = 0;
  let maxVector = 0;

  for (const e of candidates) {
    if (queryTokens.length > 0) {
      const ts = computeTFIDFScore(e, queryTokens, index.idf);
      tokenizerScores.set(e.path, ts);
      if (ts > maxTokenized) maxTokenized = ts;
    }
    if (queryEmbedding && queryEmbedding.length > 0) {
      const vs = computeVectorScore(e, queryEmbedding);
      vectorScores.set(e.path, vs);
      if (vs > maxVector) maxVector = vs;
    }
  }

  const scored = candidates
    .map((e) => {
      const ts = (tokenizerScores.get(e.path) ?? 0) / (maxTokenized || 1);
      const vs = (vectorScores.get(e.path) ?? 0) / (maxVector || 1);
      const score = ts * (1 - vectorWeight) + vs * vectorWeight;
      const source: "tokenized" | "vector" = ts >= vs ? "tokenized" : "vector";
      return {
        path: e.path,
        title: e.title,
        course: e.course,
        type: e.type,
        score,
        preview: e.preview,
        source,
      };
    })
    .filter((r) => r.score > 0.001)
    .sort((a, b) => b.score - a.score);

  const topN = options?.topN ?? 10;
  return scored.slice(0, topN);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function extractSection(content: string, query: string): string | null {
  const lowerQuery = query.toLowerCase();
  const queryTokens = tokenize(query);

  const lines = content.split("\n");
  let inFrontmatter = false;
  let bestSection: { start: number; score: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    if (line.startsWith("## ") || line.startsWith("### ")) {
      const headerText = line.replace(/^#{2,3}\s+/, "").toLowerCase();
      let score = 0;
      for (const qt of queryTokens) {
        if (headerText.includes(qt)) score += 5;
      }
      if (lowerQuery.includes(headerText)) score += 10;

      const nextContent = lines.slice(i + 1, i + 15).join(" ");
      for (const qt of queryTokens) {
        if (nextContent.toLowerCase().includes(qt)) score += 1;
      }

      if (score > 0 && (!bestSection || score > bestSection.score)) {
        bestSection = { start: i, score };
      }
    }
  }

  if (bestSection) {
    const endIdx = Math.min(bestSection.start + 40, lines.length);
    return lines.slice(bestSection.start, endIdx).join("\n");
  }

  return null;
}

export async function expandGraph(
  seedPaths: string[],
  topN: number = 5,
): Promise<Map<string, { path: string; score: number }>> {
  try {
    const wikiGraph = await buildWikiGraph();
    if (wikiGraph.nodes.length === 0) return new Map();

    const wikiGraphNodes = wikiGraph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      path: n.path,
      linkCount: n.linkCount,
      community: n.community,
      sources: [] as string[],
    }));

    const retrievalGraph = buildRetrievalGraph(wikiGraphNodes, wikiGraph.edges);
    if (retrievalGraph.nodes.size === 0) return new Map();

    const seedIds = new Set<string>();
    for (const seedPath of seedPaths) {
      const fileName = path.basename(seedPath, ".md");
      for (const [nodeId] of retrievalGraph.nodes) {
        if (nodeId === fileName || nodeId.toLowerCase() === fileName.toLowerCase()) {
          seedIds.add(nodeId);
          break;
        }
      }
    }

    if (seedIds.size === 0) return new Map();

    const expanded = new Map<string, { path: string; score: number }>();
    const decayFactor = 0.5;

    for (const seedId of seedIds) {
      const related = getRelatedNodes(seedId, retrievalGraph, topN * 2);
      for (const rel of related) {
        const node = retrievalGraph.nodes.get(rel.nodeId);
        if (!node || seedIds.has(rel.nodeId)) continue;

        const existing = expanded.get(rel.nodeId);
        const decayedScore = rel.score * decayFactor;
        if (!existing || decayedScore > existing.score) {
          expanded.set(rel.nodeId, { path: node.path, score: decayedScore });
        }
      }
    }

    const sorted = Array.from(expanded.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topN);

    return new Map(sorted);
  } catch {
    return new Map();
  }
}

let cachedGraph: RetrievalGraph | null = null;

export async function getOrBuildGraph(): Promise<RetrievalGraph> {
  if (cachedGraph) return cachedGraph;

  try {
    const wikiGraph = await buildWikiGraph();
    if (wikiGraph.nodes.length === 0) {
      cachedGraph = buildRetrievalGraph([], []);
      return cachedGraph;
    }

    const wikiGraphNodes = wikiGraph.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      path: n.path,
      linkCount: n.linkCount,
      community: n.community,
      sources: [] as string[],
    }));

    cachedGraph = buildRetrievalGraph(wikiGraphNodes, wikiGraph.edges);
    return cachedGraph;
  } catch {
    cachedGraph = buildRetrievalGraph([], []);
    return cachedGraph;
  }
}

export function estimatePageTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

export async function assembleContext(
  index: SearchIndex,
  query: string,
  options?: SearchOptions,
): Promise<ContextAssembly> {
  const mode = options?.mode ?? classifyQuery(query);
  const budgetTokens = mode === "fast" ? 1000 : mode === "standard" ? 3000 : 5000;

  let topPages: SearchResult[];
  const graphPages: SearchResult[] = [];
  const graphExpand = options?.graphExpand ?? (mode === "standard" || mode === "deep");
  const vectorSearchEnabled = options?.vectorSearch ?? (mode !== "fast");

  if (mode === "fast") {
    topPages = tokenizedSearch(index, query, {
      course: options?.course,
      type: options?.type,
      topN: Math.min(options?.topN ?? 3, 3),
    });
  } else if (vectorSearchEnabled) {
    topPages = hybridSearch(index, query, {
      course: options?.course,
      type: options?.type,
      topN: options?.topN ?? 10,
      vectorWeight: 0.3,
    });
  } else {
    topPages = tokenizedSearch(index, query, {
      course: options?.course,
      type: options?.type,
      topN: options?.topN ?? 10,
    });
  }

  if (graphExpand && topPages.length > 0) {
    const seedPaths = topPages.slice(0, 3).map((p) => p.path);
    const graphResults = await expandGraph(seedPaths, 5);

    for (const [, result] of graphResults) {
      const entry = index.entries.find((e) => e.path === result.path);
      if (entry) {
        const alreadyInTop = topPages.some((p) => p.path === entry.path);
        if (!alreadyInTop) {
          graphPages.push({
            path: entry.path,
            title: entry.title,
            course: entry.course,
            type: entry.type,
            score: result.score,
            preview: entry.preview,
            source: "graph",
          });
        }
      }
    }

    graphPages.sort((a, b) => b.score - a.score);
  }

  let usedTokens = 0;
  const topPagesBudget = Math.floor(budgetTokens * 0.7);
  const graphBudget = Math.floor(budgetTokens * 0.2);
  const indexBudget = Math.floor(budgetTokens * 0.1);

  const filteredTopPages: SearchResult[] = [];
  for (const page of topPages) {
    const pageTokens = estimateTokens(page.preview);
    if (usedTokens + pageTokens <= topPagesBudget || filteredTopPages.length === 0) {
      filteredTopPages.push(page);
      usedTokens += pageTokens;
    } else {
      break;
    }
  }

  for (const page of graphPages) {
    const pageTokens = estimateTokens(page.preview);
    if (usedTokens + pageTokens <= topPagesBudget + graphBudget) {
      filteredTopPages.push(page);
      usedTokens += pageTokens;
    } else {
      break;
    }
  }

  let indexSnippet = "";
  if (indexBudget > 0 && options?.course) {
    const courseIndexPath = `courses/${options.course}/index.md`;
    const entry = index.entries.find((e) => e.path === courseIndexPath);
    if (entry) {
      indexSnippet = `[Index for ${options.course}]: ${entry.preview}`;
      const idxTokens = estimateTokens(indexSnippet);
      if (usedTokens + idxTokens <= budgetTokens) {
        usedTokens += idxTokens;
      } else {
        indexSnippet = "";
      }
    }
  }

  const totalCandidates = topPages.length + graphPages.length;

  return {
    topPages: filteredTopPages,
    graphPages,
    indexSnippet,
    budgetReport: {
      totalCandidates,
      returned: filteredTopPages.length,
      omitted: totalCandidates - filteredTopPages.length,
      budgetTokens,
      usedTokens,
    },
  };
}

export function searchIndex(
  index: SearchIndex,
  query: string,
  options?: SearchOptions,
): SearchResult[] {
  const mode = options?.mode ?? classifyQuery(query);
  const topN = options?.topN ?? 10;

  if (mode === "fast") {
    return tokenizedSearch(index, query, { course: options?.course, type: options?.type, topN: Math.min(topN, 3) });
  }

  const vectorEnabled = options?.vectorSearch ?? true;
  if (vectorEnabled) {
    const results = hybridSearch(index, query, {
      course: options?.course,
      type: options?.type,
      topN,
      vectorWeight: 0.3,
    });
    if (results.length > 0) return results;
  }

  return tokenizedSearch(index, query, { course: options?.course, type: options?.type, topN });
}

export async function saveSearchIndex(index: SearchIndex): Promise<void> {
  const indexPath = path.join(getScholarOSPath(""), ".scholarOS/search-index.json");
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  const serializable = {
    ...index,
    entries: index.entries.map((e) => ({
      ...e,
      embedding: Array.from(e.embedding),
    })),
  };
  await fs.writeFile(indexPath, JSON.stringify(serializable), "utf8");
}

export async function loadSearchIndex(): Promise<SearchIndex | null> {
  const indexPath = path.join(getScholarOSPath(""), ".scholarOS/search-index.json");
  try {
    const data = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(data) as SearchIndex;
    return parsed;
  } catch {
    return null;
  }
}
