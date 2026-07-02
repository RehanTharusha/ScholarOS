import { nanoid } from "nanoid";

export interface Citation {
  id: string;
  key: string;
  type: "article" | "book" | "inproceedings" | "thesis" | "misc";
  title: string;
  authors: string[];
  year: number;
  journal?: string;
  booktitle?: string;
  publisher?: string;
  volume?: string;
  pages?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  tags?: string[];
}

export interface CitationLibrary {
  citations: Citation[];
  lastImported: string | null;
}

const LIBRARY_PATH = ".scholar/references/library.json";

function generateId(): string {
  return nanoid(12);
}

function buildKey(authors: string[], year: number, title: string): string {
  const firstAuthor = authors[0]?.split(",")[0]?.trim().toLowerCase().replace(/[^a-z]/g, "") || "unknown";
  const firstTitleWord = title
    .split(/\s+/)
    .find((w) => w.length > 3)
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "untitled";
  return `${firstAuthor}${year}${firstTitleWord}`;
}

function ensureUniqueKey(baseKey: string, existingKeys: Set<string>): string {
  let key = baseKey;
  let suffix = 2;
  while (existingKeys.has(key)) {
    key = `${baseKey}${suffix}`;
    suffix++;
  }
  return key;
}

async function ipc(): Promise<Window["ipc"]> {
  if (!window.ipc) throw new Error("IPC not available");
  return window.ipc;
}

export async function loadLibrary(): Promise<CitationLibrary> {
  try {
    const ipc_ = await ipc();
    const result = await ipc_.invoke("workspace:readFile", {
      path: LIBRARY_PATH,
      encoding: "utf8",
    });
    const parsed = JSON.parse(result.data) as CitationLibrary;
    return {
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      lastImported: parsed.lastImported ?? null,
    };
  } catch {
    return { citations: [], lastImported: null };
  }
}

export async function saveLibrary(library: CitationLibrary): Promise<void> {
  try {
    const ipc_ = await ipc();
    await ipc_.invoke("workspace:writeFile", {
      path: LIBRARY_PATH,
      data: JSON.stringify(library, null, 2),
      opts: { encoding: "utf8", mkdirp: true },
    });
  } catch {
    // Silently fail if IPC is not available
  }
}

// ---------------------------------------------------------------------------
// Zotero JSON import
// ---------------------------------------------------------------------------

interface ZoteroCreator {
  firstName?: string;
  lastName?: string;
  name?: string;
  creatorType: string;
}

interface ZoteroItem {
  key: string;
  itemType: string;
  title: string;
  creators: ZoteroCreator[];
  date?: string;
  publicationTitle?: string;
  bookTitle?: string;
  proceedingsTitle?: string;
  publisher?: string;
  volume?: string;
  pages?: string;
  DOI?: string;
  url?: string;
  abstractNote?: string;
  thesisType?: string;
  tags?: Array<{ tag: string }>;
}

function mapZoteroType(itemType: string): Citation["type"] {
  switch (itemType) {
    case "journalArticle":
      return "article";
    case "book":
      return "book";
    case "conferencePaper":
      return "inproceedings";
    case "thesis":
      return "thesis";
    default:
      return "misc";
  }
}

function parseZoteroCreators(creators: ZoteroCreator[]): string[] {
  return creators
    .filter((c) => c.creatorType === "author")
    .map((c) => {
      if (c.name) return c.name;
      const first = c.firstName || "";
      const last = c.lastName || "";
      return `${last}${first ? `, ${first}` : ""}`;
    })
    .filter(Boolean);
}

function parseZoteroYear(date: string | undefined): number {
  if (!date) return new Date().getFullYear();
  const match = date.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : new Date().getFullYear();
}

export function importFromZoteroJson(
  json: string,
  existing: Citation[],
): Citation[] {
  let items: ZoteroItem[];
  try {
    items = JSON.parse(json);
    if (!Array.isArray(items)) {
      // Might be a single item or wrapped object
      items = items?.items ?? [items];
    }
  } catch {
    return [];
  }

  const existingKeys = new Set(existing.map((c) => c.key));
  const newCitations: Citation[] = [];

  for (const item of items) {
    if (!item || !item.title) continue;
    const authors = parseZoteroCreators(item.creators || []);
    const year = parseZoteroYear(item.date);
    const key = ensureUniqueKey(buildKey(authors, year, item.title), existingKeys);
    existingKeys.add(key);

    newCitations.push({
      id: generateId(),
      key,
      type: mapZoteroType(item.itemType),
      title: item.title,
      authors,
      year,
      journal: item.publicationTitle,
      booktitle: item.proceedingsTitle || item.bookTitle,
      publisher: item.publisher,
      volume: item.volume,
      pages: item.pages,
      doi: item.DOI,
      url: item.url,
      abstract: item.abstractNote,
      tags: item.tags?.map((t) => t.tag),
    });
  }

  return newCitations;
}

