import { generateText } from 'ai';
import { getDefaultModelAndProvider, resolveProviderConfig, getKgModel } from '../../models/defaults.js';
import { createProvider } from '../../models/models.js';
import type { MergeResult } from './types.js';

function normalizeFact(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeExact(existing: string[], newFacts: string[]): string[] {
  const existingNormalized = new Set(existing.map(normalizeFact));
  return newFacts.filter((f) => !existingNormalized.has(normalizeFact(f)));
}

export async function mergeFacts(
  existingFacts: string[],
  newFacts: string[],
): Promise<MergeResult> {
  const filtered = dedupeExact(existingFacts, newFacts);
  if (filtered.length === 0) {
    return { success: true, incorporatedIndices: [] };
  }

  try {
    const modelName = await getKgModel();
    const defaults = await getDefaultModelAndProvider();
    const providerConfig = await resolveProviderConfig(defaults.provider);
    const provider = createProvider(providerConfig);
    const languageModel = provider.languageModel(modelName);

    const existingText = existingFacts.map((f, i) => `${i}: ${f}`).join('\n');
    const newText = filtered.map((f, i) => `NEW${i}: ${f}`).join('\n');

    const { text } = await generateText({
      model: languageModel,
      temperature: 0.1,
      system: `You are a knowledge graph merge agent. Merge facts into an existing list applying these rules:

1. **Supersession** — if a new fact contradicts an existing one, the new one wins. Drop the old.
2. **Near-duplicate dedupe** — if a new fact says the same thing differently, keep the better phrasing.
3. **Consolidation** — merge repeated patterns ("ate sushi Mon, ate sushi Thu" → "regularly eats sushi").
4. **Independence** — uncontradicted facts coexist.
5. **Hallucination guard** — output must not have more lines than existing + new + 2.

Return ONLY a JSON object: { "merged": string[], "incorporated": number[] }
- "merged": the final list of facts after applying rules
- "incorporated": indices into the NEW facts array (0-based) that were incorporated

No explanation, no markdown.`,
      messages: [
        {
          role: 'user',
          content: `Existing facts:\n${existingText}\n\nNew facts:\n${newText}\n\nMerge the new facts into the existing list.`,
        },
      ],
    });

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed: { merged?: unknown[]; incorporated?: unknown[] } = JSON.parse(cleaned);

    if (parsed.merged && Array.isArray(parsed.incorporated)) {
      const maxLines = existingFacts.length + filtered.length + 2;
      if (parsed.merged.length <= maxLines) {
        return {
          success: true,
          incorporatedIndices: parsed.incorporated.map((i) => Number(i)),
        };
      }
    }

    return { success: true, incorporatedIndices: [] };
  } catch (error) {
    console.error('[KnowledgeGraph] Merge error, falling back to append:', error);
    return { success: true, incorporatedIndices: filtered.map((_, i) => i) };
  }
}
