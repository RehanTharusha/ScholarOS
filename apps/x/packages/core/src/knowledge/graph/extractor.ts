import { generateText } from 'ai';
import { getDefaultModelAndProvider, resolveProviderConfig, getKgModel } from '../../models/defaults.js';
import { createProvider } from '../../models/models.js';
import type { Branch, ExtractedFact } from './types.js';

export async function extractFacts(summary: string): Promise<ExtractedFact[]> {
  try {
    if (!summary.trim()) return [];

    const modelName = await getKgModel();
    const defaults = await getDefaultModelAndProvider();
    const providerConfig = await resolveProviderConfig(defaults.provider);
    const provider = createProvider(providerConfig);
    const languageModel = provider.languageModel(modelName);

    const { text } = await generateText({
      model: languageModel,
      temperature: 0,
      system: `Extract factual statements about the user from conversation summaries.

You are given a summary of a conversation. Extract all factual observations and return them as a JSON array of objects with:
- "branch": one of "user", "directives", or "world"
- "fact": a concise, standalone statement

Classification rules:
- "user": Facts about the user's identity, habits, preferences, history, study patterns, academic context
- "directives": Standing instructions, style preferences, rules the user gave ("never use emojis", "keep it concise")
- "world": External facts discovered or discussed (not about the user, not instructions)

Never emit:
- Meta-narrative about the conversation itself
- Transient details like weather or time
- Assistant recommendations to the user
- Common knowledge the model already knows
- Offers to search or expressions of inability

Output ONLY valid JSON array. No markdown, no explanation.`,
      messages: [
        {
          role: 'user',
          content: `Extract facts from this conversation summary:\n\n${summary}`,
        },
      ],
    });

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: unknown): item is { branch: string; fact: string } =>
          item !== null && typeof item === 'object' && 'branch' in item && 'fact' in item,
      )
      .map((item) => ({
        branch: normalizeBranch(item.branch),
        fact: String(item.fact).trim(),
      }))
      .filter((item) => item.fact.length > 0);
  } catch (error) {
    console.error('[KnowledgeGraph] Extractor error:', error);
    return [];
  }
}

function normalizeBranch(input: string): Branch {
  const lower = input.toLowerCase().trim();
  if (lower === 'directives') return 'directives';
  if (lower === 'world') return 'world';
  return 'user';
}
