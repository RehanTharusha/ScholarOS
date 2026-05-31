export type Branch = 'user' | 'directives' | 'world';

export interface ExtractedFact {
  branch: Branch;
  fact: string;
}

export interface GraphNode {
  id: string;
  name: string;
  description: string;
  facts: string[];
  parentId: string | null;
  branch: Branch | null;
  accessCount: number;
  lastAccessed: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface MergeResult {
  success: boolean;
  incorporatedIndices: number[];
}

export interface WarmProfile {
  userFacts: string[];
  directivesFacts: string[];
  buildTime: string;
}

export interface GraphStats {
  totalNodes: number;
  totalFacts: number;
  userBranchNodes: number;
  directivesBranchNodes: number;
  worldBranchNodes: number;
  lastRunTime: string | null;
  totalRunsProcessed: number;
  archivedNodes: number;
}

export interface GraphQuery {
  query: string;
  limit?: number;
}

export interface GraphQueryResult {
  nodeId: string;
  nodeName: string;
  path: string[];
  facts: string[];
  score: number;
}
