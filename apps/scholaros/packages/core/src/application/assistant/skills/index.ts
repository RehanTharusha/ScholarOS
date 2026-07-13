import path from "node:path";
import { fileURLToPath } from "node:url";
import builtinToolsSkill from "./builtin-tools/skill.js";
import deletionGuardrailsSkill from "./deletion-guardrails/skill.js";
import docCollabSkill from "./doc-collab/skill.js";
import mcpIntegrationSkill from "./mcp-integration/skill.js";
import organizeFilesSkill from "./organize-files/skill.js";

import appNavigationSkill from "./app-navigation/skill.js";
import browserControlSkill from "./browser-control/skill.js";

import { skill as cavemanSkill } from "./caveman/skill.js";
import { skill as revisionGuideSkill } from "./revision-guide/skill.js";
import { skill as youtubeVideoWorkflowSkill } from "./youtube-video-workflow/skill.js";
import { skill as pdfSkill } from "./pdf/skill.js";
import { reference as pdfReference } from "./pdf/reference.js";
import { skill as pptxSkill } from "./pptx/skill.js";
import { reference as pptxReference } from "./pptx/reference.js";
import { skill as docxSkill } from "./docx/skill.js";
import { skill as xlsxSkill } from "./xlsx/skill.js";
import { skill as webArtifactsBuilderSkill } from "./web-artifacts-builder/skill.js";
import { skill as ankiFlashcardsSkill } from "./anki-flashcards/skill.js";
import { skill as autoFlashcardsSkill } from "./auto-flashcards/skill.js";
import { skill as deepResearchSkill } from "./deep-research/skill.js";
import { skill as studyWorkflowSkill } from "./study-workflow/skill.js";
import { skill as writingModeSkill } from "./writing-mode/skill.js";
import { skill as citationManagementSkill } from "./citation-management/skill.js";
import { skill as courseManagementSkill } from "./course-management/skill.js";
import { skill as interactiveQuizSkill } from "./interactive-quiz/skill.js";
import { skill as mindMapSkill } from "./mind-map/skill.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PREFIX = "src/application/assistant/skills";

// console.log(tracksSkill);

type SkillDefinition = {
  id: string; // Also used as folder name
  title: string;
  summary: string;
  content: string;
};

type ResolvedSkill = {
  id: string;
  catalogPath: string;
  content: string;
};

