/** Adapted from nashsu/llm_wiki (GPL v3) — src/lib/wiki-graph.ts + src/lib/graph-relevance.ts */

import fsp from "fs/promises";
import path from "path";
import { WorkDir } from "../config/config.js";

// graphology uses CJS/ESM interop that conflicts with our tsc NodeNext module
// resolution, so we import it dynamically where needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGraph = any;

const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;

export interface WikiGraphNode {
  id: string
  label: string
  type: string
  path: string
  linkCount: number
  community: number
}

export interface WikiGraphEdge {
  source: string
  target: string
  weight: number
}

export interface CommunityInfo {
  id: number
  nodeCount: number
  cohesion: number
  topNodes: string[]
}

async function findMdFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...await findMdFiles(path.join(dir, entry.name)))
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.join(dir, entry.name))
    }
  }
  return files
}

function extractTitle(content: string, fileName: string): string {
  const frontmatterTitleMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)
  if (frontmatterTitleMatch) return frontmatterTitleMatch[1].trim()
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) return headingMatch[1].trim()
  return fileName.replace(/\.md$/, "").replace(/-/g, " ")
}

function extractType(content: string): string {
  const frontmatterTypeMatch = content.match(/^---\n[\s\S]*?^type:\s*["']?(.+?)["']?\s*$/m)
  if (frontmatterTypeMatch) return frontmatterTypeMatch[1].trim().toLowerCase()
  return "other"
}

function extractWikilinks(content: string): string[] {
  const links: string[] = []
  const regex = new RegExp(WIKILINK_REGEX.source, "g")
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

function fileNameToId(fileName: string): string {
  return fileName.replace(/\.md$/, "")
}

function resolveTarget(
  raw: string,
  nodeMap: Map<string, { id: string }>,
): string | null {
  if (nodeMap.has(raw)) return raw
  const normalized = raw.toLowerCase().replace(/\s+/g, "-")
  for (const id of nodeMap.keys()) {
    if (id.toLowerCase() === normalized) return id
    if (id.toLowerCase() === raw.toLowerCase()) return id
    if (id.toLowerCase().replace(/\s+/g, "-") === normalized) return id
  }
  return null
}

async function detectCommunities(
  nodes: { id: string; label: string; linkCount: number }[],
  edges: WikiGraphEdge[],
): Promise<{ assignments: Map<string, number>; communities: CommunityInfo[] }> {
  if (nodes.length === 0) {
    return { assignments: new Map(), communities: [] }
  }

  const graphMod = await import("graphology");
  const louvainMod = await import("graphology-communities-louvain");
  const GraphCtor: AnyGraph = (graphMod as AnyGraph).default || graphMod;
  const louvainFn: AnyGraph = (louvainMod as AnyGraph).default || louvainMod;

  const g: AnyGraph = new GraphCtor({ type: "undirected" })
  for (const node of nodes) {
    g.addNode(node.id)
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      const key = `${edge.source}->${edge.target}`
      if (!g.hasEdge(key) && !g.hasEdge(`${edge.target}->${edge.source}`)) {
        g.addEdgeWithKey(key, edge.source, edge.target, { weight: edge.weight })
      }
    }
  }

  const communityMap: Record<string, number> = louvainFn(g, { resolution: 1 })
  const assignments = new Map(Object.entries(communityMap).map(([k, v]) => [k, v as number]))

  const groups = new Map<number, string[]>()
  for (const [nodeId, commId] of assignments) {
    const list = groups.get(commId) ?? []
    list.push(nodeId)
    groups.set(commId, list)
  }

  const edgeSet = new Set<string>()
  for (const edge of edges) {
    edgeSet.add(`${edge.source}:::${edge.target}`)
    edgeSet.add(`${edge.target}:::${edge.source}`)
  }

  const nodeInfo = new Map(nodes.map((n) => [n.id, { label: n.label, linkCount: n.linkCount }]))

  const communities: CommunityInfo[] = []
  for (const [commId, memberIds] of groups) {
    const n = memberIds.length
    let intraEdges = 0
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        if (edgeSet.has(`${memberIds[i]}:::${memberIds[j]}`)) {
          intraEdges++
        }
      }
    }
    const possibleEdges = n > 1 ? (n * (n - 1)) / 2 : 1
    const cohesion = intraEdges / possibleEdges

    const sorted = [...memberIds].sort(
      (a, b) => (nodeInfo.get(b)?.linkCount ?? 0) - (nodeInfo.get(a)?.linkCount ?? 0),
    )
    const topNodes = sorted.slice(0, 5).map((id) => nodeInfo.get(id)?.label ?? id)

    communities.push({ id: commId, nodeCount: n, cohesion, topNodes })
  }

  communities.sort((a, b) => b.nodeCount - a.nodeCount)

  const idRemap = new Map<number, number>()
  communities.forEach((c, idx) => {
    idRemap.set(c.id, idx)
    c.id = idx
  })
  for (const [nodeId, oldId] of assignments) {
    assignments.set(nodeId, idRemap.get(oldId) ?? 0)
  }

  return { assignments, communities }
}

