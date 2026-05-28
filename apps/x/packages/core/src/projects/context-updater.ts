import container from "../di/container.js";
import type { IProjectsRepo } from "./repo.js";

interface RunEventLike {
  type: string;
  runId?: string;
  toolName?: string;
  input?: string;
  message?: { role: string; content: string | Array<{ type: string; text?: string }> };
  error?: string;
  reason?: string;
}

/**
 * Extract structured summary from a completed run's event log
 * and append it to the project's memory.md.
 *
 * No LLM call — structured extraction only.
 */
export async function updateProjectMemory(
  projectId: string,
  runId: string,
  events: RunEventLike[],
): Promise<void> {
  try {
    const repo = container.resolve<IProjectsRepo>("projectsRepo");

    const toolInvocations = events.filter((e) => e.type === "tool-invocation");
    const messages = events.filter((e) => e.type === "message");
    const stoppedEvent = events.find((e) => e.type === "run-stopped");
    const errorEvent = events.find((e) => e.type === "error");

    // Find first user message as goal
    const firstUserMsg = messages.find((m) => m.message?.role === "user");
    let goal = "Chat session";
    if (firstUserMsg?.message) {
      const content = firstUserMsg.message.content;
      if (typeof content === "string") {
        goal = content.length > 100 ? content.substring(0, 100) : content;
      } else if (Array.isArray(content)) {
        const textParts = content.filter((p) => p.type === "text");
        if (textParts.length > 0) {
          const text = textParts.map((p) => p.text ?? "").join(" ");
          goal = text.length > 100 ? text.substring(0, 100) : text;
        }
      }
    }

    const toolNames = [...new Set(toolInvocations.map((e) => e.toolName ?? ""))];

    const writeTools = toolInvocations.filter(
      (e) =>
        e.toolName === "write_file" ||
        e.toolName === "create_file" ||
        e.toolName === "write",
    );

    const ts = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
    const dateStr = ts.split(" ")[0];

    let entry = `### ${dateStr}\n\n`;
    entry += `**Goal:** ${goal}\n`;

    if (toolNames.length > 0) {
      entry += `**Actions:** Used ${toolNames.join(", ")}\n`;
    }

    if (writeTools.length > 0) {
      const writeInputs = writeTools
        .map((e) => {
          try {
            const input = JSON.parse(e.input ?? "{}");
            return input.path || input.file_path || input.filename;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      if (writeInputs.length > 0) {
        entry += `**Artifacts:** ${writeInputs.join(", ")}\n`;
      }
    }

    if (errorEvent?.error) {
      entry += `**Error:** ${String(errorEvent.error).substring(0, 200)}\n`;
    } else if (stoppedEvent) {
      entry += `**Status:** Stopped (${stoppedEvent.reason || "user-requested"})\n`;
    } else {
      entry += `**Status:** Completed\n`;
    }

    await repo.appendContext(projectId, entry);
  } catch (err) {
    console.error(`[Projects] Failed to update memory for project ${projectId}:`, err);
  }
}
