import fs from 'fs';
import path from 'path';
import { WorkDir } from '../../config/config.js';

const STATE_FILE = path.join(WorkDir, '.knowledge-graph', 'state.json');

export interface GraphState {
  processedRuns: Record<string, { processedAt: string }>;
  lastRunTime: string;
}

export function loadGraphState(): GraphState {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      console.error('[KnowledgeGraph] Error loading state, starting fresh');
    }
  }
  return {
    processedRuns: {},
    lastRunTime: new Date(0).toISOString(),
  };
}

export function saveGraphState(state: GraphState): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[KnowledgeGraph] Error saving state:', error);
  }
}

export function markRunProcessed(runId: string, state: GraphState): void {
  state.processedRuns[runId] = { processedAt: new Date().toISOString() };
  state.lastRunTime = new Date().toISOString();
}
