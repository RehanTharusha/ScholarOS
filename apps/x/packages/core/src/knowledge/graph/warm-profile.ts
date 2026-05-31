import { KnowledgeGraph } from './graph.js';
import type { WarmProfile, Branch } from './types.js';

const USER_CHAR_LIMIT = 1200;
const DIRECTIVES_CHAR_LIMIT = 600;
const TOP_FACTS_LIMIT = 30;

export function buildWarmProfile(graph: KnowledgeGraph): WarmProfile | null {
  const root = graph.getNode(graph.getRootId());
  if (!root) return null;

  const userRoot = graph.getBranchRoot('user');
  const directivesRoot = graph.getBranchRoot('directives');
  if (!userRoot && !directivesRoot) return null;

  const userFacts = collectBranchFacts(graph, 'user', USER_CHAR_LIMIT);
  const directivesFacts = collectBranchFacts(graph, 'directives', DIRECTIVES_CHAR_LIMIT);

  if (userFacts.length === 0 && directivesFacts.length === 0) return null;

  return {
    userFacts,
    directivesFacts,
    buildTime: new Date().toISOString(),
  };
}

function collectBranchFacts(
  graph: KnowledgeGraph,
  branch: Branch,
  charLimit: number,
): string[] {
  const branchRoot = graph.getBranchRoot(branch);
  if (!branchRoot) return [];

  const allNodes = graph.bfs(branchRoot.id);

  const scoredFacts: Array<{ fact: string; score: number }> = [];

  for (const node of allNodes) {
    if (node.id === branchRoot.id) continue;
    if (node.archived) continue;

    const score = graph.getAccessDecayScore(node.id);
    for (const fact of node.facts) {
      scoredFacts.push({ fact, score: score > 0 ? score : 0.1 });
    }
  }

  scoredFacts.sort((a, b) => b.score - a.score);

  const topFacts = scoredFacts.slice(0, TOP_FACTS_LIMIT);

  const result: string[] = [];
  let charCount = 0;

  for (const { fact } of topFacts) {
    if (charCount + fact.length > charLimit) break;
    result.push(fact);
    charCount += fact.length;
  }

  return result;
}

export function formatWarmProfileBlock(profile: WarmProfile): string {
  const parts: string[] = [];

  if (profile.userFacts.length > 0) {
    parts.push(`## INFORMATION THE USER HAS SHARED IN PRIOR CONVERSATIONS`);
    for (const fact of profile.userFacts) {
      parts.push(`- ${fact}`);
    }
  }

  if (profile.directivesFacts.length > 0) {
    parts.push(``);
    parts.push(`## STANDING INSTRUCTIONS FROM THE USER`);
    for (const fact of profile.directivesFacts) {
      parts.push(`- ${fact}`);
    }
  }

  return parts.join('\n');
}
