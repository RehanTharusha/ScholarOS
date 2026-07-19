/**
 * Worker thread for the wiki-link graph build. Receives a
 * `{ projectPath }` message, runs `buildWikiGraph` from
 * `@scholaros/core`, transforms the result into the renderer's
 * graph format, and posts it back.
 */
import { parentPort } from "node:worker_threads";

if (!parentPort) {
  throw new Error("graph-build-worker must be run as a worker thread");
}

interface GraphResult {
  nodes: Array<{
    id: string;
    label: string;
    degree: number;
    radius: number;
    group: string;
    color: string;
    stroke: string;
  }>;
  edges: Array<{ source: string; target: string }>;
}

parentPort.on("message", async (msg: { projectPath?: string }) => {
  try {
    const { buildWikiGraph } = await import(
      "@scholaros/core/dist/knowledge/wiki-link-graph.js"
    );
    const raw = await buildWikiGraph(msg.projectPath);

    // The raw graph includes nodes/edges/communities. The renderer
    // graph-view.tsx currently transforms the data inline in App.tsx
    // (the buildGraph callback). We re-export a flatter shape here.
    const nodeMap = new Map<string, GraphResult["nodes"][number]>();
    for (const n of raw.nodes) {
      const degree = raw.edges.filter(
        (e) => e.source === n.path || e.target === n.path,
      ).length;
      nodeMap.set(n.path, {
        id: n.path,
        label: n.name,
        degree,
        radius: Math.max(8, Math.min(28, 8 + degree * 1.5)),
        group: "root",
        color: "#7c3aed",
        stroke: "#a78bfa",
      });
    }
    const edges: GraphResult["edges"] = raw.edges
      .map((e) => ({ source: e.source, target: e.target }))
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target));

    parentPort!.postMessage({ ok: true, data: { nodes: Array.from(nodeMap.values()), edges } });
  } catch (err) {
    parentPort!.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
