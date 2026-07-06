/**
 * Capability module registry.
 * Capability modules are on-demand instruction fragments (not skills).
 * They are listed in the core prompt's capability index and loaded via loadCapability.
 * Unlike skills, capabilities don't appear in the skill catalog.
 */

import { getFileIngestCapability } from "./file-ingest.js";
import { getKbAccessCapability } from "./kb-access.js";
import { getSaveToMemoryCapability } from "./save-to-memory.js";
import { getFilePathFormattingCapability } from "./file-path-formatting.js";
import { getBuiltinToolsReferenceCapability } from "./builtin-tools-reference.js";
import { getWorthProcessingContent } from "../../../knowledge/note_creation/worth-processing.js";
import { getEntityResolutionContent } from "../../../knowledge/note_creation/entity-resolution.js";
import { getContentExtractionContent } from "../../../knowledge/note_creation/content-extraction.js";
import { getNoteWritingContent } from "../../../knowledge/note_creation/note-writing.js";

export type CapabilityDefinition = {
  id: string;
  title: string;
  summary: string;
  triggerPhrases: string[];
  getContent: () => string;
};

const definitions: CapabilityDefinition[] = [
  {
    id: "file-ingest",
    title: "File Ingest Workflow",
    summary: "Full file-ingest workflow with OCR fallback chains — load when a file is attached, or the user says ingest/parse/process/add these slides/this PDF.",
    triggerPhrases: ["ingest", "parse", "process these slides", "add these files", "upload", "extract text", "organize files", "classify"],
    getContent: getFileIngestCapability,
  },
  {
    id: "kb-access",
    title: "Knowledge Base Access Rules",
    summary: "Detailed knowledge base structure, search strategy, and when to access — load when the student mentions a concept, course, or assignment by name.",
    triggerPhrases: ["concept", "course", "assignment", "paper", "quiz me on", "look up", "search for", "what is", "knowledge base"],
    getContent: getKbAccessCapability,
  },
  {
    id: "save-to-memory",
    title: "Save-to-Memory Rules",
    summary: "Full guidance on when and how to use save-to-memory — load when memory tools are available or user shares preferences.",
    triggerPhrases: ["remember", "save that", "prefer", "never use", "always", "my preference", "save to memory"],
    getContent: getSaveToMemoryCapability,
  },
  {
    id: "file-path-formatting",
    title: "File Path Formatting Rules",
    summary: "How to use filepath blocks vs inline code for file references — load when the model writes a file path in its response.",
    triggerPhrases: [],
    getContent: getFilePathFormattingCapability,
  },
  {
    id: "builtin-tools-reference",
    title: "Builtin Tools Reference",
    summary: "Complete list of all builtin tools, shell command rules, and MCP configuration — load when the model needs to pick or describe a tool.",
    triggerPhrases: [],
    getContent: getBuiltinToolsReferenceCapability,
  },
  // Note creation sub-prompts (academic source processing)
  {
    id: "note-creation:worth-processing",
    title: "Note Creation — Worth-Processing Filter",
    summary: "Cheap filter to bail early if an academic source is too thin for a wiki update.",
    triggerPhrases: [],
    getContent: getWorthProcessingContent,
  },
  {
    id: "note-creation:entity-resolution",
    title: "Note Creation — Entity Resolution",
    summary: "Search for related concept/course/author notes, resolve canonical names, identify new entities.",
    triggerPhrases: [],
    getContent: getEntityResolutionContent,
  },
  {
    id: "note-creation:content-extraction",
    title: "Note Creation — Content Extraction",
    summary: "Extract key concepts, definitions, theorems, experiments, open questions, prerequisite links; detect supersession/corrections.",
    triggerPhrases: [],
    getContent: getContentExtractionContent,
  },
  {
    id: "note-creation:note-writing",
    title: "Note Creation — Note Writing",
    summary: "Create/update concept pages, apply corrections, maintain prerequisite and cross-reference links across the course wiki.",
    triggerPhrases: [],
    getContent: getNoteWritingContent,
  },
];

/**
 * Build the capability index string (compact, ~200 tokens).
 * This lives in the core prompt so the model knows what it can load.
 */
export function buildCapabilityIndex(): string {
  return [
    "## Capability Modules",
    "Use `loadCapability(id)` to load detailed instructions for specific workflows:",
    ...definitions.map(
      (d) =>
        `- \`loadCapability("${d.id}")\` — ${d.title}: ${d.summary}` +
        (d.triggerPhrases.length > 0
          ? ` Trigger phrases: ${d.triggerPhrases.slice(0, 4).join(", ")}${d.triggerPhrases.length > 4 ? "..." : ""}`
          : ""),
    ),
    "",
    "The core prompt above covers the common case. Load a capability module only when the task requires it.",
  ].join("\n");
}

/**
 * Resolve a capability by ID.
 */
export function resolveCapability(id: string): CapabilityDefinition | undefined {
  return definitions.find((d) => d.id === id);
}

/**
 * Register capability modules as entries in the skill system for loadCapability support.
 * Returns entries that can be added alongside skills for the loadSkill tool to find.
 */
export function getCapabilitySkillEntries(): { id: string; title: string; summary: string; content: string }[] {
  return definitions.map((d) => ({
    id: `capability:${d.id}`,
    title: d.title,
    summary: d.summary,
    content: d.getContent(),
  }));
}
