import { generateText } from 'ai';
import { getDefaultModelAndProvider, resolveProviderConfig, getKgModel } from '../../models/defaults.js';
import { createProvider } from '../../models/models.js';
import { KnowledgeGraph } from './graph.js';

const SPLIT_THRESHOLD = 1500;

export function shouldSplit(nodeFacts: string[]): boolean {
  const totalChars = nodeFacts.reduce((sum, f) => sum + f.length, 0);
  return totalChars > SPLIT_THRESHOLD;
}

export interface SplitProposal {
  categories: Array<{
    name: string;
    facts: string[];
  }>;
}

export async function proposeSplit(
  nodeId: string,
  nodeName: string,
  facts: string[],
): Promise<SplitProposal | null> {
  try {
    const modelName = await getKgModel();
    const defaults = await getDefaultModelAndProvider();
    const providerConfig = await resolveProviderConfig(defaults.provider);
    const provider = createProvider(providerConfig);
    const languageModel = provider.languageModel(modelName);

    const factsText = facts.map((f, i) => `${i}: ${f}`).join('\n');

    const { text } = await generateText({
      model: languageModel,
      temperature: 0.2,
      system: `You are a knowledge graph organizer. A node "${nodeName}" has grown too large and needs to be split into child categories.

Given the existing facts, propose 2-5 categories to split them into. Each fact should be assigned to exactly one category.

Consolidate near-duplicates and prune facts that are common knowledge the model already knows.

Return ONLY a JSON object:
{
  "categories": [
    { "name": "category name", "factIndices": [0, 2, 5] }
  ]
}

- "name": A short descriptive name for the category
- "factIndices": 0-based indices of facts that belong in this category
- Every fact must be assigned to exactly one category
- Minimum 2 categories, each must have at least one fact
- No explanation, no markdown`,
      messages: [
        {
          role: 'user',
          content: `Facts for "${nodeName}":\n${factsText}\n\nPropose categories to split these facts into.`,
        },
      ],
    });

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed: { categories?: unknown[] } = JSON.parse(cleaned);

    if (
      !parsed.categories ||
      !Array.isArray(parsed.categories) ||
      parsed.categories.length < 2
    ) {
      return null;
    }

    const assigned = new Set<number>();
    const categories: Array<{ name: string; facts: string[] }> = [];
    for (const cat of parsed.categories) {
      if (
        cat !== null &&
        typeof cat === 'object' &&
        'name' in cat &&
        'factIndices' in cat &&
        Array.isArray((cat as Record<string, unknown>).factIndices)
      ) {
        const catRecord = cat as Record<string, unknown>;
        const factIndices = (catRecord.factIndices as unknown[]).filter(
          (i): i is number => typeof i === 'number' && i >= 0 && i < facts.length && !assigned.has(i),
        );
        factIndices.forEach((i) => assigned.add(i));
        categories.push({
          name: String(catRecord.name).trim(),
          facts: factIndices.map((i) => facts[i]),
        });
      }
    }
    const finalCategories = categories.filter((cat) => cat.facts.length > 0);
    if (finalCategories.length < 2) return null;

    return { categories: finalCategories };
  } catch (error) {
    console.error('[KnowledgeGraph] Split error:', error);
    return null;
  }
}

export async function executeSplit(
  graph: KnowledgeGraph,
  nodeId: string,
): Promise<boolean> {
  const node = graph.getNode(nodeId);
  if (!node || node.facts.length === 0) return false;
  if (!shouldSplit(node.facts)) return false;

  const proposal = await proposeSplit(nodeId, node.name, node.facts);
  if (!proposal) return false;

  for (const category of proposal.categories) {
    const childId = graph.createNode(nodeId, category.name, node.branch ?? undefined);
    const child = graph.getNode(childId);
    if (child) {
      child.facts = category.facts;
      child.description = `${category.name} — auto-split from ${node.name}`;
    }
  }

  const categoryNames = proposal.categories.map((c) => c.name).join(', ');
  graph.updateNode(nodeId, {
    facts: [],
    description: `Auto-split into: ${categoryNames}`,
  });

  return true;
}
