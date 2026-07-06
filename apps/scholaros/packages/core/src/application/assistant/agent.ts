import { Agent, ToolAttachment } from "@scholaros/shared/dist/agent.js";
import z from "zod";
import { buildCopilotInstructions } from "./instructions.js";
import { BuiltinTools } from "../lib/builtin-tools.js";

/**
 * Build the CopilotAgent dynamically.
 * Tools are derived from the current BuiltinTools (which include Composio meta-tools),
 * and instructions include the live Composio connection status.
 */
export async function buildCopilotAgent(): Promise<z.infer<typeof Agent>> {
    const tools: Record<string, z.infer<typeof ToolAttachment>> = {};
    for (const name of Object.keys(BuiltinTools)) {
        tools[name] = { type: "builtin", name };
    }
    // Register the course-aware retrieval sub-agent as an agent-type tool
    tools["retrieveFromKB"] = {
        type: "agent",
        name: "kb-retrieval",
    };
    const instructions = await buildCopilotInstructions();
    return {
        name: "scholaros",
        description: "ScholarOS copilot",
        instructions,
        tools,
    };
}
