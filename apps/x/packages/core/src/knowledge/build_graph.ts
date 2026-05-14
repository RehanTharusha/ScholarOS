import fs from "fs";
import path from "path";
import { WorkDir } from "../config/config.js";
import { createRun, createMessage } from "../runs/runs.js";
import { bus } from "../runs/bus.js";
import { waitForRunCompletion } from "../agents/utils.js";
import {
  serviceLogger,
  type ServiceRunContext,
} from "../services/service_logger.js";
import {
  loadState,
  saveState,
  getFilesToProcess,
  markFileAsProcessed,
  resetState,
  type GraphState,
} from "./graph_state.js";
import {
  buildKnowledgeIndex,
  formatIndexForPrompt,
} from "./knowledge_index.js";
import { limitEventItems } from "./limit_event_items.js";
import { commitAll } from "./version_history.js";
import { getTagDefinitions } from "./tag_system.js";

/**
 * Build ScholarOS knowledge graph by running topic extraction
 * and note creation agents on raw study materials
 */

const NOTES_OUTPUT_DIR = path.join(WorkDir, "knowledge");
const NOTE_CREATION_AGENT = "note_creation";
const SUGGESTED_TOPICS_REL_PATH = "suggested-topics.md";
const SUGGESTED_TOPICS_PATH = path.join(WorkDir, "suggested-topics.md");
const LEGACY_SUGGESTED_TOPICS_REL_PATH = "config/suggested-topics.md";
const LEGACY_SUGGESTED_TOPICS_PATH = path.join(
  WorkDir,
  "config",
  "suggested-topics.md",
);

// Configuration for the graph builder service
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const SOURCE_FOLDERS = [
  "raw",
];

/**
 * Check if email frontmatter contains any noise/skip filter tags.
 * Returns true if the email should be skipped.
 */
