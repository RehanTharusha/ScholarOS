import { Message } from "@scholaros/shared/dist/message.js";
import { z } from "zod";

const SKILL_COMPACTED_MARKER = "[Skill '";

/**
 * Compact old `loadSkill` tool results in the message history.
 *
 * When a `loadSkill` tool is called, its full skill text (~1K-9K tokens) is
 * returned as a tool result and stays in the conversation history forever.
 * This function replaces all but the most recent `loadSkill` result with a
 * one-line reminder, so the model can still re-load the skill if needed but
 * doesn't pay the token cost every turn.
 *
 * Mutates the messages array in place. Idempotent — already-compacted results
 * are not re-processed.
 */
export function compactSkillResults(messages: z.infer<typeof Message>[]): void {
  // First pass: collect all loadSkill tool-calls in order
  const toolCallIds: string[] = [];
  const skillNamesByCallId = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool-call" && part.toolName === "loadSkill") {
          toolCallIds.push(part.toolCallId);
          const skillName =
            typeof part.arguments === "object" && part.arguments !== null
              ? String(
                  (part.arguments as Record<string, unknown>).skillName ?? "",
                )
              : "";
          skillNamesByCallId.set(part.toolCallId, skillName);
        }
      }
    }
  }

  // No compaction needed for 0 or 1 loadSkill calls
  if (toolCallIds.length <= 1) return;

  // Keep the most recent loadSkill result verbatim
  const keepCallId = toolCallIds[toolCallIds.length - 1];

  // Build set of older call IDs to compact
  const compactCallIds = new Set<string>();
  for (let i = 0; i < toolCallIds.length - 1; i++) {
    compactCallIds.add(toolCallIds[i]);
  }

  // Second pass: compact older loadSkill tool results
  for (const msg of messages) {
    if (
      msg.role !== "tool" ||
      msg.toolName !== "loadSkill" ||
      msg.toolCallId === keepCallId
    ) {
      continue;
    }

    if (!compactCallIds.has(msg.toolCallId)) continue;

    // Idempotent — skip if already compacted
    if (msg.content.includes(SKILL_COMPACTED_MARKER)) continue;

    const skillName =
      skillNamesByCallId.get(msg.toolCallId) ?? msg.toolCallId;

    const reminder = `[Skill '${skillName}' was loaded and used earlier in this conversation. Re-invoke loadSkill('${skillName}') if you need its detailed instructions again.]`;

    // Try to preserve the JSON structure (just replace the content field)
    try {
      const parsed = JSON.parse(msg.content);
      if (typeof parsed === "object" && parsed !== null) {
        parsed.content = reminder;
        msg.content = JSON.stringify(parsed);
        continue;
      }
    } catch {
      // Not valid JSON — replace wholesale
    }

    msg.content = reminder;
  }
}

const MIN_TURNS_BEFORE_SUMMARY = 12;
const MIN_TURNS_BEFORE_SUMMARY_TIGHT = 8;
const KEEP_VERBATIM_TURNS = 8;

/**
 * Extract salient keywords from a message for summary construction.
 */
function extractKeywords(content: string | Array<{ type: string; text?: string }>): string[] {
  const words = new Set<string>();
  const text = typeof content === "string" ? content : "";
  const topicSignals = [
    "quiz", "exam", "study", "review", "flashcard", "revision",
    "biology", "chemistry", "physics", "math", "history",
    "lecture", "note", "concept", "summary", "explain",
    "compare", "difference", "define", "what is", "how does",
    "merge", "split", "create", "edit", "read", "extract",
    "pdf", "pptx", "docx", "slide", "presentation", "document",
  ];
  const lower = text.toLowerCase();
  for (const signal of topicSignals) {
    if (lower.includes(signal)) {
      words.add(signal);
    }
  }
  return Array.from(words).slice(0, 8);
}

/**
 * Build a heuristic summary of old conversation turns without an LLM call.
 * Extracts key topics, tool usage patterns, and question types from the messages.
 */
