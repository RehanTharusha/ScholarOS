import { Message } from "@scholaros/shared/dist/message.js";
import { z } from "zod";

export interface TokenBudget {
  total: number;
  system: number;
  context: number;
  history: number;
  skills: number;
}

export interface BudgetReport {
  totalBudget: number;
  estimatedTotal: number;
  estimatedSystem: number;
  estimatedHistory: number;
  estimatedContext: number;
  estimatedSkills: number;
  trimmedTurns: number;
  note: string;
}

const DEFAULT_CONTEXT_WINDOW = 128_000;

export const DEFAULT_BUDGET: TokenBudget = {
  total: DEFAULT_CONTEXT_WINDOW,
  system: Math.floor(DEFAULT_CONTEXT_WINDOW * 0.15),
  context: Math.floor(DEFAULT_CONTEXT_WINDOW * 0.25),
  history: Math.floor(DEFAULT_CONTEXT_WINDOW * 0.50),
  skills: Math.floor(DEFAULT_CONTEXT_WINDOW * 0.10),
};

export function createBudget(contextWindow?: number): TokenBudget {
  const total = contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  return {
    total,
    system: Math.floor(total * 0.15),
    context: Math.floor(total * 0.25),
    history: Math.floor(total * 0.50),
    skills: Math.floor(total * 0.10),
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function countHistoryTokens(messages: z.infer<typeof Message>[]): number {
  let total = 0;
  for (const msg of messages) {
    if (msg.role !== "system" && msg.role !== "tool") {
      if (typeof msg.content === "string") {
        total += estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if ("text" in part && typeof part.text === "string") {
            total += estimateTokens(part.text);
          }
        }
      }
    }
  }
  return total;
}

function countSkillTokens(messages: z.infer<typeof Message>[]): number {
  let total = 0;
  for (const msg of messages) {
    if (msg.role === "tool" && msg.toolName === "loadSkill") {
      total += estimateTokens(msg.content);
    }
  }
  return total;
}

export function enforceBudget(
  messages: z.infer<typeof Message>[],
  instructions: string,
  budget?: TokenBudget,
): { messages: z.infer<typeof Message>[]; report: BudgetReport } {
  const b = budget ?? DEFAULT_BUDGET;
  const estimatedSystem = estimateTokens(instructions);
  const estimatedHistory = countHistoryTokens(messages);
  const estimatedSkills = countSkillTokens(messages);
  const estimatedTotal = estimatedSystem + estimatedHistory + estimatedSkills;
  let trimmedTurns = 0;
  let note = "";

  // Return a fresh array — convertFromMessages does `messages.length = 0; messages.push(...trimmed)`
  // to swap in the trimmed history. If we returned the same `messages` reference here, that swap
  // would empty the array while reading from it, yielding `[]` and an InvalidPromptError downstream.
  if (estimatedTotal <= b.total) {
    return {
      messages: [...messages],
      report: {
        totalBudget: b.total,
        estimatedTotal,
        estimatedSystem,
        estimatedHistory,
        estimatedContext: 0,
        estimatedSkills,
        trimmedTurns: 0,
        note: "Within budget",
      },
    };
  }

  const trimmed: z.infer<typeof Message>[] = [];
  let trimmedTokens = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isToolResult = msg.role === "tool";
    const isOldTurn =
      (msg.role === "user" || msg.role === "assistant") &&
      i < messages.length - 8;

    if (estimatedTotal - trimmedTokens <= b.total) {
      trimmed.push(...messages.slice(i));
      break;
    }

    if (isToolResult) {
      const tokens = estimateTokens(msg.content);
      trimmedTokens += tokens;
      trimmedTurns++;
      continue;
    }

    if (isOldTurn) {
      const tokens = estimateTokens(
        typeof msg.content === "string" ? msg.content : "",
      );
      trimmedTokens += tokens;
      trimmedTurns++;
      continue;
    }

    trimmed.push(msg);
  }

  const finalHistory = countHistoryTokens(trimmed);
  const finalSkills = countSkillTokens(trimmed);
  const finalTotal = estimatedSystem + finalHistory + finalSkills;

  note = `Budget enforced: removed ~${trimmedTurns} messages (old history and tool results)`;
  if (finalTotal > b.total) {
    note += `. WARNING: Still over budget (${finalTotal} / ${b.total}) — consider shorter conversation or smaller context window.`;
  }

  return {
    messages: trimmed,
    report: {
      totalBudget: b.total,
      estimatedTotal: finalTotal,
      estimatedSystem,
      estimatedHistory: finalHistory,
      estimatedContext: 0,
      estimatedSkills: finalSkills,
      trimmedTurns,
      note,
    },
  };
}