export async function buildWikiGraph(
  projectPath?: string,
): Promise<{ nodes: WikiGraphNode[]; edges: WikiGraphEdge[]; communities: CommunityInfo[] }> {
  const root = projectPath ? path.resolve(projectPath) : WorkDir

  let mdFiles: string[]
  try {
    mdFiles = await findMdFiles(root)
  } catch {
    return { nodes: [], edges: [], communities: [] }
  }

  mdFiles = mdFiles.filter((f) => !f.includes(`${path.sep}.scholarOS${path.sep}`))

  if (mdFiles.length === 0) {
    return { nodes: [], edges: [], communities: [] }
  }

  const nodeMap = new Map<
    string,
    { id: string; label: string; type: string; path: string; links: string[] }
  >()

  for (const filePath of mdFiles) {
    const id = fileNameToId(path.basename(filePath))
    let content = ""
    try {
      content = await fsp.readFile(filePath, "utf-8")
    } catch {
      continue
    }

    const existing = nodeMap.get(id)
    if (existing) {
      nodeMap.set(id, {
        ...existing,
        links: [...existing.links, ...extractWikilinks(content)],
      })
      continue
    }

    nodeMap.set(id, {
      id,
      label: extractTitle(content, path.basename(filePath)),
      type: extractType(content),
      path: filePath,
      links: extractWikilinks(content),
    })
  }

  const HIDDEN_TYPES = new Set(["query"])
  for (const [id, node] of nodeMap) {
    if (HIDDEN_TYPES.has(node.type)) {
      nodeMap.delete(id)
    }
  }

  const linkCounts = new Map<string, number>()
  for (const [id] of nodeMap) {
    linkCounts.set(id, 0)
  }

  const rawEdges: WikiGraphEdge[] = []

  for (const [sourceId, nodeData] of nodeMap) {
    for (const targetRaw of nodeData.links) {
      const targetId = resolveTarget(targetRaw, nodeMap)
      if (targetId === null) continue
      if (targetId === sourceId) continue

      rawEdges.push({ source: sourceId, target: targetId, weight: 1 })

      linkCounts.set(sourceId, (linkCounts.get(sourceId) ?? 0) + 1)
      linkCounts.set(targetId, (linkCounts.get(targetId) ?? 0) + 1)
    }
  }

  const seenEdges = new Set<string>()
  const dedupedEdges: { source: string; target: string }[] = []
  for (const edge of rawEdges) {
    const key = `${edge.source}:::${edge.target}`
    const reverseKey = `${edge.target}:::${edge.source}`
    if (!seenEdges.has(key) && !seenEdges.has(reverseKey)) {
      seenEdges.add(key)
      dedupedEdges.push(edge)
    }
  }

  const edges: WikiGraphEdge[] = dedupedEdges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: 1,
  }))

  const prelimNodes = Array.from(nodeMap.values()).map((n) => ({
    id: n.id,
    label: n.label,
    linkCount: linkCounts.get(n.id) ?? 0,
  }))

  const { assignments, communities } = await detectCommunities(prelimNodes, edges)

  const nodes: WikiGraphNode[] = Array.from(nodeMap.values()).map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    path: n.path,
    linkCount: linkCounts.get(n.id) ?? 0,
    community: assignments.get(n.id) ?? 0,
  }))

  return { nodes, edges, communities }
}
