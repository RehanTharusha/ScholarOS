import { jsonSchema, ModelMessage } from "ai";
import fs from "fs";
import path from "path";
import { getScholarOSPath } from "../config/config.js";
import { Agent, ToolAttachment } from "@scholaros/shared/dist/agent.js";
import {
  AssistantContentPart,
  AssistantMessage,
  Message,
  MessageList,
  ProviderOptions,
  ToolCallPart,
  ToolMessage,
} from "@scholaros/shared/dist/message.js";
import {
  LanguageModel,
  stepCountIs,
  streamText,
  tool,
  Tool,
  ToolSet,
} from "ai";
import { z } from "zod";
import { LlmStepStreamEvent } from "@scholaros/shared/dist/llm-step-events.js";
import { execTool } from "../application/lib/exec-tool.js";
import {
  AskHumanRequestEvent,
  RunEvent,
  ToolPermissionRequestEvent,
} from "@scholaros/shared/dist/runs.js";
import { BuiltinTools } from "../application/lib/builtin-tools.js";
import { buildCopilotAgent } from "../application/assistant/agent.js";
import {
  buildVolatileInstructions,
} from "../application/assistant/instructions.js";
import {
  isDestructive,
  extractCommandNames,
} from "../application/lib/command-executor.js";
import container from "../di/container.js";
import { IModelConfigRepo } from "../models/repo.js";
import { createProvider } from "../models/models.js";
import { resolveProviderConfig } from "../models/defaults.js";
import { IAgentsRepo } from "./repo.js";
import { IMonotonicallyIncreasingIdGenerator } from "../application/lib/id-gen.js";
import { IBus } from "../application/lib/bus.js";
import {
  type MiddlePaneContext,
  IMessageQueue,
} from "../application/lib/message-queue.js";
import { IRunsRepo } from "../runs/repo.js";
import { IRunsLock } from "../runs/lock.js";
import { IAbortRegistry } from "../runs/abort-registry.js";
import { PrefixLogger } from "@scholaros/shared";
import { parse } from "yaml";
import { getRaw as getNoteCreationRaw } from "../knowledge/note_creation.js";
import { getRaw as getLabelingAgentRaw } from "../knowledge/note_tagging_agent.js";
import { getRaw as getKbRetrievalRaw } from "../application/assistant/agents/kb-retrieval.js";
import { shouldDisableTools } from "../config/config.js";
import { compactSkillResults, compactConversationHistory } from "./history-compaction.js";
import { getCacheControlProviderOptions } from "../models/cache-control.js";
import { enforceBudget } from "./budget.js";

function loadAgentNotesContext(): string | null {
  return null;
}

export interface IAgentRuntime {
  trigger(runId: string): Promise<void>;
}

export class AgentRuntime implements IAgentRuntime {
  private runsRepo: IRunsRepo;
  private idGenerator: IMonotonicallyIncreasingIdGenerator;
  private bus: IBus;
  private messageQueue: IMessageQueue;
  private modelConfigRepo: IModelConfigRepo;
  private runsLock: IRunsLock;
  private abortRegistry: IAbortRegistry;

  constructor({
    runsRepo,
    idGenerator,
    bus,
    messageQueue,
    modelConfigRepo,
    runsLock,
    abortRegistry,
  }: {
    runsRepo: IRunsRepo;
    idGenerator: IMonotonicallyIncreasingIdGenerator;
    bus: IBus;
    messageQueue: IMessageQueue;
    modelConfigRepo: IModelConfigRepo;
    runsLock: IRunsLock;
    abortRegistry: IAbortRegistry;
  }) {
    this.runsRepo = runsRepo;
    this.idGenerator = idGenerator;
    this.bus = bus;
    this.messageQueue = messageQueue;
    this.modelConfigRepo = modelConfigRepo;
    this.runsLock = runsLock;
    this.abortRegistry = abortRegistry;
  }

  async trigger(runId: string): Promise<void> {
    if (!(await this.runsLock.lock(runId))) {
      console.log(`unable to acquire lock on run ${runId}`);
      return;
    }
    const signal = this.abortRegistry.createForRun(runId);
    try {
      await this.bus.publish({
        runId,
        type: "run-processing-start",
        subflow: [],
      });
      while (true) {
        // Check for abort before each iteration
        if (signal.aborted) {
          break;
        }

        let eventCount = 0;
        const run = await this.runsRepo.fetch(runId);
        if (!run) {
          throw new Error(`Run ${runId} not found`);
        }
        const state = new AgentState();
        for (const event of run.log) {
          state.ingest(event);
        }
        try {
          for await (const event of streamAgent({
            state,
            idGenerator: this.idGenerator,
            runId,
            messageQueue: this.messageQueue,
            modelConfigRepo: this.modelConfigRepo,
            signal,
            abortRegistry: this.abortRegistry,
          })) {
            eventCount++;
            if (event.type !== "llm-stream-event") {
              await this.runsRepo.appendEvents(runId, [event]);
            }
            await this.bus.publish(event);
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            // Abort detected — exit cleanly
            break;
          }
          throw error;
        }

        // if no events, break
        if (!eventCount) {
          break;
        }
      }

      // Emit run-stopped event if aborted
      if (signal.aborted) {
        const stoppedEvent: z.infer<typeof RunEvent> = {
          runId,
          type: "run-stopped",
          reason: "user-requested",
          subflow: [],
        };
        await this.runsRepo.appendEvents(runId, [stoppedEvent]);
        await this.bus.publish(stoppedEvent);
      }
    } catch (error) {
      console.error(`Run ${runId} failed:`, error);
      const message =
        error instanceof Error
          ? error.stack || error.message || error.name
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
      const errorEvent: z.infer<typeof RunEvent> = {
        runId,
        type: "error",
        error: message,
        subflow: [],
      };
      await this.runsRepo.appendEvents(runId, [errorEvent]);
      await this.bus.publish(errorEvent);
    } finally {
      this.abortRegistry.cleanup(runId);
      await this.runsLock.release(runId);
      await this.bus.publish({
        runId,
        type: "run-processing-end",
        subflow: [],
      });
    }
  }
}

