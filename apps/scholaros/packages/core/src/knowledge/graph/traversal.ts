import { generateText } from 'ai';
import { getDefaultModelAndProvider, resolveProviderConfig, getKgModel } from '../../models/defaults.js';
import { createProvider } from '../../models/models.js';
import { KnowledgeGraph } from './graph.js';
import type { Branch, ExtractedFact } from './types.js';

const MAX_DEPTH = 8;

function normalizeFact(fact: string): string {
  return fact
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordMatch(fact: string, nodeName: string, description: string): number {
  const f = normalizeFact(fact);
  const n = normalizeFact(nodeName);
  const d = normalizeFact(description);
  const fWords = new Set(f.split(/\s+/).filter((w) => w.length > 3));
  const nWords = new Set(n.split(/\s+/));
  const dWords = new Set(d.split(/\s+/));

  let score = 0;
  for (const word of fWords) {
    if (nWords.has(word)) score += 2;
    if (dWords.has(word)) score += 1;
  }
  return score;
}

export async function findPlacementNode(
  graph: KnowledgeGraph,
  branch: Branch,
  fact: string,
): Promise<string> {
  const branchRoot = graph.getBranchRoot(branch);
  if (!branchRoot) return graph.createNode(null, branch, branch);

  const keywordScore = keywordMatch(fact, branchRoot.name, branchRoot.description);
  if (keywordScore > 0) {
    const children = graph.getChildren(branchRoot.id);
    let bestChild = branchRoot.id;
    let bestScore = 0;
    for (const child of children) {
      const score = keywordMatch(fact, child.name, child.description);
      if (score > bestScore) {
        bestScore = score;
        bestChild = child.id;
      }
    }
    if (bestScore >= 3) {
      return bestChild;
    }
  }

  return llmPickPlacement(graph, branchRoot.id, fact, 0);
}

async function llmPickPlacement(
  graph: KnowledgeGraph,
  currentNodeId: string,
  fact: string,
  depth: number,
): Promise<string> {
  if (depth >= MAX_DEPTH) return currentNodeId;

  const children = graph.getChildren(currentNodeId);
  if (children.length === 0) return currentNodeId;

  try {
    const modelName = await getKgModel();
    const defaults = await getDefaultModelAndProvider();
    const providerConfig = await resolveProviderConfig(defaults.provider);
    const provider = createProvider(providerConfig);
    const languageModel = provider.languageModel(modelName);

    const childrenDesc = children
      .map((c, i) => `${i}: "${c.name}" — ${c.description || 'no description'}`)
      .join('\n');

    const { text } = await generateText({
      model: languageModel,
      temperature: 0,
      system: `You are a knowledge graph router. Given a fact and a list of child node descriptions, pick the best child to place this fact under.

Return ONLY a JSON object: { "choice": <index or -1> }
- Pick the index (0-based) of the best matching child
- Return -1 if none of the children fit and the fact should stay at the current level
- No explanation, no markdown`,
      messages: [
        {
          role: 'user',
          content: `Fact: "${fact}"\n\nChildren:\n${childrenDesc}\n\nWhich child index best fits this fact?`,
        },
      ],
    });

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const choice = typeof parsed.choice === 'number' ? parsed.choice : -1;

    if (choice >= 0 && choice < children.length) {
      return llmPickPlacement(graph, children[choice].id, fact, depth + 1);
    }
    return currentNodeId;
  } catch {
    return currentNodeId;
  }
}

export async function findPlacementNodes(
  graph: KnowledgeGraph,
  facts: ExtractedFact[],
): Promise<Map<string, ExtractedFact[]>> {
  const grouped = new Map<string, ExtractedFact[]>();

  for (const item of facts) {
    const nodeId = await findPlacementNode(graph, item.branch, item.fact);
    const existing = grouped.get(nodeId) ?? [];
    existing.push(item);
    grouped.set(nodeId, existing);
  }

  return grouped;
}