// ---------------------------------------------------------------------------
// BibTeX import
// ---------------------------------------------------------------------------

interface BibTeXEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

function parseBibtexEntry(text: string): BibTeXEntry | null {
  const entryMatch = text.match(/@(\w+)\s*\{\s*([^,]+)\s*,/);
  if (!entryMatch) return null;

  const type = entryMatch[1].toLowerCase();
  const key = entryMatch[2].trim();

  const fields: Record<string, string> = {};
  const body = text.slice(entryMatch[0].length);

  // Match key = {value} or key = "value" patterns
  const fieldRegex = /(\w+)\s*=\s*[{"]([^}"]+)[}"]\s*,?/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(body)) !== null) {
    fields[match[1].toLowerCase()] = match[2];
  }

  return { type, key, fields };
}

function parseBibtexAuthors(authorField: string): string[] {
  return authorField
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const parts = a.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        return `${parts[0]}, ${parts.slice(1).join(" ")}`;
      }
      const spaceParts = a.split(/\s+/);
      if (spaceParts.length >= 2) {
        const last = spaceParts.pop()!;
        return `${last}, ${spaceParts.join(" ")}`;
      }
      return a;
    });
}

function mapBibtexType(type: string): Citation["type"] {
  switch (type) {
    case "article":
      return "article";
    case "book":
      return "book";
    case "inproceedings":
    case "conference":
      return "inproceedings";
    case "phdthesis":
    case "mastersthesis":
    case "thesis":
      return "thesis";
    default:
      return "misc";
  }
}

function parseBibtexYear(fields: Record<string, string>): number {
  const yearStr = fields.year;
  if (yearStr) {
    const match = yearStr.match(/(\d{4})/);
    if (match) return parseInt(match[1], 10);
  }
  return new Date().getFullYear();
}