export async function mapAgentTool(
  t: z.infer<typeof ToolAttachment>,
): Promise<Tool> {
  switch (t.type) {
    case "mcp":
      return tool({
        name: t.name,
        description: t.description,
        inputSchema: jsonSchema(t.inputSchema),
      });
    case "agent": {
      const agent = await loadAgent(t.name);
      if (!agent) {
        throw new Error(`Agent ${t.name} not found`);
      }
      return tool({
        name: t.name,
        description: agent.description,
        inputSchema: z.object({
          message: z.string().describe("The message to send to the workflow"),
        }),
      });
    }
    case "builtin": {
      if (t.name === "ask-human") {
        return tool({
          description: "Ask a human before proceeding",
          inputSchema: z.object({
            question: z.string().describe("The question to ask the human"),
          }),
        });
      }
      const match = BuiltinTools[t.name];
      if (!match) {
        throw new Error(`Unknown builtin tool: ${t.name}`);
      }
      return tool({
        description: match.description,
        inputSchema: match.inputSchema,
      });
    }
  }
}

export class RunLogger {
  private logFile: string;
  private fileHandle: fs.WriteStream;

  ensureRunsDir() {
    const runsDir = getScholarOSPath("runs");
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }
  }

  constructor(runId: string) {
    this.ensureRunsDir();
    this.logFile = path.join(getScholarOSPath("runs"), `${runId}.jsonl`);
    this.fileHandle = fs.createWriteStream(this.logFile, {
      flags: "a",
      encoding: "utf8",
    });
  }

  log(event: z.infer<typeof RunEvent>) {
    if (event.type !== "llm-stream-event") {
      this.fileHandle.write(JSON.stringify(event) + "\n");
    }
  }

  close() {
    this.fileHandle.close();
  }
}

export class StreamStepMessageBuilder {
  private parts: z.infer<typeof AssistantContentPart>[] = [];
  private textBuffer: string = "";
  private reasoningBuffer: string = "";
  private providerOptions: z.infer<typeof ProviderOptions> | undefined =
    undefined;
  private reasoningProviderOptions:
    | z.infer<typeof ProviderOptions>
    | undefined = undefined;

  flushBuffers() {
    if (this.reasoningBuffer || this.reasoningProviderOptions) {
      this.parts.push({
        type: "reasoning",
        text: this.reasoningBuffer,
        providerOptions: this.reasoningProviderOptions,
      });
      this.reasoningBuffer = "";
      this.reasoningProviderOptions = undefined;
    }
    if (this.textBuffer) {
      this.parts.push({ type: "text", text: this.textBuffer });
      this.textBuffer = "";
    }
  }

  ingest(event: z.infer<typeof LlmStepStreamEvent>) {
    switch (event.type) {
      case "reasoning-start":
        break;
      case "reasoning-end":
        this.reasoningProviderOptions = event.providerOptions;
        this.flushBuffers();
        break;
      case "text-start":
      case "text-end":
        this.flushBuffers();
        break;
      case "reasoning-delta":
        this.reasoningBuffer += event.delta;
        break;
      case "text-delta":
        this.textBuffer += event.delta;
        break;
      case "tool-call":
        this.parts.push({
          type: "tool-call",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          arguments: event.input,
          providerOptions: event.providerOptions,
        });
        break;
      case "finish-step":
        this.providerOptions = event.providerOptions;
        break;
      case "error":
        this.flushBuffers();
        break;
    }
  }

  get(): z.infer<typeof AssistantMessage> {
    this.flushBuffers();
    return {
      role: "assistant",
      content: this.parts,
      providerOptions: this.providerOptions,
    };
  }
}

function formatLlmStreamError(rawError: unknown): string {
  let name: string | undefined;
  let responseBody: string | undefined;
  if (rawError && typeof rawError === "object") {
    const err = rawError as Record<string, unknown>;
    const nested =
      err.error && typeof err.error === "object"
        ? (err.error as Record<string, unknown>)
        : null;
    const nameValue = err.name ?? nested?.name;
    const responseBodyValue = err.responseBody ?? nested?.responseBody;
    if (nameValue !== undefined) {
      name = String(nameValue);
    }
    if (responseBodyValue !== undefined) {
      responseBody = String(responseBodyValue);
    }
  } else if (typeof rawError === "string") {
    responseBody = rawError;
  }

  const lines: string[] = [];
  if (name) lines.push(`name: ${name}`);
  if (responseBody) lines.push(`responseBody: ${responseBody}`);
  return lines.length ? lines.join("\n") : "Model stream error";
}

