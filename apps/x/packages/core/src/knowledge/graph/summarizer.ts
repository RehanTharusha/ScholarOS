import { generateText } from 'ai';
import z from 'zod';
import { getDefaultModelAndProvider, resolveProviderConfig, getKgModel } from '../../models/defaults.js';
import { createProvider } from '../../models/models.js';
import { RunEvent } from '@scholaros/shared/dist/runs.js';

type RunEventType = z.infer<typeof RunEvent>;

interface MessageLike {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
}

interface MessageEventLike {
  type: 'message';
  message: MessageLike;
}

function isMessageEvent(event: RunEventType): event is RunEventType & MessageEventLike {
  return event.type === 'message' && 'message' in event;
}

function isUserMessage(msg: MessageLike): boolean {
  return msg.role === 'user';
}

function isAssistantMessage(msg: MessageLike): boolean {
  return msg.role === 'assistant';
}

const MIN_MESSAGE_COUNT = 2;

export interface SummarizerResult {
  summary: string;
  topics: string[];
}

interface ContentPart {
  type: string;
  text?: string;
}

function extractConversationText(events: RunEventType[]): string {
  const lines: string[] = [];
  for (const event of events) {
    if (!isMessageEvent(event)) continue;
    const msg = event.message;
    if (isUserMessage(msg)) {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content as ContentPart[]).filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ');
      lines.push(`User: ${text.slice(0, 1000)}`);
    } else if (isAssistantMessage(msg)) {
      const text = typeof msg.content === 'string'
        ? msg.content
        : '';
      if (text) {
        lines.push(`Assistant: ${text.slice(0, 500)}`);
      }
    }
  }
  return lines.join('\n');
}

export function shouldSummarizeRun(events: RunEventType[]): boolean {
  const userMessages = events.filter(
    (e) => isMessageEvent(e) && isUserMessage(e.message),
  );
  if (userMessages.length < MIN_MESSAGE_COUNT) return false;

  const hasMeaningfulContent = userMessages.some((e) => {
    if (!isMessageEvent(e)) return false;
    const text = typeof e.message.content === 'string'
      ? e.message.content
      : '';
    return text.trim().length > 20;
  });
  return hasMeaningfulContent;
}

export async function summarizeRun(events: RunEventType[]): Promise<SummarizerResult | null> {
  try {
    const conversationText = extractConversationText(events);
    if (!conversationText.trim()) return null;

    const modelName = await getKgModel();
    const defaults = await getDefaultModelAndProvider();
    const providerConfig = await resolveProviderConfig(defaults.provider);
    const provider = createProvider(providerConfig);
    const languageModel = provider.languageModel(modelName);

    const { text } = await generateText({
      model: languageModel,
      temperature: 0.3,
      system: `You are a conversation summarizer. Your job is to summarize what the USER talked about in a conversation with an AI assistant.

Output a JSON object with two fields:
- "summary": A concise summary (max 200 words) of what the user discussed. Focus on the user's questions, interests, study topics, preferences, and any personal information they shared.
- "topics": An array of 3-5 comma-separated topic keywords describing the conversation.

Rules:
1. Never narrate the assistant's actions, failures, or uncertainty — focus on the user
2. Preserve attribution for third-party claims ("the user said X about Y")
3. Keep unrelated topics in separate sentences
4. Output ONLY valid JSON, no markdown, no explanation`,
      messages: [
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${conversationText}`,
        },
      ],
    });

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary?.slice(0, 2000) ?? '',
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
    };
  } catch (error) {
    console.error('[KnowledgeGraph] Summarizer error:', error);
    return null;
  }
}