const definitions: SkillDefinition[] = [
  {
    id: "doc-collab",
    title: "Document Collaboration",
    summary:
      "Collaborate on documents - create, edit, and refine notes and documents in the knowledge base.",
    content: docCollabSkill,
  },
  {
    id: "organize-files",
    title: "Organize Files",
    summary:
      "Find, organize, and tidy up files on the user's machine. Move files to folders, clean up Desktop/Downloads, locate specific files.",
    content: organizeFilesSkill,
  },
  {
    id: "builtin-tools",
    title: "Builtin Tools Reference",
    summary:
      "Understanding and using builtin tools (especially executeCommand for bash/shell) in agent definitions.",
    content: builtinToolsSkill,
  },
  {
    id: "mcp-integration",
    title: "MCP Integration Guidance",
    summary:
      "Discovering, executing, and integrating MCP tools. Use this to check what external capabilities are available and execute MCP tools on behalf of users.",
    content: mcpIntegrationSkill,
  },
  {
    id: "deletion-guardrails",
    title: "Deletion Guardrails",
    summary:
      "Following the confirmation process before removing workflows or agents and their dependencies.",
    content: deletionGuardrailsSkill,
  },
  {
    id: "app-navigation",
    title: "App Navigation",
    summary:
      "Navigate the app UI - open notes, switch views, filter/search the knowledge base, and manage saved views.",
    content: appNavigationSkill,
  },
  {
    id: "caveman",
    title: "Caveman Mode",
    summary:
      "Terse compressed assistant tone modes (lite/full/ultra/wenyan). Load to make assistant reply in caveman style.",
    content: cavemanSkill,
  },
  {
    id: "browser-control",
    title: "Browser Control",
    summary:
      "Control the embedded browser pane - open sites, inspect page state, and interact with indexed page elements.",
    content: browserControlSkill,
  },
  {
    id: "pdf",
    title: "PDF Processing",
    summary:
      "Process PDF files - merge, split, rotate, extract text/tables, create new PDFs, fill forms, OCR, encrypt/decrypt, add watermarks.",
    content: pdfSkill,
  },
  {
    id: "pptx",
    title: "PowerPoint Presentations",
    summary:
      "Create, read, and edit PowerPoint slide decks (.pptx) using PptxGenJS and template-based XML editing.",
    content: pptxSkill,
  },
  {
    id: "docx",
    title: "Word Documents",
    summary:
      "Create, read, and edit Word documents (.docx) with full formatting, tables, images, tracked changes, and comments.",
    content: docxSkill,
  },
  {
    id: "xlsx",
    title: "Excel Spreadsheets",
    summary:
      "Create, read, and edit Excel spreadsheets (.xlsx) with formulas, formatting, charts, and financial model standards.",
    content: xlsxSkill,
  },
  {
    id: "web-artifacts-builder",
    title: "Web Artifacts Builder",
    summary:
      "Build complex React+Tailwind+shadcn/ui HTML artifacts bundled into self-contained single HTML files.",
    content: webArtifactsBuilderSkill,
  },
  {
    id: "revision-guide",
    title: "Revision Guide",
    summary:
      "Generate comprehensive HTML revision guides for college modules with exam weight badges, diagrams, and quick-fire checklists.",
    content: revisionGuideSkill,
  },
  {
    id: "youtube-video-workflow",
    title: "YouTube Video Link Finder",
    summary:
      "Find real YouTube video links for topics using search scraping to fix broken or placeholder video IDs in supplement files.",
    content: youtubeVideoWorkflowSkill,
  },
  {
    id: "anki-flashcards",
    title: "Anki Flashcards",
    summary:
      "Create, manage, and push Anki flashcards from course materials. Generates high-quality Q&A and cloze-deletion cards and syncs them to the user's Anki desktop app via AnkiConnect.",
    content: ankiFlashcardsSkill,
  },
  {
    id: "auto-flashcards",
    title: "Auto-Flashcards",
    summary:
      "Automatically generate flashcards from course notes and store them in ScholarOS's built-in spaced repetition system. Reads markdown files, creates Q&A cards, and saves to .scholarOS/review/cards.json.",
    content: autoFlashcardsSkill,
  },
  {
    id: "deep-research",
    title: "Deep Research",
    summary:
      "Perform iterative multi-round academic research with web search, source extraction, and report synthesis. Use for literature reviews, comparisons, methodology research, fact-checking, concept exploration, and problem-solving.",
    content: deepResearchSkill,
  },
  {
    id: "study-workflow",
    title: "Study Workflow",
    summary:
      "Guide users through the built-in spaced repetition review system. Use for studying, reviewing flashcards, exam prep, checking progress, or starting review sessions.",
    content: studyWorkflowSkill,
  },
  {
    id: "writing-mode",
    title: "Academic Writing Mode",
    summary:
      "Help users write papers, essays, and assignments with the built-in Academic Writing Mode featuring outline panel, inline citations, word count targets, and export to Word/LaTeX.",
    content: writingModeSkill,
  },
  {
    id: "citation-management",
    title: "Citation Management",
    summary:
      "Manage academic citations and references - import from Zotero or BibTeX, insert citations in writing mode, and generate formatted bibliographies.",
    content: citationManagementSkill,
  },
  {
    id: "course-management",
    title: "Course Management",
    summary:
      "Organize academic content by courses, add new courses, switch between course/file views, and manage course folder structures.",
    content: courseManagementSkill,
  },
  {
    id: "interactive-quiz",
    title: "Interactive Quiz Mode",
    summary:
      "Agent-led active recall sessions — one question at a time with detailed feedback, adaptive difficulty, and end-of-session summary with weak-topic analysis.",
    content: interactiveQuizSkill,
  },
  {
    id: "mind-map",
    title: "Mind Map Generator",
    summary:
      "Create visual mind maps from course content — hierarchical diagrams for revision, big-picture understanding, and concept relationships using Mermaid mindmap syntax.",
    content: mindMapSkill,
  },
];