export async function loadAgent(id: string): Promise<z.infer<typeof Agent>> {
  if (id === "copilot" || id === "scholaros") {
    return buildCopilotAgent();
  }

  if (id === "note_creation") {
    const raw = getNoteCreationRaw();
    let agent: z.infer<typeof Agent> = {
      name: id,
      instructions: raw,
    };

    // Parse frontmatter if present
    if (raw.startsWith("---")) {
      const end = raw.indexOf("\n---", 3);
      if (end !== -1) {
        const fm = raw.slice(3, end).trim();
        const content = raw.slice(end + 4).trim();
        const yaml = parse(fm);
        const parsed = Agent.omit({ name: true, instructions: true }).parse(
          yaml,
        );
        agent = {
          ...agent,
          ...parsed,
          instructions: content,
        };
      }
    }

    return agent;
  }

  if (id === "labeling_agent") {
    const labelingAgentRaw = getLabelingAgentRaw();
    let agent: z.infer<typeof Agent> = {
      name: id,
      instructions: labelingAgentRaw,
    };

    if (labelingAgentRaw.startsWith("---")) {
      const end = labelingAgentRaw.indexOf("\n---", 3);
      if (end !== -1) {
        const fm = labelingAgentRaw.slice(3, end).trim();
        const content = labelingAgentRaw.slice(end + 4).trim();
        const yaml = parse(fm);
        const parsed = Agent.omit({ name: true, instructions: true }).parse(
          yaml,
        );
        agent = {
          ...agent,
          ...parsed,
          instructions: content,
        };
      }
    }

    return agent;
  }

  if (id === "kb-retrieval") {
    const raw = getKbRetrievalRaw();
    let agent: z.infer<typeof Agent> = {
      name: id,
      instructions: raw,
    };

    if (raw.startsWith("---")) {
      const end = raw.indexOf("\n---", 3);
      if (end !== -1) {
        const fm = raw.slice(3, end).trim();
        const content = raw.slice(end + 4).trim();
        const yaml = parse(fm);
        const parsed = Agent.omit({ name: true, instructions: true }).parse(
          yaml,
        );
        agent = {
          ...agent,
          ...parsed,
          instructions: content,
        };
      }
    }

    return agent;
  }

  const repo = container.resolve<IAgentsRepo>("agentsRepo");
  return await repo.fetch(id);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function convertFromMessages(
  messages: z.infer<typeof Message>[],
  instructions?: string,
): ModelMessage[] {
  // Compact old loadSkill results to avoid bloat from skill text in history
  compactSkillResults(messages);

  // Summarize old conversation turns when history grows long (Phase 4.3)
  compactConversationHistory(messages);

  // Enforce per-turn token budget (Phase 4.1)
  if (instructions) {
    const { messages: trimmed, report } = enforceBudget(messages, instructions);
    if (report.trimmedTurns > 0) {
      console.log(
        `[Budget] ${report.note} (est: ${report.estimatedTotal}/${report.totalBudget})`,
      );
    }
    messages.length = 0;
    messages.push(...trimmed);
  }

  const result: ModelMessage[] = [];
  for (const msg of messages) {
    const { providerOptions } = msg;
    switch (msg.role) {
      case "assistant":
        if (typeof msg.content === "string") {
          result.push({
            role: "assistant",
            content: msg.content,
            providerOptions,
          });
        } else {
          result.push({
            role: "assistant",
            content: msg.content.map((part) => {
              switch (part.type) {
                case "text":
                  return part;
                case "reasoning":
                  return part;
                case "tool-call":
                  return {
                    type: "tool-call",
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    input: part.arguments,
                    providerOptions: part.providerOptions,
                  };
              }
            }),
            providerOptions,
          });
        }
        break;
      case "system":
        result.push({
          role: "system",
          content: msg.content,
          providerOptions,
        });
        break;
      case "user":
        if (typeof msg.content === "string") {
          // Legacy string — pass through unchanged
          result.push({
            role: "user",
            content: msg.content,
            providerOptions,
          });
        } else {
          // New content parts array — collapse to text for LLM
          const textSegments: string[] = [];
          const attachmentLines: string[] = [];

          for (const part of msg.content) {
            if (part.type === "attachment") {
              const sizeStr = part.size ? `, ${formatBytes(part.size)}` : "";
              const lineStr = part.lineNumber
                ? ` (line ${part.lineNumber})`
                : "";
              attachmentLines.push(
                `- ${part.filename} (${part.mimeType}${sizeStr}) at ${part.path}${lineStr}`,
              );
            } else {
              textSegments.push(part.text);
            }
          }

          if (attachmentLines.length > 0) {
            textSegments.unshift(
              "User has attached the following files:",
              ...attachmentLines,
              "",
            );
          }

          result.push({
            role: "user",
            content: textSegments.join("\n"),
            providerOptions,
          });
        }
        break;
      case "tool":
        result.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: msg.toolCallId,
              toolName: msg.toolName,
              output: {
                type: "text",
                value: msg.content,
              },
            },
          ],
          providerOptions,
        });
        break;
    }
  }
  // doing this because: https://github.com/OpenRouterTeam/ai-sdk-provider/issues/262
  return JSON.parse(JSON.stringify(result));
}

async function buildTools(agent: z.infer<typeof Agent>): Promise<ToolSet> {
  const tools: ToolSet = {};
  for (const [name, tool] of Object.entries(agent.tools ?? {})) {
    try {
      // Skip builtin tools that declare themselves unavailable
      if (tool.type === "builtin") {
        const builtin = BuiltinTools[tool.name];
        if (builtin?.isAvailable && !(await builtin.isAvailable())) {
          continue;
        }
      }
      tools[name] = await mapAgentTool(tool);
    } catch (error) {
      console.error(`Error mapping tool ${name}:`, error);
      continue;
    }
  }
  return tools;
}

export class AgentState {
  runId: string | null = null;
  agent: z.infer<typeof Agent> | null = null;
  agentName: string | null = null;
  runModel: string | null = null;
  runProvider: string | null = null;
  messages: z.infer<typeof MessageList> = [];
  lastAssistantMsg: z.infer<typeof AssistantMessage> | null = null;
  subflowStates: Record<string, AgentState> = {};
  toolCallIdMap: Record<string, z.infer<typeof ToolCallPart>> = {};
  pendingToolCalls: Record<string, true> = {};
  pendingToolPermissionRequests: Record<
    string,
    z.infer<typeof ToolPermissionRequestEvent>
  > = {};
  pendingAskHumanRequests: Record<
    string,
    z.infer<typeof AskHumanRequestEvent>
  > = {};
  allowedToolCallIds: Record<string, true> = {};
  deniedToolCallIds: Record<string, true> = {};
  sessionAllowedCommands: Set<string> = new Set();

  getPendingPermissions(): z.infer<typeof ToolPermissionRequestEvent>[] {
    const response: z.infer<typeof ToolPermissionRequestEvent>[] = [];
    for (const [id, subflowState] of Object.entries(this.subflowStates)) {
      for (const perm of subflowState.getPendingPermissions()) {
        response.push({
          ...perm,
          subflow: [id, ...perm.subflow],
        });
      }
    }
    for (const perm of Object.values(this.pendingToolPermissionRequests)) {
      response.push({
        ...perm,
        subflow: [],
      });
    }
    return response;
  }

  getPendingAskHumans(): z.infer<typeof AskHumanRequestEvent>[] {
    const response: z.infer<typeof AskHumanRequestEvent>[] = [];
    for (const [id, subflowState] of Object.entries(this.subflowStates)) {
      for (const ask of subflowState.getPendingAskHumans()) {
        response.push({
          ...ask,
          subflow: [id, ...ask.subflow],
        });
      }
    }
    for (const ask of Object.values(this.pendingAskHumanRequests)) {
      response.push({
        ...ask,
        subflow: [],
      });
    }
    return response;
  }

  /**
   * Returns tool-result messages for all pending tool calls, marking them as aborted.
   * This is called when a run is stopped so the LLM knows what happened to its tool requests.
   */
  getAbortedToolResults(): z.infer<typeof ToolMessage>[] {
    const results: z.infer<typeof ToolMessage>[] = [];
    for (const toolCallId of Object.keys(this.pendingToolCalls)) {
      const toolCall = this.toolCallIdMap[toolCallId];
      if (toolCall) {
        results.push({
          role: "tool",
          content: JSON.stringify({ error: "Tool execution aborted" }),
          toolCallId,
          toolName: toolCall.toolName,
        });
      }
    }
    return results;
  }