function buildHeuristicSummary(
  messages: z.infer<typeof Message>[],
  endIndex: number,
): string {
  const topics = new Set<string>();
  const toolsUsed = new Set<string>();
  const questionTypes = new Set<string>();
  const decisions = new Set<string>();

  for (let i = 0; i < endIndex; i++) {
    const msg = messages[i];

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool-call") {
          toolsUsed.add(part.toolName);
        }
      }
    }

    if (msg.role === "user") {
      const text = typeof msg.content === "string" ? msg.content : "";
      const lower = text.toLowerCase();
      for (const kw of extractKeywords(msg.content)) {
        topics.add(kw);
      }
      if (lower.includes("?")) {
        if (lower.includes("what") || lower.includes("how")) {
          questionTypes.add("concept questions");
        } else if (lower.includes("compare") || lower.includes("difference")) {
          questionTypes.add("comparison questions");
        } else if (lower.includes("quiz") || lower.includes("test")) {
          questionTypes.add("quiz/test requests");
        } else {
          questionTypes.add("questions");
        }
      }
    }

    if (msg.role === "assistant" && typeof msg.content === "string") {
      const text = msg.content.toLowerCase();
      if (text.includes("created") || text.includes("saved") || text.includes("wrote")) {
        decisions.add("created/modified content");
      }
      if (text.includes("approved") || text.includes("confirmed")) {
        decisions.add("approved/confirmed");
      }
    }

    if (msg.role === "tool" && msg.toolName === "loadSkill") {
      toolsUsed.add(`skill:${msg.toolName}`);
    }
  }

  const lines: string[] = ["[Summary of earlier conversation]"];

  if (topics.size > 0) {
    lines.push(`Topics: ${Array.from(topics).join(", ")}`);
  }
  if (questionTypes.size > 0) {
    lines.push(`Questions: ${Array.from(questionTypes).join(", ")}`);
  }
  if (decisions.size > 0) {
    lines.push(`Decisions: ${Array.from(decisions).join(", ")}`);
  }
  if (toolsUsed.size > 0) {
    const toolList = Array.from(toolsUsed)
      .filter((t) => t !== "ask-human" && t !== "loadCapability")
      .slice(0, 5);
    if (toolList.length > 0) {
      lines.push(`Tools used: ${toolList.join(", ")}`);
    }
  }
  lines.push("The conversation continues below.");

  return lines.join("\n");
}

/**
 * Compact conversation history when it exceeds the turn threshold.
 * Summarizes everything older than the last N verbatim turns into a
 * single system message, keeping the most recent turns intact.
 *
 * Mutates the messages array in place. Idempotent — skips if already compacted.
 */
export function compactConversationHistory(
  messages: z.infer<typeof Message>[],
  tight?: boolean,
): void {
  const threshold = tight ? MIN_TURNS_BEFORE_SUMMARY_TIGHT : MIN_TURNS_BEFORE_SUMMARY;
  if (messages.length < threshold) return;

  let turnCount = 0;
  let splitIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" || msg.role === "assistant") {
      turnCount++;
      if (turnCount === KEEP_VERBATIM_TURNS) {
        splitIndex = i;
        break;
      }
    }
  }
  if (splitIndex <= 0) return;

  // Check if already compacted (has a summary message)
  for (let i = 0; i < splitIndex; i++) {
    const sysMsg = messages[i];
    if (sysMsg.role === "system" && typeof sysMsg.content === "string" && sysMsg.content.includes("[Summary of earlier conversation:")) {
      return; // Already compacted, idempotent
    }
  }

  const summary = buildHeuristicSummary(messages, splitIndex);
  const kept = messages.slice(splitIndex);
  messages.length = 0;
  messages.push({
    role: "system",
    content: summary,
  });
  messages.push(...kept);

  console.log(
    `[History] Compacted ${splitIndex} old messages into summary (keeping ${KEEP_VERBATIM_TURNS} turns verbatim)`,
  );
}