const skillEntries = definitions.map((definition) => ({
  ...definition,
  catalogPath: `${CATALOG_PREFIX}/${definition.id}/skill.ts`,
}));

const catalogSections = skillEntries.map((entry) =>
  [
    `## ${entry.title}`,
    `- **Skill file:** \`${entry.catalogPath}\``,
    `- **Use it for:** ${entry.summary}`,
  ].join("\n"),
);

export const skillCatalog = [
  "# ScholarOS Skill Catalog",
  "",
  "Use this catalog to see which specialized skills you can load. Each entry lists the exact skill file plus a short description of when it helps.",
  "",
  catalogSections.join("\n\n"),
].join("\n");

/**
 * Build a skill catalog string, optionally excluding specific skills by ID.
 */
export function buildSkillCatalog(options?: { excludeIds?: string[] }): string {
  const entries = options?.excludeIds
    ? skillEntries.filter((e) => !options.excludeIds!.includes(e.id))
    : skillEntries;
  const sections = entries.map((entry) =>
    [
      `## ${entry.title}`,
      `- **Skill file:** \`${entry.catalogPath}\``,
      `- **Use it for:** ${entry.summary}`,
    ].join("\n"),
  );
  return [
    "# ScholarOS Skill Catalog",
    "",
    "Use this catalog to see which specialized skills you can load. Each entry lists the exact skill file plus a short description of when it helps.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

const normalizeIdentifier = (value: string) =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");

const aliasMap = new Map<string, ResolvedSkill>();

const registerAlias = (alias: string, entry: ResolvedSkill) => {
  const normalized = normalizeIdentifier(alias);
  if (!normalized) return;
  aliasMap.set(normalized, entry);
};

const registerAliasVariants = (alias: string, entry: ResolvedSkill) => {
  const normalized = normalizeIdentifier(alias);
  if (!normalized) return;

  const variants = new Set<string>([normalized]);

  if (/\.(ts|js)$/i.test(normalized)) {
    variants.add(normalized.replace(/\.(ts|js)$/i, ""));
    variants.add(
      normalized.endsWith(".ts")
        ? normalized.replace(/\.ts$/i, ".js")
        : normalized.replace(/\.js$/i, ".ts"),
    );
  } else {
    variants.add(`${normalized}.ts`);
    variants.add(`${normalized}.js`);
  }

  for (const variant of variants) {
    registerAlias(variant, entry);
  }
};

for (const entry of skillEntries) {
  const absoluteTs = path.join(CURRENT_DIR, entry.id, "skill.ts");
  const absoluteJs = path.join(CURRENT_DIR, entry.id, "skill.js");
  const resolvedEntry: ResolvedSkill = {
    id: entry.id,
    catalogPath: entry.catalogPath,
    content: entry.content,
  };

  const baseAliases = [
    entry.id,
    `${entry.id}/skill`,
    `${entry.id}/skill.ts`,
    `${entry.id}/skill.js`,
    `skills/${entry.id}/skill.ts`,
    `skills/${entry.id}/skill.js`,
    `${CATALOG_PREFIX}/${entry.id}/skill.ts`,
    `${CATALOG_PREFIX}/${entry.id}/skill.js`,
    absoluteTs,
    absoluteJs,
  ];

  for (const alias of baseAliases) {
    registerAliasVariants(alias, resolvedEntry);
  }
}

/**
 * Build a relevance-filtered skill catalog based on session context.
 * Returns only the skills that are plausibly relevant to the current task,
 * keeping the catalog compact (~80-150 tokens instead of ~500).
 */
export function buildContextualSkillCatalog(context: {
  hasFileAttachment?: boolean;
  attachedMimeTypes?: string[];
  recentMessageKeywords?: string[];
}): string {
  const relevantIds = new Set<string>();

  // File attachment signals
  if (context.hasFileAttachment) {
    const mimeTypes = context.attachedMimeTypes ?? [];
    if (mimeTypes.some((m) => m.includes("pdf"))) relevantIds.add("pdf");
    if (mimeTypes.some((m) => m.includes("presentation") || m.includes("pptx")))
      relevantIds.add("pptx");
    if (mimeTypes.some((m) => m.includes("word") || m.includes("docx")))
      relevantIds.add("docx");
    if (mimeTypes.some((m) => m.includes("sheet") || m.includes("xlsx") || m.includes("csv")))
      relevantIds.add("xlsx");
    relevantIds.add("organize-files");
    relevantIds.add("course-management");
  }

  const keywords = context.recentMessageKeywords ?? [];

  // Study/quiz/exam signals
  const studySignals = ["study", "quiz", "review", "exam", "revise", "flashcard", "practice", "test", "memorize", "midterm", "final"];
  if (keywords.some((k) => studySignals.some((s) => k.includes(s)))) {
    relevantIds.add("study-workflow");
    relevantIds.add("auto-flashcards");
    relevantIds.add("anki-flashcards");
    relevantIds.add("revision-guide");
    relevantIds.add("interactive-quiz");
    relevantIds.add("mind-map");
    relevantIds.add("app-navigation");
  }

  // Writing signals
  const writingSignals = ["essay", "paper", "write", "assignment", "draft", "outline", "citation", "bibliography", "references"];
  if (keywords.some((k) => writingSignals.some((s) => k.includes(s)))) {
    relevantIds.add("writing-mode");
    relevantIds.add("citation-management");
  }

  // Research signals
  const researchSignals = ["research", "literature review", "compare", "synthesize", "analyze", "find papers", "source"];
  if (keywords.some((k) => researchSignals.some((s) => k.includes(s)))) {
    relevantIds.add("deep-research");
    relevantIds.add("citation-management");
  }

  // YouTube/audio signal
  if (keywords.some((k) => k.includes("youtube") || k.includes("video") || k.includes("lecture recording"))) {
    relevantIds.add("youtube-video-workflow");
  }

  // Browser signal
  if (keywords.some((k) => k.includes("browser") || k.includes("website") || k.includes("open") || k.includes("web page"))) {
    relevantIds.add("browser-control");
  }

  // PPTX/DOC creation signal
  if (keywords.some((k) => k.includes("presentation") || k.includes("slide") || k.includes("powerpoint"))) {
    relevantIds.add("pptx");
  }
  if (keywords.some((k) => k.includes("document") || k.includes("word") || k.includes("report"))) {
    relevantIds.add("docx");
  }

  // Always include essential meta-skills
  relevantIds.add("builtin-tools");
  relevantIds.add("deletion-guardrails");
  relevantIds.add("app-navigation");
  relevantIds.add("mcp-integration");

  const entries = skillEntries.filter((e) => relevantIds.has(e.id));

  // If no context signals matched (cold start), show the broader set
  if (entries.length <= 3) {
    const core = skillEntries.filter((e) =>
      ["builtin-tools", "deletion-guardrails", "app-navigation", "mcp-integration",
       "study-workflow", "auto-flashcards", "pdf", "writing-mode", "course-management"].includes(e.id)
    );
    return buildCatalogString(core);
  }

  return buildCatalogString(entries);
}

function buildCatalogString(entries: typeof skillEntries): string {
  const sections = entries.map((entry) =>
    [
      `## ${entry.title}`,
      `- **Skill file:** \`${entry.catalogPath}\``,
      `- **Use it for:** ${entry.summary}`,
    ].join("\n"),
  );
  return [
    "# ScholarOS Skill Catalog",
    "",
    "Use this catalog to see which specialized skills you can load. Each entry lists the exact skill file plus a short description of when it helps.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

export const availableSkills = skillEntries.map((entry) => entry.id);

/**
 * Expanded (full reference) content for skills that support compression (4.2).
 * Maps skill ID → full reference string. Loaded via expandSkill().
 */
const expandedSkills = new Map<string, string>([
  ["pdf", pdfReference],
  ["pptx", pptxReference],
]);

export function resolveExpandedSkill(skillId: string): string | null {
  return expandedSkills.get(skillId) ?? null;
}

export function resolveSkill(identifier: string): ResolvedSkill | null {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return null;

  return aliasMap.get(normalized) ?? null;
}