function hasNoiseLabels(content: string): boolean {
  if (!content.startsWith("---")) return false;

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return false;

  const frontmatter = content.slice(3, endIdx);

  const noiseTags = new Set(
    getTagDefinitions()
      .filter((t) => t.type === "noise")
      .map((t) => t.tag),
  );

  // Match list items under filter: key
  const filterMatch = frontmatter.match(/filter:\s*\n((?:\s+-\s+.+\n?)*)/);
  if (filterMatch) {
    const filterLines = filterMatch[1].match(/^\s+-\s+(.+)$/gm);
    if (filterLines) {
      for (const line of filterLines) {
        const tag = line
          .replace(/^\s+-\s+/, "")
          .trim()
          .replace(/['"]/g, "");
        if (noiseTags.has(tag)) return true;
      }
    }
  }

  // Match inline array like filter: ['cold-outreach'] or filter: [cold-outreach]
  const inlineMatch = frontmatter.match(/filter:\s*\[([^\]]*)\]/);
  if (inlineMatch && inlineMatch[1].trim()) {
    const tags = inlineMatch[1]
      .split(",")
      .map((t) => t.trim().replace(/['"]/g, ""));
    for (const tag of tags) {
      if (noiseTags.has(tag)) return true;
    }
  }

  return false;
}

function extractPathFromToolInput(input: string): string | null {
  try {
    const parsed = JSON.parse(input) as { path?: string };
    return typeof parsed.path === "string" ? parsed.path : null;
  } catch {
    return null;
  }
}

function ensureSuggestedTopicsFileLocation(): string {
  if (fs.existsSync(SUGGESTED_TOPICS_PATH)) {
    return SUGGESTED_TOPICS_PATH;
  }

  const legacyCandidates: Array<{ absPath: string; relPath: string }> = [
    {
      absPath: LEGACY_SUGGESTED_TOPICS_PATH,
      relPath: LEGACY_SUGGESTED_TOPICS_REL_PATH,
    },
  ];

  for (const legacy of legacyCandidates) {
    if (!fs.existsSync(legacy.absPath)) {
      continue;
    }

    try {
      fs.renameSync(legacy.absPath, SUGGESTED_TOPICS_PATH);
      console.log(
        `[buildGraph] Moved suggested topics file from ${legacy.relPath} to ${SUGGESTED_TOPICS_REL_PATH}`,
      );
      return SUGGESTED_TOPICS_PATH;
    } catch (error) {
      console.error(
        `[buildGraph] Failed to move suggested topics file from ${legacy.relPath} to ${SUGGESTED_TOPICS_REL_PATH}:`,
        error,
      );
      return legacy.absPath;
    }
  }

  return SUGGESTED_TOPICS_PATH;
}

function readSuggestedTopicsFile(): string {
  try {
    const suggestedTopicsPath = ensureSuggestedTopicsFileLocation();
    if (!fs.existsSync(suggestedTopicsPath)) {
      return "_No existing suggested topics file._";
    }

    const content = fs.readFileSync(suggestedTopicsPath, "utf-8").trim();
    return content.length > 0
      ? content
      : "_Existing suggested topics file is empty._";
  } catch (error) {
    console.error(`[buildGraph] Error reading suggested topics file:`, error);
    return "_Failed to read existing suggested topics file._";
  }
}

/**
 * Read content for specific files
 */
async function readFileContents(
  filePaths: string[],
): Promise<{ path: string; content: string }[]> {
  const files: { path: string; content: string }[] = [];

  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      files.push({ path: filePath, content });
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
    }
  }

  return files;
}

/**
 * Run note creation agent on a batch of files to extract entities and create/update notes
 */
async function createNotesFromBatch(
  files: { path: string; content: string }[],
  batchNumber: number,
  knowledgeIndex: string,
): Promise<{
  runId: string;
  notesCreated: Set<string>;
  notesModified: Set<string>;
}> {
  // Ensure notes output directory exists
  if (!fs.existsSync(NOTES_OUTPUT_DIR)) {
    fs.mkdirSync(NOTES_OUTPUT_DIR, { recursive: true });
  }

  // Create a run for the note creation agent
  const run = await createRun({
    agentId: NOTE_CREATION_AGENT,
  });
  const suggestedTopicsContent = readSuggestedTopicsFile();

  // Build message with index and all files in the batch
  let message = `Process the following ${files.length} source files and create/update ScholarOS knowledge notes.\n\n`;
  message += `**Instructions:**\n`;
  message += `- Use the KNOWLEDGE BASE INDEX below to resolve entities - DO NOT grep/search for existing notes\n`;
  message += `- Extract academic entities (concepts, courses, authors, papers, resources) from ALL files below\n`;
  message += `- Create or update notes in "knowledge" directory using the ScholarOS vault structure:\n`;
  message += `  - Course concept pages: "knowledge/courses/<Course>/concepts/<Concept>.md"\n`;
  message += `  - Lecture notes: "knowledge/courses/<Course>/lectures/<Lecture Title>.md"\n`;
  message += `  - Assignment pages: "knowledge/courses/<Course>/assignments/<Assignment Title>.md"\n`;
  message += `  - Paper summaries: "knowledge/papers/<Paper Title>.md"\n`;
  message += `  - Cross-source syntheses: "knowledge/syntheses/<Title>.md"\n`;
  message += `  - Reference resources: "knowledge/resources/<Title>.md"\n`;
  message += `  - Author/institution entities: "knowledge/entities/<Name>.md"\n`;
  message += `- You may also create or update "${SUGGESTED_TOPICS_REL_PATH}" to maintain curated suggested-topic cards\n`;
  message += `- If the same entity appears in multiple files, merge the information into a single note\n`;
  message += `- Use workspace tools to read existing notes or "${SUGGESTED_TOPICS_REL_PATH}" (when you need full content) and write updates\n`;
  message += `- Follow the note templates and guidelines in your instructions\n\n`;

  // Add the knowledge base index
  message += `---\n\n`;
  message += knowledgeIndex;
  message += `\n---\n\n`;

  message += `# Current Suggested Topics File\n\n`;
  message += `Path: ${SUGGESTED_TOPICS_REL_PATH}\n\n`;
  message += suggestedTopicsContent;
  message += `\n\n---\n\n`;

  // Add each file's content
  message += `# Source Files to Process\n\n`;
  files.forEach((file, idx) => {
    // Pass workspace-relative path so the agent can link back to meeting notes
    const relativePath = path.relative(WorkDir, file.path);
    message += `## Source File ${idx + 1}: ${relativePath}\n\n`;
    message += file.content;
    message += `\n\n---\n\n`;
  });

  const notesCreated = new Set<string>();
  const notesModified = new Set<string>();

  const unsubscribe = await bus.subscribe(run.id, async (event) => {
    if (event.type !== "tool-invocation") {
      return;
    }
    if (
      event.toolName !== "workspace-writeFile" &&
      event.toolName !== "workspace-edit"
    ) {
      return;
    }
    const toolPath = extractPathFromToolInput(event.input);
    if (!toolPath) {
      return;
    }
    if (event.toolName === "workspace-writeFile") {
      notesCreated.add(toolPath);
    } else if (event.toolName === "workspace-edit") {
      notesModified.add(toolPath);
    }
  });

  await createMessage(run.id, message);

  // Wait for the run to complete
  await waitForRunCompletion(run.id);
  unsubscribe();

  return { runId: run.id, notesCreated, notesModified };
}

/**
 * Build the knowledge graph from all content files in the specified source directory
 * Only processes new or changed files based on state tracking
 */
type BatchResult = {
  processedFiles: string[];
  notesCreated: Set<string>;
  notesModified: Set<string>;
  hadError: boolean;
};

async function buildGraphWithFiles(
  sourceDir: string,
  filesToProcess: string[],
  state: GraphState,
  run?: ServiceRunContext,
): Promise<BatchResult> {
  console.log(`[buildGraph] Starting build for directory: ${sourceDir}`);

  if (filesToProcess.length === 0) {
    console.log(
      `[buildGraph] No new or changed files to process in ${path.basename(sourceDir)}`,
    );
    return {
      processedFiles: [],
      notesCreated: new Set(),
      notesModified: new Set(),
      hadError: false,
    };
  }

  console.log(
    `[buildGraph] Found ${filesToProcess.length} new/changed files to process in ${path.basename(sourceDir)}`,
  );

  // Read file contents
  const contentFiles = await readFileContents(filesToProcess);

  if (contentFiles.length === 0) {
    console.log(`No files could be read from ${sourceDir}`);
    return {
      processedFiles: [],
      notesCreated: new Set(),
      notesModified: new Set(),
      hadError: false,
    };
  }

  const BATCH_SIZE = 10; // Reduced from 25 to 10 files per agent run for faster processing
  const totalBatches = Math.ceil(contentFiles.length / BATCH_SIZE);

  console.log(
    `Processing ${contentFiles.length} files in ${totalBatches} batches (${BATCH_SIZE} files per batch)...`,
  );

  const processedFiles: string[] = [];
  const notesCreated = new Set<string>();
  const notesModified = new Set<string>();
  let hadError = false;

  // Process files in batches
  for (let i = 0; i < contentFiles.length; i += BATCH_SIZE) {
    const batch = contentFiles.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    try {
      // Build fresh index before each batch to include notes from previous batches
      console.log(`Building knowledge index for batch ${batchNumber}...`);
      const indexStartTime = Date.now();
      const index = buildKnowledgeIndex();
      const indexForPrompt = formatIndexForPrompt(index);
      const indexDuration = ((Date.now() - indexStartTime) / 1000).toFixed(2);
      console.log(
        `Index built in ${indexDuration}s: ${index.courses.length} courses, ${index.concepts.length} concepts, ${index.lectures.length} lectures, ${index.assignments.length} assignments, ${index.papers.length} papers, ${index.other.length} other`,
      );

      console.log(
        `Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)...`,
      );
      if (run) {
        await serviceLogger.log({
          type: "progress",
          service: run.service,
          runId: run.runId,
          level: "info",
          message: `Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)`,
          step: "batch",
          current: batchNumber,
          total: totalBatches,
          details: { filesInBatch: batch.length },
        });
      }
      const agentStartTime = Date.now();
      const batchResult = await createNotesFromBatch(
        batch,
        batchNumber,
        indexForPrompt,
      );
      const agentDuration = ((Date.now() - agentStartTime) / 1000).toFixed(2);
      console.log(
        `Batch ${batchNumber}/${totalBatches} complete in ${agentDuration}s`,
      );

      for (const note of batchResult.notesCreated) {
        notesCreated.add(note);
      }
      for (const note of batchResult.notesModified) {
        notesModified.add(note);
      }

      // Mark files in this batch as processed
      for (const file of batch) {
        markFileAsProcessed(file.path, state);
        processedFiles.push(file.path);
      }

      // Save state after each successful batch
      // This ensures partial progress is saved even if later batches fail
      saveState(state);

      // Commit knowledge changes to version history
      try {
        await commitAll("Knowledge update", "ScholarOS");
      } catch (err) {
        console.error(`[GraphBuilder] Failed to commit version history:`, err);
      }
    } catch (error) {
      hadError = true;
      console.error(`Error processing batch ${batchNumber}:`, error);
      if (run) {
        await serviceLogger.log({
          type: "error",
          service: run.service,
          runId: run.runId,
          level: "error",
          message: `Error processing batch ${batchNumber}`,
          error: error instanceof Error ? error.message : String(error),
          context: { batchNumber },
        });
      }
      // Continue with next batch (without saving state for failed batch)
    }
  }

  // Update state with last build time and save
  state.lastBuildTime = new Date().toISOString();
  saveState(state);

  console.log(
    `Knowledge graph build complete. Processed ${processedFiles.length} files.`,
  );
  return { processedFiles, notesCreated, notesModified, hadError };
}

export async function buildGraph(sourceDir: string): Promise<void> {
  console.log(`[buildGraph] Starting build for directory: ${sourceDir}`);

  // Load current state
  const state = loadState();
  const previouslyProcessedCount = Object.keys(state.processedFiles).length;
  console.log(
    `[buildGraph] State loaded. Previously processed: ${previouslyProcessedCount} files`,
  );

  // Get files that need processing (new or changed)
  let filesToProcess = getFilesToProcess(sourceDir, state);

  // For gmail_sync, only process emails that have been labeled AND don't have noise filter tags
  if (sourceDir.endsWith("gmail_sync")) {
    filesToProcess = filesToProcess.filter((filePath) => {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        if (!content.startsWith("---")) return false;
        if (hasNoiseLabels(content)) {
          console.log(
            `[buildGraph] Skipping noise email: ${path.basename(filePath)}`,
          );
          markFileAsProcessed(filePath, state);
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });
    saveState(state);
  }

  if (filesToProcess.length === 0) {
    console.log(
      `[buildGraph] No new or changed files to process in ${path.basename(sourceDir)}`,
    );
    return;
  }

  await buildGraphWithFiles(sourceDir, filesToProcess, state);
}

/**
 * Process all configured source directories
 */
export async function processAllSources(): Promise<void> {
  console.log("[GraphBuilder] Checking for new content in all sources...");

  let anyFilesProcessed = false;
  const state = loadState();
  const folderChanges: {
    folder: string;
    sourceDir: string;
    files: string[];
  }[] = [];
  const countsByFolder: Record<string, number> = {};
  const allFiles: string[] = [];

  for (const folder of SOURCE_FOLDERS) {
    const sourceDir = path.join(WorkDir, folder);

    // Skip if folder doesn't exist
    if (!fs.existsSync(sourceDir)) {
      // Don't log this every time - it's noisy
      continue;
    }

    try {
      let filesToProcess = getFilesToProcess(sourceDir, state);

      // For gmail_sync, only process emails that have been labeled AND don't have noise filter tags
      if (folder === "gmail_sync") {
        filesToProcess = filesToProcess.filter((filePath) => {
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            if (!content.startsWith("---")) return false;
            if (hasNoiseLabels(content)) {
              console.log(
                `[GraphBuilder] Skipping noise email: ${path.basename(filePath)}`,
              );
              markFileAsProcessed(filePath, state);
              return false;
            }
            return true;
          } catch {
            return false;
          }
        });
        saveState(state);
      }

      if (filesToProcess.length > 0) {
        console.log(
          `[GraphBuilder] Found ${filesToProcess.length} new/changed files in ${folder}`,
        );
        folderChanges.push({ folder, sourceDir, files: filesToProcess });
        countsByFolder[folder] = filesToProcess.length;
        allFiles.push(...filesToProcess);
      }
    } catch (error) {
      console.error(`[GraphBuilder] Error processing ${folder}:`, error);
      // Continue with other folders even if one fails
    }
  }

  if (allFiles.length > 0) {
    const run = await serviceLogger.startRun({
      service: "graph",
      message: "Syncing knowledge graph",
      trigger: "timer",
      config: { sources: SOURCE_FOLDERS },
    });

    const relativeFiles = allFiles.map((filePath) =>
      path.relative(WorkDir, filePath),
    );
    const limitedFiles = limitEventItems(relativeFiles);
    const foldersList = Object.keys(countsByFolder).join(", ");
    const folderMessage = foldersList ? ` across ${foldersList}` : "";

    await serviceLogger.log({
      type: "changes_identified",
      service: run.service,
      runId: run.runId,
      level: "info",
      message: `Found ${allFiles.length} changed file${allFiles.length === 1 ? "" : "s"}${folderMessage}`,
      counts: countsByFolder,
      items: limitedFiles,
      truncated: relativeFiles.length > limitedFiles.length,
    });

    const notesCreated = new Set<string>();
    const notesModified = new Set<string>();
    const processedFiles: string[] = [];
    let hadError = false;

    for (const entry of folderChanges) {
      const result = await buildGraphWithFiles(
        entry.sourceDir,
        entry.files,
        state,
        run,
      );
      result.processedFiles.forEach((file) => processedFiles.push(file));
      result.notesCreated.forEach((note) => notesCreated.add(note));
      result.notesModified.forEach((note) => notesModified.add(note));
      if (result.hadError) {
        hadError = true;
      }
    }

    await serviceLogger.log({
      type: "run_complete",
      service: run.service,
      runId: run.runId,
      level: hadError ? "error" : "info",
      message: `Graph sync complete: ${processedFiles.length} files, ${notesCreated.size} created, ${notesModified.size} updated`,
      durationMs: Date.now() - run.startedAt,
      outcome: hadError ? "error" : "ok",
      summary: {
        processedFiles: processedFiles.length,
        notesCreated: notesCreated.size,
        notesModified: notesModified.size,
      },
    });

    anyFilesProcessed = true;
  }

  if (!anyFilesProcessed) {
    console.log("[GraphBuilder] No new content to process");
  } else {
    console.log("[GraphBuilder] Completed processing all sources");
  }
}

/**
 * Main entry point - runs as independent service monitoring all source folders
 */
export async function init() {
  console.log("[GraphBuilder] Starting ScholarOS Knowledge Graph Builder...");
  console.log(
    `[GraphBuilder] Monitoring folder: ${SOURCE_FOLDERS.join(", ")}`,
  );
  console.log(
    `[GraphBuilder] Will check for new content every ${SYNC_INTERVAL_MS / 1000 / 60} minutes`,
  );

  // Initial run
  await processAllSources();

  // Set up periodic processing
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, SYNC_INTERVAL_MS));

    try {
      await processAllSources();
    } catch (error) {
      console.error("[GraphBuilder] Error in main loop:", error);
    }
  }
}

/**
 * Reset the knowledge graph state - forces reprocessing of all files on next run
 * Useful for debugging or when you want to rebuild everything from scratch
 */
export function resetGraphState(): void {
  console.log("Resetting knowledge graph state...");
  resetState();
  console.log(
    "State reset complete. All files will be reprocessed on next build.",
  );
}
