import fsp from 'fs/promises';
import path from 'path';
import { WorkDir } from '../../config/config.js';
import type { GraphNode, Branch, GraphStats, GraphQuery, GraphQueryResult } from './types.js';

const GRAPH_DIR = path.join(WorkDir, '.knowledge-graph');
const GRAPH_FILE = path.join(GRAPH_DIR, 'graph.json');

const ROOT_ID = 'root';
const BRANCH_IDS: Record<Branch, string> = {
  user: 'branch_user',
  directives: 'branch_directives',
  world: 'branch_world',
};

const DECAY_HALF_LIFE_DAYS = 14;
const ARCHIVE_DAYS = 90;

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      await fsp.mkdir(GRAPH_DIR, { recursive: true });
    } catch {
      // ignore
    }
    try {
      const raw = await fsp.readFile(GRAPH_FILE, 'utf-8');
      const data = JSON.parse(raw) as GraphNode[];
      for (const node of data) {
        this.nodes.set(node.id, node);
      }
    } catch {
      await this.seed();
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    const data = Array.from(this.nodes.values());
    await fsp.writeFile(GRAPH_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async seed(): Promise<void> {
    const now = new Date().toISOString();
    const root: GraphNode = {
      id: ROOT_ID,
      name: 'root',
      description: 'Root node of the knowledge graph',
      facts: [],
      parentId: null,
      branch: null,
      accessCount: 0,
      lastAccessed: now,
      createdAt: now,
      updatedAt: now,
      archived: false,
    };
    this.nodes.set(ROOT_ID, root);

    for (const [branch, id] of Object.entries(BRANCH_IDS)) {
      const labels: Record<string, string> = {
        user: 'User',
        directives: 'Directives',
        world: 'World',
      };
      this.nodes.set(id, {
        id,
        name: labels[branch] ?? branch,
        description: `Facts about the ${labels[branch]?.toLowerCase() ?? branch}`,
        facts: [],
        parentId: ROOT_ID,
        branch: branch as Branch,
        accessCount: 0,
        lastAccessed: now,
        createdAt: now,
        updatedAt: now,
        archived: false,
      });
    }

    await this.save();
  }

  ensureSeeded(): void {
    if (!this.nodes.has(ROOT_ID)) {
      const now = new Date().toISOString();
      this.nodes.set(ROOT_ID, {
        id: ROOT_ID,
        name: 'root',
        description: 'Root node of the knowledge graph',
        facts: [],
        parentId: null,
        branch: null,
        accessCount: 0,
        lastAccessed: now,
        createdAt: now,
        updatedAt: now,
        archived: false,
      });
    }
    for (const [branch, id] of Object.entries(BRANCH_IDS)) {
      if (!this.nodes.has(id)) {
        const labels: Record<string, string> = {
          user: 'User',
          directives: 'Directives',
          world: 'World',
        };
        const now = new Date().toISOString();
        this.nodes.set(id, {
          id,
          name: labels[branch] ?? branch,
          description: `Facts about the ${labels[branch]?.toLowerCase() ?? branch}`,
          facts: [],
          parentId: ROOT_ID,
          branch: branch as Branch,
          accessCount: 0,
          lastAccessed: now,
          createdAt: now,
          updatedAt: now,
          archived: false,
        });
      }
    }
  }

  getBranchRoot(branch: Branch): GraphNode | undefined {
    return this.nodes.get(BRANCH_IDS[branch]);
  }

  createNode(parentId: string | null, name: string, branch?: Branch): string {
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const parent = parentId ? this.nodes.get(parentId) : null;
    const resolvedBranch = branch ?? parent?.branch ?? null;
    this.nodes.set(id, {
      id,
      name,
      description: '',
      facts: [],
      parentId,
      branch: resolvedBranch,
      accessCount: 0,
      lastAccessed: now,
      createdAt: now,
      updatedAt: now,
      archived: false,
    });
    return id;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getChildren(parentId: string): GraphNode[] {
    return Array.from(this.nodes.values()).filter(
      (n) => n.parentId === parentId && !n.archived,
    );
  }

  getAllChildren(parentId: string): GraphNode[] {
    return Array.from(this.nodes.values()).filter(
      (n) => n.parentId === parentId,
    );
  }

  updateNode(id: string, updates: Partial<GraphNode>): void {
    const node = this.nodes.get(id);
    if (!node) return;
    Object.assign(node, updates, { updatedAt: new Date().toISOString() });
  }

  deleteNode(id: string): void {
    const children = this.getAllChildren(id);
    for (const child of children) {
      this.deleteNode(child.id);
    }
    this.nodes.delete(id);
  }

  appendFacts(id: string, facts: string[]): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.facts.push(...facts);
    node.updatedAt = new Date().toISOString();
    this.touch(id);
  }

  setFacts(id: string, facts: string[]): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.facts = facts;
    node.updatedAt = new Date().toISOString();
  }

  bfs(startId: string): GraphNode[] {
    const result: GraphNode[] = [];
    const queue = [startId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = this.nodes.get(id);
      if (!node) continue;
      result.push(node);
      for (const child of this.getChildren(id)) {
        queue.push(child.id);
      }
    }
    return result;
  }

  getPath(id: string): string[] {
    const pathNodes: string[] = [];
    let current = this.nodes.get(id) ?? null;
    while (current) {
      pathNodes.unshift(current.name);
      current = current.parentId ? this.nodes.get(current.parentId) ?? null : null;
    }
    return pathNodes;
  }

  getAncestorIds(id: string): string[] {
    const ids: string[] = [];
    let current = this.nodes.get(id) ?? null;
    while (current) {
      ids.unshift(current.id);
      current = current.parentId ? this.nodes.get(current.parentId) ?? null : null;
    }
    return ids;
  }

  touch(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.accessCount += 1;
    node.lastAccessed = new Date().toISOString();
  }

  private decayScore(node: GraphNode): number {
    if (node.id === ROOT_ID) return 0;
    const ageMs = Date.now() - new Date(node.lastAccessed).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return node.accessCount / (1 + ageDays / DECAY_HALF_LIFE_DAYS);
  }

  getTopNodes(count: number): GraphNode[] {
    return Array.from(this.nodes.values())
      .filter((n) => n.id !== ROOT_ID && !n.archived)
      .sort((a, b) => this.decayScore(b) - this.decayScore(a))
      .slice(0, count);
  }

  getRecentNodes(count: number): GraphNode[] {
    return Array.from(this.nodes.values())
      .filter((n) => n.id !== ROOT_ID && !n.archived)
      .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime())
      .slice(0, count);
  }

  getAccessDecayScore(id: string): number {
    const node = this.nodes.get(id);
    if (!node) return 0;
    return this.decayScore(node);
  }

  async archiveNodes(olderThanDays: number = ARCHIVE_DAYS): Promise<void> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const toArchive = Array.from(this.nodes.values()).filter((n) => {
      if (n.id === ROOT_ID || n.branch) return false;
      if (n.archived) return false;
      return new Date(n.lastAccessed).getTime() < cutoff;
    });
    if (toArchive.length === 0) return;

    const archiveDir = path.join(GRAPH_DIR, 'archive');
    await fsp.mkdir(archiveDir, { recursive: true });
    const archiveFile = path.join(archiveDir, `archive_${Date.now()}.json`);

    for (const node of toArchive) {
      node.archived = true;
    }
    await fsp.writeFile(archiveFile, JSON.stringify(toArchive, null, 2), 'utf-8');
    await this.save();
  }

  getStats(): GraphStats {
    const all = Array.from(this.nodes.values());
    const active = all.filter((n) => !n.archived);
    const totalFacts = active.reduce((sum, n) => sum + n.facts.length, 0);
    return {
      totalNodes: active.length,
      totalFacts,
      userBranchNodes: active.filter((n) => n.branch === 'user').length,
      directivesBranchNodes: active.filter((n) => n.branch === 'directives').length,
      worldBranchNodes: active.filter((n) => n.branch === 'world').length,
      lastRunTime: null,
      totalRunsProcessed: 0,
      archivedNodes: all.filter((n) => n.archived).length,
    };
  }

  query(opts: GraphQuery): GraphQueryResult[] {
    const query = opts.query.toLowerCase().trim();
    if (!query) return [];
    const limit = opts.limit ?? 10;
    const results: GraphQueryResult[] = [];

    for (const node of this.nodes.values()) {
      if (node.archived || node.id === ROOT_ID) continue;
      let score = 0;
      const nameLower = node.name.toLowerCase();
      const descLower = node.description.toLowerCase();
      const factMatches = node.facts.filter((f) =>
        f.toLowerCase().includes(query),
      );

      if (nameLower.includes(query)) score += 10;
      if (descLower.includes(query)) score += 5;
      score += factMatches.length * 3;

      if (score > 0) {
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          path: this.getPath(node.id),
          facts: factMatches.length > 0 ? factMatches : node.facts.slice(0, 3),
          score,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getRootId(): string {
    return ROOT_ID;
  }

  getRoots(): GraphNode[] {
    const root = this.nodes.get(ROOT_ID);
    if (!root) return [];
    return [root, ...this.getChildren(ROOT_ID)];
  }
}
