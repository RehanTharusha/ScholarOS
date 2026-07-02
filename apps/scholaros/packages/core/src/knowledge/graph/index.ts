export { KnowledgeGraph } from './graph.js';
export { KnowledgeGraphService } from './service.js';
export { buildWarmProfile, formatWarmProfileBlock } from './warm-profile.js';
export { shouldSummarizeRun, summarizeRun } from './summarizer.js';
export { extractFacts } from './extractor.js';
export { findPlacementNodes, findPlacementNode } from './traversal.js';
export { mergeFacts, dedupeExact } from './merge.js';
export { shouldSplit, proposeSplit, executeSplit } from './split.js';
export { loadGraphState, saveGraphState, markRunProcessed } from './state.js';
export type {
  GraphNode,
  Branch,
  MergeResult,
  WarmProfile,
  GraphStats,
  GraphQuery,
  GraphQueryResult,
  ExtractedFact,
} from './types.js';