export function importFromBibtex(
  bibtex: string,
  existing: Citation[],
): Citation[] {
  const entries = bibtex.split(/@(?=\w)/g).filter((e) => e.trim());
  if (entries.length === 0) return [];

  const existingKeys = new Set(existing.map((c) => c.key));
  const newCitations: Citation[] = [];

  for (const entryStr of entries) {
    const entry = parseBibtexEntry(entryStr.startsWith("@") ? entryStr : `@${entryStr}`);
    if (!entry) continue;

    const authors = parseBibtexAuthors(entry.fields.author || "");
    const year = parseBibtexYear(entry.fields);
    const key = ensureUniqueKey(buildKey(authors, year, entry.fields.title || ""), existingKeys);
    existingKeys.add(key);

    newCitations.push({
      id: generateId(),
      key,
      type: mapBibtexType(entry.type),
      title: entry.fields.title || "",
      authors,
      year,
      journal: entry.fields.journal,
      booktitle: entry.fields.booktitle,
      publisher: entry.fields.publisher,
      volume: entry.fields.volume,
      pages: entry.fields.pages,
      doi: entry.fields.doi,
      url: entry.fields.url,
      abstract: entry.fields.abstract,
    });
  }

  return newCitations;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatAuthor(authors: string[]): string {
  if (authors.length === 0) return "Unknown";
  if (authors.length === 1) {
    return authors[0].split(",")[0].trim();
  }
  if (authors.length === 2) {
    return `${authors[0].split(",")[0].trim()} & ${authors[1].split(",")[0].trim()}`;
  }
  return `${authors[0].split(",")[0].trim()} et al.`;
}

export function formatCitation(
  citation: Citation,
  style: "apa" | "mla",
): string {
  const author = formatAuthor(citation.authors);
  if (style === "mla") {
    return `(${author} ${citation.year})`;
  }
  return `(${author}, ${citation.year})`;
}

export function formatBibliography(
  citations: Citation[],
  style: "apa" | "mla",
): string {
  return citations
    .sort((a, b) => {
      const lastA = (a.authors[0] || "Unknown").toLowerCase();
      const lastB = (b.authors[0] || "Unknown").toLowerCase();
      if (lastA !== lastB) return lastA.localeCompare(lastB);
      return a.year - b.year;
    })
    .map((c) => formatBibliographyEntry(c, style))
    .join("\n\n");
}

function formatBibliographyEntry(citation: Citation, style: "apa" | "mla"): string {
  const authors = formatAuthorList(citation.authors, style);
  const year = `(${citation.year})`;
  const title = citation.title;

  switch (citation.type) {
    case "article":
      if (style === "apa") {
        let entry = `${authors} ${year}. ${title}.`;
        if (citation.journal) entry += ` *${citation.journal}*`;
        if (citation.volume) entry += `, ${citation.volume}`;
        if (citation.pages) entry += `, ${citation.pages}`;
        if (citation.doi) entry += `. https://doi.org/${citation.doi}`;
        return entry;
      }
      // MLA
      let mlaEntry = `${authors} "${title}."`;
      if (citation.journal) mlaEntry += ` *${citation.journal}*`;
      if (citation.volume) mlaEntry += `, vol. ${citation.volume}`;
      if (citation.year) mlaEntry += `, ${citation.year}`;
      if (citation.pages) mlaEntry += `, pp. ${citation.pages}`;
      return mlaEntry;

    case "book":
      if (style === "apa") {
        let entry = `${authors} ${year}. *${title}*`;
        if (citation.publisher) entry += `. ${citation.publisher}`;
        return entry;
      }
      let mlaEntry = `${authors} *${title}*`;
      if (citation.publisher) mlaEntry += `. ${citation.publisher}`;
      if (citation.year) mlaEntry += `, ${citation.year}`;
      return mlaEntry;

    case "inproceedings":
      if (style === "apa") {
        let entry = `${authors} ${year}. ${title}.`;
        if (citation.booktitle) entry += ` In *${citation.booktitle}*`;
        if (citation.pages) entry += ` (pp. ${citation.pages})`;
        if (citation.publisher) entry += `. ${citation.publisher}`;
        return entry;
      }
      let mlaEntry2 = `${authors} "${title}."`;
      if (citation.booktitle) mlaEntry2 += ` *${citation.booktitle}*`;
      if (citation.publisher) mlaEntry2 += `, ${citation.publisher}`;
      if (citation.year) mlaEntry2 += `, ${citation.year}`;
      return mlaEntry2;

    case "thesis":
      if (style === "apa") {
        return `${authors} ${year}. *${title}* [Unpublished thesis]${citation.publisher ? `. ${citation.publisher}` : ""}`;
      }
      return `${authors} *${title}*${citation.publisher ? `. ${citation.publisher}` : ""}, ${citation.year}`;

    default:
      if (style === "apa") {
        let entry = `${authors} ${year}. ${title}.`;
        if (citation.url) entry += ` Retrieved from ${citation.url}`;
        return entry;
      }
      return `${authors} ${title}. ${citation.year}.`;
  }
}

function formatAuthorList(authors: string[], style: "apa" | "mla"): string {
  if (authors.length === 0) return "Unknown";
  if (authors.length === 1) return authors[0];
  if (style === "apa") {
    if (authors.length === 2) return `${authors[0]}, & ${authors[1]}`;
    const last = authors[authors.length - 1];
    const rest = authors.slice(0, -1).join(", ");
    return `${rest}, & ${last}`;
  }
  // MLA: first author is Last, First; rest are First Last
  const formatName = (name: string, first: boolean): string => {
    const parts = name.split(",").map((p) => p.trim());
    if (first) return name;
    if (parts.length >= 2) return `${parts.slice(1).join(" ")}, ${parts[0]}`;
    return name;
  };
  if (authors.length === 2) {
    return `${formatName(authors[0], true)}, and ${authors[1]}`;
  }
  return `${formatName(authors[0], true)}, et al.`;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function fuzzyScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match
  if (lowerText === lowerQuery) return 100;
  // Starts with
  if (lowerText.startsWith(lowerQuery)) return 80;
  // Contains
  if (lowerText.includes(lowerQuery)) return 60;

  // Character-by-character fuzzy match
  let score = 0;
  let queryIdx = 0;
  for (let i = 0; i < lowerText.length && queryIdx < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIdx]) {
      score += 10;
      queryIdx++;
    }
  }

  if (queryIdx === lowerQuery.length) return score;
  return 0;
}

export function searchCitations(
  citations: Citation[],
  query: string,
): Citation[] {
  if (!query.trim()) return citations;

  const results = citations
    .map((c) => {
      const titleScore = fuzzyScore(c.title, query) * 3;
      const authorScore = Math.max(
        ...c.authors.map((a) => fuzzyScore(a, query)),
      ) * 2;
      const yearScore = fuzzyScore(String(c.year), query) * 4;
      const keyScore = fuzzyScore(c.key, query) * 5;
      const maxScore = Math.max(titleScore, authorScore, yearScore, keyScore);
      return { citation: c, score: maxScore };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.citation);

  return results;
}
