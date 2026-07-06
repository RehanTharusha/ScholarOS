/** Adapted from nashsu/llm_wiki (GPL v3) — src/lib/graph-relevance.ts */

export interface RetrievalNode {
  id: string
  label: string
  type: string
  path: string
  linkCount: number
  community: number
  sources: readonly string[]
}

export interface RetrievalGraph {
  nodes: Map<string, RetrievalNode>
  edges: Map<string, number>
}

const TYPE_AFFINITY: Record<string, Record<string, number>> = {
  entity: { entity: 1.0, concept: 1.2, source: 0.4, query: 0.3, synthesis: 0.8 },
  concept: { entity: 1.2, concept: 1.0, source: 0.6, query: 0.4, synthesis: 1.0 },
  source: { entity: 0.4, concept: 0.6, source: 0.5, query: 0.2, synthesis: 0.5 },
  query: { entity: 0.3, concept: 0.4, source: 0.2, query: 0.3, synthesis: 0.4 },
  synthesis: { entity: 0.8, concept: 1.0, source: 0.5, query: 0.4, synthesis: 1.0 },
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}:::${b}` : `${b}:::${a}`
}

export function buildRetrievalGraph(
  nodes: { id: string; label: string; type: string; path: string; linkCount: number; community: number; sources?: string[] }[],
  edges?: { source: string; target: string; weight: number }[],
): RetrievalGraph {
  const graphNodes = new Map<string, RetrievalNode>()
  const edgeMap = new Map<string, number>()

  for (const n of nodes) {
    graphNodes.set(n.id, {
      id: n.id,
      label: n.label,
      type: n.type,
      path: n.path,
      linkCount: n.linkCount,
      community: n.community,
      sources: Object.freeze([...(n.sources ?? [])]),
    })
  }

  if (edges) {
    for (const e of edges) {
      const key = edgeKey(e.source, e.target)
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + e.weight)
    }
  }

  return { nodes: graphNodes, edges: edgeMap }
}

export function calculateRelevance(nodeA: RetrievalNode, nodeB: RetrievalNode, graph: RetrievalGraph): number {
  let score = 0

  const key = edgeKey(nodeA.id, nodeB.id)
  const directWeight = graph.edges.get(key) ?? 0
  score += directWeight * 3.0

  const sourceOverlap = nodeA.sources.filter((s) => nodeB.sources.includes(s)).length
  score += sourceOverlap * 4.0

  let adamicAdar = 0
  for (const [neighborId] of graph.nodes) {
    if (neighborId === nodeA.id || neighborId === nodeB.id) continue
    const aEdge = graph.edges.get(edgeKey(nodeA.id, neighborId))
    const bEdge = graph.edges.get(edgeKey(nodeB.id, neighborId))
    if (aEdge !== undefined && bEdge !== undefined) {
      const neighbor = graph.nodes.get(neighborId)
      if (neighbor && neighbor.linkCount > 1) {
        adamicAdar += 1 / Math.log(neighbor.linkCount)
      }
    }
  }
  score += adamicAdar * 1.5

  const typeA = nodeA.type || "other"
  const typeB = nodeB.type || "other"
  const affinityA = TYPE_AFFINITY[typeA]?.[typeB] ?? 0.5
  const affinityB = TYPE_AFFINITY[typeB]?.[typeA] ?? 0.5
  score += Math.max(affinityA, affinityB) * 1.0

  return Math.round(score * 100) / 100
}

export function getRelatedNodes(
  nodeId: string,
  graph: RetrievalGraph,
  limit: number = 10,
): { nodeId: string; score: number }[] {
  const node = graph.nodes.get(nodeId)
  if (!node) return []

  const scores: { nodeId: string; score: number }[] = []

  for (const [otherId, otherNode] of graph.nodes) {
    if (otherId === nodeId) continue
    const score = calculateRelevance(node, otherNode, graph)
    if (score > 0) {
      scores.push({ nodeId: otherId, score })
    }
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, limit)
}

export function edgeWeight(nodeA: RetrievalNode, nodeB: RetrievalNode, graph: RetrievalGraph): number {
  return calculateRelevance(nodeA, nodeB, graph)
}