  /**
   * Clear all pending state (permissions, ask-human, tool calls).
   * Used when a run is stopped.
   */
  clearAllPending(): void {
    this.pendingToolPermissionRequests = {};
    this.pendingAskHumanRequests = {};
    // Recursively clear subflows
    for (const subflow of Object.values(this.subflowStates)) {
      subflow.clearAllPending();
    }
  }

  finalResponse(): string {
    if (!this.lastAssistantMsg) {
      return "";
    }
    if (typeof this.lastAssistantMsg.content === "string") {
      return this.lastAssistantMsg.content;
    }
    return this.lastAssistantMsg.content.reduce((acc, part) => {
      if (part.type === "text") {
        return acc + part.text;
      }
      return acc;
    }, "");
  }

  ingest(event: z.infer<typeof RunEvent>) {
    if (event.subflow.length > 0) {
      const { subflow, ...rest } = event;
      if (!this.subflowStates[subflow[0]]) {
        this.subflowStates[subflow[0]] = new AgentState();
      }
      this.subflowStates[subflow[0]].ingest({
        ...rest,
        subflow: subflow.slice(1),
      });
      return;
    }
    switch (event.type) {
      case "start":
        this.runId = event.runId;
        this.agentName = event.agentName;
        this.runModel = event.model;
        this.runProvider = event.provider;
        break;
      case "spawn-subflow":
        // Seed the subflow state with its agent so downstream loadAgent works.
        // Subflows inherit the parent run's model+provider — there's one pair per run.
        if (!this.subflowStates[event.toolCallId]) {
          this.subflowStates[event.toolCallId] = new AgentState();
        }
        this.subflowStates[event.toolCallId].agentName = event.agentName;
        this.subflowStates[event.toolCallId].runModel = this.runModel;
        this.subflowStates[event.toolCallId].runProvider = this.runProvider;
        break;
      case "message":
        this.messages.push(event.message);
        if (event.message.content instanceof Array) {
          for (const part of event.message.content) {
            if (part.type === "tool-call") {
              this.toolCallIdMap[part.toolCallId] = part;
              this.pendingToolCalls[part.toolCallId] = true;
            }
          }
        }
        if (event.message.role === "tool") {
          const message = event.message as z.infer<typeof ToolMessage>;
          delete this.pendingToolCalls[message.toolCallId];
        }
        if (event.message.role === "assistant") {
          this.lastAssistantMsg = event.message;
        }
        break;
      case "tool-permission-request":
        this.pendingToolPermissionRequests[event.toolCall.toolCallId] = event;
        break;
      case "tool-permission-response":
        switch (event.response) {
          case "approve":
            this.allowedToolCallIds[event.toolCallId] = true;
            // For session scope, extract command names and add to session allowlist
            if (event.scope === "session") {
              const toolCall = this.toolCallIdMap[event.toolCallId];
              if (
                toolCall &&
                typeof toolCall.arguments === "object" &&
                toolCall.arguments !== null &&
                "command" in toolCall.arguments
              ) {
                const names = extractCommandNames(
                  String(toolCall.arguments.command),
                );
                for (const name of names) {
                  this.sessionAllowedCommands.add(name);
                }
              }
            }
            break;
          case "deny":
            this.deniedToolCallIds[event.toolCallId] = true;
            break;
        }
        delete this.pendingToolPermissionRequests[event.toolCallId];
        break;
      case "ask-human-request":
        this.pendingAskHumanRequests[event.toolCallId] = event;
        break;
      case "ask-human-response": {
        // console.error('im here', this.agentName, this.runId, event.subflow);
        const ogEvent = this.pendingAskHumanRequests[event.toolCallId];
        this.messages.push({
          role: "tool",
          content: JSON.stringify({
            userResponse: event.response,
          }),
          toolCallId: ogEvent.toolCallId,
          toolName: this.toolCallIdMap[ogEvent.toolCallId]!.toolName,
        });
        delete this.pendingAskHumanRequests[ogEvent.toolCallId];
        break;
      }
    }
  }
}

