import { KnowledgeGraph } from './graph.js';
import { loadGraphState, saveGraphState, markRunProcessed } from './state.js';
import type { GraphState } from './state.js';
import { summarizeRun, shouldSummarizeRun } from './summarizer.js';
import { extractFacts } from './extractor.js';
import { findPlacementNodes } from './traversal.js';
import { mergeFacts } from './merge.js';
import { executeSplit } from './split.js';
import type { ExtractedFact } from './types.js';
import { serviceLogger } from '../../services/service_logger.js';
import container from '../../di/container.js';
import type { IRunsRepo } from '../../runs/repo.js';

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RUNS_PER_CYCLE = 5;
const MAX_FACTS_PER_CYCLE = 10;

export class KnowledgeGraphService {
  private graph: KnowledgeGraph;
  private state: GraphState;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(graph: KnowledgeGraph) {
    this.graph = graph;
    this.state = loadGraphState();
  }

  async init(): Promise<void> {
    await this.graph.load();
    this.state = loadGraphState();
    this.intervalHandle = setInterval(() => {
      this.processNewRuns('timer').catch((err) =>
        console.error('[KnowledgeGraph] Timer processing error:', err),
      );
    }, SYNC_INTERVAL_MS);
    console.log('[KnowledgeGraph] Service initialized, interval set to', SYNC_INTERVAL_MS / 1000, 's');
  }

  async shutdown(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    try {
      await this.processNewRuns('timer');
    } catch (err) {
      console.error('[KnowledgeGraph] Shutdown processing error:', err);
    }
    await this.graph.save();
    console.log('[KnowledgeGraph] Service shut down');
  }

  async processNewRuns(trigger: 'timer' | 'shutdown' | 'manual' = 'timer'): Promise<void> {
    if (this.isProcessing) {
      console.log('[KnowledgeGraph] Already processing, skipping');
      return;
    }
    this.isProcessing = true;

    const ctx = await serviceLogger.startRun({
      service: 'knowledge_graph',
      message: 'Processing new runs for knowledge graph',
      trigger: trigger === 'shutdown' ? 'timer' : trigger,
    });

    try {
      const repo = container.resolve<IRunsRepo>('runsRepo');
      let cursor: string | undefined;
      const unprocessedRuns: Array<{ id: string }> = [];
      let hasMore = true;

      while (hasMore && unprocessedRuns.length < MAX_RUNS_PER_CYCLE) {
        const response = await repo.list(cursor);
        for (const run of response.runs) {
          if (unprocessedRuns.length >= MAX_RUNS_PER_CYCLE) break;
          if (!this.state.processedRuns[run.id]) {
            unprocessedRuns.push({ id: run.id });
          }
        }
        cursor = response.nextCursor;
        hasMore = !!response.nextCursor;
      }

      if (unprocessedRuns.length === 0) {
        await serviceLogger.log({
          type: 'run_complete',
          service: 'knowledge_graph',
          runId: ctx.runId,
          level: 'info',
          message: 'No new runs to process',
          durationMs: Date.now() - ctx.startedAt,
          outcome: 'idle',
        });
        return;
      }

      let totalFactsExtracted = 0;
      let totalRunsProcessed = 0;
      const allFacts: ExtractedFact[] = [];

      for (const runMeta of unprocessedRuns) {
        try {
          const run = await repo.fetch(runMeta.id);
          if (!shouldSummarizeRun(run.log)) {
            markRunProcessed(runMeta.id, this.state);
            continue;
          }

          await serviceLogger.log({
            type: 'progress',
            service: 'knowledge_graph',
            runId: ctx.runId,
            level: 'info',
            message: `Summarizing run ${runMeta.id}`,
            step: 'summarize',
            current: totalRunsProcessed + 1,
            total: unprocessedRuns.length,
          });

          const summary = await summarizeRun(run.log);
          if (!summary) {
            markRunProcessed(runMeta.id, this.state);
            continue;
          }

          const facts = await extractFacts(summary.summary);
          if (facts.length === 0) {
            markRunProcessed(runMeta.id, this.state);
            continue;
          }

          allFacts.push(...facts);
          totalFactsExtracted += facts.length;
          totalRunsProcessed++;
          markRunProcessed(runMeta.id, this.state);

          if (allFacts.length >= MAX_FACTS_PER_CYCLE) break;
        } catch (err) {
          console.error(`[KnowledgeGraph] Error processing run ${runMeta.id}:`, err);
          markRunProcessed(runMeta.id, this.state);
        }
      }

      if (allFacts.length > 0) {
        const factsToProcess = allFacts.slice(0, MAX_FACTS_PER_CYCLE);

        await serviceLogger.log({
          type: 'progress',
          service: 'knowledge_graph',
          runId: ctx.runId,
          level: 'info',
          message: `Placing ${factsToProcess.length} facts in graph`,
          step: 'traverse',
          current: factsToProcess.length,
          total: factsToProcess.length,
          details: { totalFacts: allFacts.length, processingFacts: factsToProcess.length },
        });

        const grouped = await findPlacementNodes(this.graph, factsToProcess);

        for (const [nodeId, nodeFacts] of grouped.entries()) {
          const node = this.graph.getNode(nodeId);
          if (!node) continue;

          const existingFacts = node.facts;
          const newFacts = nodeFacts.map((f) => f.fact);
          const mergeResult = await mergeFacts(existingFacts, newFacts);

          if (mergeResult.success) {
            const incorporated = mergeResult.incorporatedIndices;
            const toAdd = incorporated.map((i) => newFacts[i]).filter(Boolean);
            if (toAdd.length > 0) {
              this.graph.appendFacts(nodeId, toAdd);
            }
          } else {
            this.graph.appendFacts(nodeId, newFacts);
          }

          const reloaded = this.graph.getNode(nodeId);
          if (reloaded && reloaded.facts.length > 0) {
            await executeSplit(this.graph, nodeId);
          }
        }
      }

      saveGraphState(this.state);
      await this.graph.save();

      const summary: Record<string, string | number | boolean> = {
        runsProcessed: totalRunsProcessed,
        factsExtracted: totalFactsExtracted,
        totalFactsInGraph: this.graph.getStats().totalFacts,
      };

      await serviceLogger.log({
        type: 'run_complete',
        service: 'knowledge_graph',
        runId: ctx.runId,
        level: 'info',
        message: `Processed ${totalRunsProcessed} runs, extracted ${totalFactsExtracted} facts`,
        durationMs: Date.now() - ctx.startedAt,
        outcome: totalRunsProcessed > 0 ? 'ok' : 'skipped',
        summary,
      });
    } catch (error) {
      await serviceLogger.log({
        type: 'error',
        service: 'knowledge_graph',
        runId: ctx.runId,
        level: 'error',
        message: 'Error processing runs',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isProcessing = false;
    }
  }

  getGraph(): KnowledgeGraph {
    return this.graph;
  }

  async manualProcess(): Promise<{ runsProcessed: number; factsExtracted: number }> {
    const oldRunCount = Object.keys(this.state.processedRuns).length;
    await this.processNewRuns('manual');
    const newRunCount = Object.keys(this.state.processedRuns).length;
    return {
      runsProcessed: newRunCount - oldRunCount,
      factsExtracted: this.graph.getStats().totalFacts,
    };
  }
}