export async function* streamAgent({
  state,
  idGenerator,
  runId,
  messageQueue,
  modelConfigRepo,
  signal,
  abortRegistry,
}: {
  state: AgentState;
  idGenerator: IMonotonicallyIncreasingIdGenerator;
  runId: string;
  messageQueue: IMessageQueue;
  modelConfigRepo: IModelConfigRepo;
  signal: AbortSignal;
  abortRegistry: IAbortRegistry;
}): AsyncGenerator<z.infer<typeof RunEvent>, void, unknown> {
  const logger = new PrefixLogger(`run-${runId}-${state.agentName}`);

  async function* processEvent(
    event: z.infer<typeof RunEvent>,
  ): AsyncGenerator<z.infer<typeof RunEvent>, void, unknown> {
    state.ingest(event);
    yield event;
  }

  // set up agent
  const agent = await loadAgent(state.agentName!);

  // set up tools
  const tools = await buildTools(agent);

  // model+provider were resolved and frozen on the run at runs:create time.
  // Look up the named provider's current credentials from models.json and
  // instantiate the LLM client. No selection happens here.
  if (!state.runModel || !state.runProvider) {
    throw new Error(
      `Run ${runId} is missing model/provider on its start event`,
    );
  }
  const modelId = state.runModel;
  const providerConfig = await resolveProviderConfig(state.runProvider);
  const provider = createProvider(providerConfig);
  const model = provider.languageModel(modelId);
  logger.log(`using model: ${modelId} (provider: ${state.runProvider})`);

  let loopCounter = 0;
  let voiceInput = false;
  let voiceOutput: "summary" | "full" | null = null;
  let searchEnabled = false;
  let middlePaneContext: MiddlePaneContext | null = null;
  while (true) {
    // Check abort at the top of each iteration
    signal.throwIfAborted();

    loopCounter++;
    const loopLogger = logger.child(`iter-${loopCounter}`);
    loopLogger.log("starting loop iteration");

    // execute any pending tool calls
    for (const toolCallId of Object.keys(state.pendingToolCalls)) {
      const toolCall = state.toolCallIdMap[toolCallId];
      const _logger = loopLogger.child(`tc-${toolCallId}-${toolCall.toolName}`);
      _logger.log("processing");

      // if ask-human, skip
      if (toolCall.toolName === "ask-human") {
        _logger.log("skipping, reason: ask-human");
        continue;
      }

      // if tool has been denied, deny
      if (state.deniedToolCallIds[toolCallId]) {
        _logger.log(
          "returning denied tool message, reason: tool has been denied",
        );
        yield* processEvent({
          runId,
          messageId: await idGenerator.next(),
          type: "message",
          message: {
            role: "tool",
            content: "Unable to execute this tool: Permission was denied.",
            toolCallId: toolCallId,
            toolName: toolCall.toolName,
          },
          subflow: [],
        });
        continue;
      }

      // if permission is pending on this tool call, skip execution
      if (state.pendingToolPermissionRequests[toolCallId]) {
        _logger.log("skipping, reason: permission is pending");
        continue;
      }

      // execute approved tool
      // Check abort before starting tool execution
      if (signal.aborted) {
        _logger.log("skipping, reason: aborted");
        break;
      }
      _logger.log("executing tool");
      yield* processEvent({
        runId,
        type: "tool-invocation",
        toolCallId,
        toolName: toolCall.toolName,
        input: JSON.stringify(toolCall.arguments ?? {}),
        subflow: [],
      });
      let result: unknown = null;
      try {
        if (agent.tools![toolCall.toolName].type === "agent") {
          const subflowState = state.subflowStates[toolCallId];
          for await (const event of streamAgent({
            state: subflowState,
            idGenerator,
            runId,
            messageQueue,
            modelConfigRepo,
            signal,
            abortRegistry,
          })) {
            yield* processEvent({
              ...event,
              subflow: [toolCallId, ...event.subflow],
            });
          }
          if (
            !subflowState.getPendingAskHumans().length &&
            !subflowState.getPendingPermissions().length
          ) {
            result = subflowState.finalResponse();
          }
        } else {
          result = await execTool(
            agent.tools![toolCall.toolName],
            toolCall.arguments,
            { runId, signal, abortRegistry },
          );
        }
      } catch (error) {
        if (
          (error instanceof Error && error.name === "AbortError") ||
          signal.aborted
        ) {
          throw error;
        }
        const message =
          error instanceof Error ? error.message || error.name : String(error);
        _logger.log("tool failed", message);
        result = {
          success: false,
          error: message,
          toolName: toolCall.toolName,
        };
      }
      const resultPayload = result === undefined ? null : result;
      const resultMsg: z.infer<typeof ToolMessage> = {
        role: "tool",
        content: JSON.stringify(resultPayload),
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
      };
      yield* processEvent({
        runId,
        type: "tool-result",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: resultPayload,
        subflow: [],
      });
      yield* processEvent({
        runId,
        messageId: await idGenerator.next(),
        type: "message",
        message: resultMsg,
        subflow: [],
      });
    }

    // if waiting on user permission or ask-human, exit
    if (
      state.getPendingAskHumans().length ||
      state.getPendingPermissions().length
    ) {
      loopLogger.log("exiting loop, reason: pending asks or permissions");
      return;
    }

    // get any queued user messages
    while (true) {
      const msg = await messageQueue.dequeue(runId);
      if (!msg) {
        break;
      }
      if (msg.voiceInput) {
        voiceInput = true;
      }
      if (msg.searchEnabled) {
        searchEnabled = true;
      }
      if (msg.voiceOutput) {
        voiceOutput = msg.voiceOutput;
      }
      // Middle pane is NOT sticky — it should reflect the state at the moment of the
      // latest user message. If the user closed the pane between messages, clear it.
      middlePaneContext = msg.middlePaneContext ?? null;
      loopLogger.log("dequeued user message", msg.messageId);
      yield* processEvent({
        runId,
        type: "message",
        messageId: msg.messageId,
        message: {
          role: "user",
          content: msg.message,
        },
        subflow: [],
      });
    }

    // if last response is from assistant and text, exit
    const lastMessage = state.messages[state.messages.length - 1];
    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      (typeof lastMessage.content === "string" ||
        !lastMessage.content.some((part) => part.type === "tool-call"))
    ) {
      loopLogger.log(
        "exiting loop, reason: last message is from assistant and text",
      );
      return;
    }

    // run one LLM turn.
    loopLogger.log("running llm turn");
    // stream agent response and build message
    const messageBuilder = new StreamStepMessageBuilder();
    const now = new Date();
    const currentDateTime = now.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    // Stable prefix: agent instructions + volatile suffix: turn-specific context
    // For provider prompt caching, the stable prefix stays consistent turn-to-turn
    let instructionsWithDateTime = `Current date and time: ${currentDateTime}\n\n${agent.instructions}`;
    // Inject Agent Notes context for copilot
    if (state.agentName === "copilot" || state.agentName === "scholaros") {
      const volatileTurnParts: string[] = [];
      const agentNotesContext = loadAgentNotesContext();
      if (agentNotesContext) {
        volatileTurnParts.push(`\n\n${agentNotesContext}`);
      }
      // Lazy Middle-Pane: inject compact header; auto-expand full content only when
      // the user's latest message contains referential language (2.1).
      // This saves ~10K+ tokens/turn for unrelated questions while keeping full context
      // available when the question actually relates to the open item.
      const middlePaneHeader = `\n\n# Middle Pane (Current State)\nThis section reflects what the user has open in the middle pane RIGHT NOW, at the time of their latest message. **This is authoritative and overrides any earlier mention of a note or web page in this conversation** — if the conversation history references a different note or browser page, the user has since closed or navigated away from it. Do not treat earlier context as current.\n\n`;
      // Check latest user message for referential language that signals the question
      // relates to the open item. These are unambiguous cues to auto-expand.
      const latestUserMsg = [...state.messages].reverse().find(m => m.role === "user");
      const latestUserText = latestUserMsg && typeof latestUserMsg.content === "string"
        ? latestUserMsg.content.toLowerCase()
        : "";
      const referentialSignals = ["this", "here", "above", "below", "what i'm looking at",
        "this note", "this lecture", "explain this", "the part about", "this file",
        "this document", "this page", "summarize this", "quiz me on this",
        "what does this mean"];
      const shouldExpand = referentialSignals.some(s => latestUserText.includes(s))
        || voiceOutput !== null; // Voice mode always expands (model needs to read aloud)

      if (!middlePaneContext) {
        loopLogger.log("injecting middle pane context (empty)");
        volatileTurnParts.push(`${middlePaneHeader}**Nothing relevant is open in the middle pane right now.** The user is not looking at any note or web page. If earlier in this conversation you referenced a note or browser page as "what the user is viewing", that is no longer accurate — do not refer to it as currently open. Answer the user's latest message on its own merits.`);
      } else if (middlePaneContext.kind === "file") {
        loopLogger.log(
          "injecting middle pane context (file)",
          middlePaneContext.path,
        );
        let extractedContent = middlePaneContext.content;
        let parsedFormat =
          path.extname(middlePaneContext.path).slice(1) || "file";
        if (!extractedContent) {
          const parsed = await BuiltinTools.parseFile.execute({
            path: middlePaneContext.path,
          });
          if (parsed && parsed.success && typeof parsed.content === "string") {
            extractedContent = parsed.content;
            if (typeof parsed.format === "string" && parsed.format.length > 0) {
              parsedFormat = parsed.format;
            }
          }
        }
        if (extractedContent && shouldExpand) {
          // Auto-expand: user question relates to this file
          volatileTurnParts.push(`${middlePaneHeader}The user has a ${parsedFormat} file open. Its path and extracted text are provided below so you can reference it when relevant.\n\n## Open file path\n${middlePaneContext.path}\n\n## Open file content\n\`\`\`\n${extractedContent}\n\`\`\``);
        } else if (extractedContent) {
          // Lazy mode: compact header only (saves ~10K tokens for unrelated questions)
          const sectionCount = (extractedContent.match(/^#{1,3}\s/gm) || []).length;
          const wordCount = extractedContent.split(/\s+/).length;
          volatileTurnParts.push(`${middlePaneHeader}[Open file: ${path.basename(middlePaneContext.path)} | ${parsedFormat} | ~${wordCount} words | ${sectionCount} sections | path: ${middlePaneContext.path}]\n\nUse \`readOpenContext()\` to read the full content if the user's next question relates to this file.`);
        } else {
          volatileTurnParts.push(`${middlePaneHeader}The user has a file open, but it could not be parsed into readable text. If the user's question depends on its contents, ask them to provide a clearer source or use the file tools to inspect it.`);
        }
      } else if (middlePaneContext.kind === "note") {
        loopLogger.log(
          "injecting middle pane context (note)",
          middlePaneContext.path,
        );
        const noteContent = middlePaneContext.content || "";
        const sectionCount = (noteContent.match(/^#{1,3}\s/gm) || []).length;
        const wordCount = noteContent.split(/\s+/).length;
        const noteTitle = path.basename(middlePaneContext.path, ".md");
        if (shouldExpand) {
          // Auto-expand: user question relates to this note
          volatileTurnParts.push(`${middlePaneHeader}The user has a note open. Its path and full content are provided below so you can reference it when relevant.\n\n## Open note path\n${middlePaneContext.path}\n\n## Open note content\n\`\`\`\n${noteContent}\n\`\`\``);
        } else {
          // Lazy mode: compact header with section index
          const sections = (noteContent.match(/^#{2,3}\s.+/gm) || []).map(s => s.trim()).join(" | ");
          volatileTurnParts.push(`${middlePaneHeader}[Open note: "${noteTitle}" | ~${wordCount} words | ${sectionCount} sections | path: ${middlePaneContext.path}]\n${sections ? `\nSections: ${sections}` : ""}\n\nUse \`readOpenContext()\` to read the full content or a specific section if the user's next question relates to this note.`);
        }
      } else if (middlePaneContext.kind === "browser") {
        loopLogger.log(
          "injecting middle pane context (browser)",
          middlePaneContext.url,
        );
        volatileTurnParts.push(`${middlePaneHeader}The user has the embedded browser open and is viewing a web page. Only the URL and page title are shown below — the page content itself is NOT included here. If you need the page content to answer, use the browser tools available to you to read the page.\n\n**How to use this context:**\n- The user may or may not be talking about this page. Do NOT assume every message is about it.\n- Only reference or act on this page when the user's message clearly relates to it (e.g. "this page", "this article", "what I'm looking at", "this site", "summarize this").\n- For unrelated questions (general chat, questions about other notes, tasks, emails, calendar, etc.), ignore this context entirely and answer normally.\n- Do not mention that you can see the browser unless it is relevant to the answer.\n\n## Current page\nURL: ${middlePaneContext.url}\nTitle: ${middlePaneContext.title}`);
      }
      // Inject volatile instructions (calendar, warm profile) — these change per-turn
      const volatileInstructions = await buildVolatileInstructions();
      if (volatileInstructions) {
        volatileTurnParts.push(`\n\n${volatileInstructions}`);
      }
      instructionsWithDateTime += volatileTurnParts.join("");
    }
    if (voiceInput) {
      loopLogger.log("voice input enabled, injecting voice input prompt");
      instructionsWithDateTime += `\n\n# Voice Input\nThe user's message was transcribed from speech. Be aware that:\n- There may be transcription errors. Silently correct obvious ones (e.g. homophones, misheard words). If an error is genuinely ambiguous, briefly mention your interpretation (e.g. "I'm assuming you meant X").\n- Spoken messages are often long-winded. The user may ramble, repeat themselves, or correct something they said earlier in the same message. Focus on their final intent, not every word verbatim.`;
    }
    if (voiceOutput === "summary") {
      loopLogger.log(
        "voice output enabled (summary mode), injecting voice output prompt",
      );
      instructionsWithDateTime += `\n\n# Voice Output (MANDATORY — READ THIS FIRST)\nThe user has voice output enabled. THIS IS YOUR #1 PRIORITY: you MUST start your response with <voice></voice> tags. If your response does not begin with <voice> tags, the user will hear nothing — which is a broken experience. NEVER skip this.\n\nRules:\n1. YOUR VERY FIRST OUTPUT MUST BE A <voice> TAG. No exceptions. Do not start with markdown, headings, or any other text. The literal first characters of your response must be "<voice>".\n2. Place ALL <voice> tags at the BEGINNING of your response, before any detailed content. Do NOT intersperse <voice> tags throughout the response.\n3. Wrap EACH spoken sentence in its own separate <voice> tag so it can be spoken incrementally. Do NOT wrap everything in a single <voice> block.\n4. Use voice as a TL;DR and navigation aid — do NOT read the entire response aloud.\n5. After all <voice> tags, you may include detailed written content (markdown, tables, code, etc.) that will be shown visually but not spoken.\n\n## Examples\n\nExample 1 — User asks: "what happened in my meeting with Alex yesterday?"\n\n<voice>Your meeting with Alex covered three main things: the Q2 roadmap timeline, hiring for the backend role, and the client demo next week.</voice>\n<voice>I've pulled out the key details and action items below — the demo prep notes are at the end.</voice>\n\n## Meeting with Alex — March 11\n### Roadmap\n- Agreed to push Q2 launch to April 15...\n(detailed written content continues)\n\nExample 2 — User asks: "summarize my emails"\n\n<voice>You have five new emails since this morning.</voice>\n<voice>Two are from your team — Jordan sent the RFC you requested and Taylor flagged a contract issue.</voice>\n<voice>There's also a warm intro from a VC partner connecting you with someone at a prospective customer.</voice>\n<voice>I've drafted responses for three of them. The details and drafts are below.</voice>\n\n(email blocks, tables, and detailed content follow)\n\nExample 3 — User asks: "what's on my calendar today?"\n\n<voice>You've got a pretty packed day — seven meetings starting with standup at 9.</voice>\n<voice>The big ones are your investor call at 11, lunch with a partner from your lead VC at 12:30, and a customer call at 4.</voice>\n<voice>Your only free block for deep work is 2:30 to 4.</voice>\n\n(calendar block with full event details follows)\n\nExample 4 — User asks: "draft an email to Sam with our metrics"\n\n<voice>Done — I've drafted the email to Sam with your latest WAU and churn numbers.</voice>\n<voice>Take a look at the draft below and send it when you're ready.</voice>\n\n(email block with draft follows)\n\nREMEMBER: If you do not start with <voice> tags, the user hears silence. Always speak first, then write.\n`;
    } else if (voiceOutput === "full") {
      loopLogger.log(
        "voice output enabled (full mode), injecting voice output prompt",
      );
      instructionsWithDateTime += `\n\n# Voice Output — Full Read-Aloud (MANDATORY — READ THIS FIRST)\nThe user wants your ENTIRE response spoken aloud. THIS IS YOUR #1 PRIORITY: every single sentence must be wrapped in <voice></voice> tags. If you write anything outside <voice> tags, the user will not hear it — which is a broken experience. NEVER skip this.\n\nRules:\n1. YOUR VERY FIRST OUTPUT MUST BE A <voice> TAG. No exceptions. The literal first characters of your response must be "<voice>".\n2. Wrap EACH sentence in its own separate <voice> tag so it can be spoken incrementally.\n3. Write your response in a natural, conversational style suitable for listening — no markdown headings, bullet points, or formatting symbols. Use plain spoken language.\n4. Structure the content as if you are speaking to the user directly. Use transitions like "first", "also", "one more thing" instead of visual formatting.\n5. EVERY sentence MUST be inside a <voice> tag. Do not leave ANY content outside <voice> tags. If it's not in a <voice> tag, the user cannot hear it.\n\n## Examples\n\nExample 1 — User asks: "what happened in my meeting with Alex yesterday?"\n\n<voice>Your meeting with Alex covered three main things.</voice>\n<voice>First, you discussed the Q2 roadmap timeline and agreed to push the launch to April.</voice>\n<voice>Second, you talked about hiring for the backend role — Alex will send over two candidates by Friday.</voice>\n<voice>And lastly, the client demo is next week on Thursday at 2pm, and you're handling the intro slides.</voice>\n\nExample 2 — User asks: "summarize my emails"\n\n<voice>You've got five new emails since this morning.</voice>\n<voice>Two are from your team — Jordan sent the RFC you asked for, and Taylor flagged a contract issue that needs your sign-off.</voice>\n<voice>There's a warm intro from a VC partner connecting you with an engineering lead at a potential customer.</voice>\n<voice>And someone from a prospective client wants to confirm your API tier before your call this afternoon.</voice>\n<voice>I've drafted replies for three of them — the metrics update, the intro, and the API question.</voice>\n<voice>The only one I left for you is Taylor's contract redline, since that needs your judgment on the liability cap.</voice>\n\nExample 3 — User asks: "what's on my calendar today?"\n\n<voice>You've got a packed day — seven meetings starting with standup at 9.</voice>\n<voice>The highlights are your investor call at 11, lunch with a VC partner at 12:30, and a customer call at 4.</voice>\n<voice>Your only open block for deep work is 2:30 to 4, so plan accordingly.</voice>\n<voice>Oh, and your 1-on-1 with your co-founder is at 5:30 — that's a walking meeting.</voice>\n\nExample 4 — User asks: "how are our metrics looking?"\n\n<voice>Metrics are looking strong this week.</voice>\n<voice>You hit 2,573 weekly active users, which is up 12% week over week.</voice>\n<voice>That means you've crossed the 2,500 milestone — worth calling out in your next investor update.</voice>\n<voice>Churn is down to 4.1%, improving month over month.</voice>\n<voice>The trailing 8-week compound growth rate is about 10%.</voice>\n\nREMEMBER: Start with <voice> immediately. No preamble, no markdown before it. Speak first.`;
    }
    if (searchEnabled) {
      loopLogger.log("search enabled, injecting search prompt");
      instructionsWithDateTime += `\n\n# Search\nThe user has enabled search for this message. Call the \`web-search\` tool once with their query. The tool handles all browser interaction internally — navigate, read page, extract content. Do NOT narrate the process. Do NOT say "let me open the browser" or "I'll search now" — just call the tool silently. Wait for the results, then answer the question naturally.`;
    }
    let streamError: string | null = null;
    for await (const event of streamLlm(
      model,
      state.messages,
      instructionsWithDateTime,
      tools,
      state.runProvider,
      signal,
    )) {
      messageBuilder.ingest(event);
      yield* processEvent({
        runId,
        type: "llm-stream-event",
        event: event,
        subflow: [],
      });
      if (event.type === "error") {
        streamError = event.error;
        yield* processEvent({
          runId,
          type: "error",
          error: streamError,
          subflow: [],
        });
        break;
      }
    }

    // build and emit final message from agent response
    const message = messageBuilder.get();
    yield* processEvent({
      runId,
      messageId: await idGenerator.next(),
      type: "message",
      message,
      subflow: [],
    });

    if (streamError) {
      return;
    }

    // if there were any ask-human calls, emit those events
    if (message.content instanceof Array) {
      for (const part of message.content) {
        if (part.type === "tool-call") {
          const underlyingTool = agent.tools![part.toolName];
          if (
            underlyingTool.type === "builtin" &&
            underlyingTool.name === "ask-human"
          ) {
            loopLogger.log(
              "emitting ask-human-request, toolCallId:",
              part.toolCallId,
            );
            yield* processEvent({
              runId,
              type: "ask-human-request",
              toolCallId: part.toolCallId,
              query: part.arguments.question,
              subflow: [],
            });
          }
          if (
            underlyingTool.type === "builtin" &&
            underlyingTool.name === "executeCommand"
          ) {
            // Only seek permission for destructive commands
            // Non-destructive commands execute immediately without prompting
            if (isDestructive(part.arguments.command)) {
              loopLogger.log(
                "emitting tool-permission-request (destructive command), toolCallId:",
                part.toolCallId,
              );
              yield* processEvent({
                runId,
                type: "tool-permission-request",
                toolCall: part,
                subflow: [],
              });
            } else {
              loopLogger.log(
                "skipping permission request (non-destructive command), toolCallId:",
                part.toolCallId,
              );
            }
          }
          if (underlyingTool.type === "agent" && underlyingTool.name) {
            loopLogger.log(
              "emitting spawn-subflow, toolCallId:",
              part.toolCallId,
            );
            yield* processEvent({
              runId,
              type: "spawn-subflow",
              agentName: underlyingTool.name,
              toolCallId: part.toolCallId,
              subflow: [],
            });
            yield* processEvent({
              runId,
              messageId: await idGenerator.next(),
              type: "message",
              message: {
                role: "user",
                content: part.arguments.message,
              },
              subflow: [part.toolCallId],
            });
          }
        }
      }
    }
  }
}

async function* streamLlm(
  model: LanguageModel,
  messages: z.infer<typeof MessageList>,
  instructions: string,
  tools: ToolSet,
  providerName: string,
  signal?: AbortSignal,
): AsyncGenerator<z.infer<typeof LlmStepStreamEvent>, void, unknown> {
  const converted = convertFromMessages(messages, instructions);

  // Pass the system prompt appropriately for the provider. The previous
  // implementation always unshifted a `{ role: "system" }` message into the
  // `messages` array. That breaks the openai-compatible provider used by
  // opencode-zen / opencode-go: the model ends up not seeing the user
  // message and hallucinates one (recent run logs with
  // deepseek-v4-flash-free showed reasoning like "The user hasn't said
  // anything yet" or fabricated "The user said 'Looking for something…'").
  //
  // The AI SDK v5 `streamText` `system` field accepts only a string — it
  // has no part-array form, so it cannot carry Anthropic `cacheControl`
  // markers. To keep prompt caching on Anthropic while restoring the working
  // `system` parameter path for every other provider, we use the messages
  // array form only for Anthropic and the dedicated `system` parameter for
  // all others.
  const cacheOptions = getCacheControlProviderOptions(providerName);
  const useMessagesArraySystem = Object.keys(cacheOptions).length > 0;

  let streamMessages = converted;
  if (useMessagesArraySystem) {
    streamMessages = [
      {
        role: "system" as const,
        content: instructions,
        providerOptions: cacheOptions,
      },
      ...converted,
    ];
  }

  console.log(`! SENDING payload to model: `, JSON.stringify(streamMessages));

  // Development mode: allow disabling tools for LLMs without tool support
  const disableTools = shouldDisableTools();
  if (disableTools) {
    console.log(`[DEV] Tools disabled via config/env`);
  }

  const { fullStream } = streamText({
    model,
    messages: streamMessages,
    system: useMessagesArraySystem ? undefined : instructions,
    tools: disableTools ? undefined : tools,
    stopWhen: stepCountIs(1),
    abortSignal: signal,
  });
  for await (const event of fullStream) {
    // Check abort on every chunk for responsiveness
    signal?.throwIfAborted();
    console.log("-> \t\tstream event", JSON.stringify(event));
    switch (event.type) {
      case "error":
        yield {
          type: "error",
          error: formatLlmStreamError(
            (event as { error?: unknown }).error ?? event,
          ),
        };
        return;
      case "reasoning-start":
        yield {
          type: "reasoning-start",
          providerOptions: event.providerMetadata,
        };
        break;
      case "reasoning-delta":
        yield {
          type: "reasoning-delta",
          delta: event.text,
          providerOptions: event.providerMetadata,
        };
        break;
      case "reasoning-end":
        yield {
          type: "reasoning-end",
          providerOptions: event.providerMetadata,
        };
        break;
      case "text-start":
        yield {
          type: "text-start",
          providerOptions: event.providerMetadata,
        };
        break;
      case "text-end":
        yield {
          type: "text-end",
          providerOptions: event.providerMetadata,
        };
        break;
      case "text-delta":
        yield {
          type: "text-delta",
          delta: event.text,
          providerOptions: event.providerMetadata,
        };
        break;
      case "tool-input-start":
        yield {
          type: "tool-input-start",
          toolCallId: event.id,
          toolName: event.toolName,
        };
        break;
      case "tool-input-delta":
        yield {
          type: "tool-input-delta",
          toolCallId: event.id,
          delta: event.delta,
        };
        break;
      case "tool-input-end":
        yield {
          type: "tool-input-end",
          toolCallId: event.id,
        };
        break;
      case "tool-call":
        yield {
          type: "tool-call",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
          providerOptions: event.providerMetadata,
        };
        break;
      case "finish-step":
        yield {
          type: "finish-step",
          usage: event.usage,
          finishReason: event.finishReason,
          providerOptions: event.providerMetadata,
        };
        break;
      default:
        console.log("unknown stream event:", JSON.stringify(event));
        continue;
    }
  }
}
export const MappedToolCall = z.object({
  toolCall: ToolCallPart,
  agentTool: ToolAttachment,
});
