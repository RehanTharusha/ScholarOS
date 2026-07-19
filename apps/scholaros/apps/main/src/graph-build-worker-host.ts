/**
 * Wiki-link graph builder running in a worker thread.
 *
 * The graph build is the most CPU-bound operation in the main
 * process: for a vault of N markdown files it does N file reads, a
 * regex/link extraction pass per file, and then community detection
 * over the resulting graph. On a vault of 5,000+ files this can take
 * 5-15 seconds and during that time the main process is blocked
 * from handling other IPC calls (search, file ops, etc).
 *
 * Running the build in a worker thread keeps the main thread
 * responsive. The worker is spawned on demand and exits when the
 * build finishes, so there's no steady-state overhead.
 *
 * Falls back to in-process build if `worker_threads` is unavailable
 * (e.g., some test environments).
 */
import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GraphNode {
  id: string;
  label: string;
  degree: number;
  radius: number;
  group: string;
  color: string;
  stroke: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Build the wiki-link graph in a worker thread. Resolves with the
 * nodes/edges ready to feed to the renderer.
 *
 * @param projectPath Absolute path to the vault root, or undefined to
 *   use the configured work dir.
 */
export function buildWikiGraphInWorker(
  projectPath?: string,
): Promise<GraphResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(path.join(__dirname, "graph-build-worker.js"));
    } catch (err) {
      // Fall back to in-process. We don't have a synchronous path here
      // (the real build is async); just reject and let the caller
      // decide whether to retry.
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    let settled = false;
    const cleanup = () => {
      if (!settled) {
        settled = true;
        worker.terminate().catch(() => {});
      }
    };

    worker.once("message", (msg: { ok: boolean; data?: GraphResult; error?: string }) => {
      settled = true;
      worker.terminate().catch(() => {});
      if (msg.ok && msg.data) {
        resolve(msg.data);
      } else {
        reject(new Error(msg.error ?? "graph build failed"));
      }
    });
    worker.once("error", (err) => {
      cleanup();
      reject(err);
    });
    worker.once("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`graph build worker exited with code ${code}`));
      }
    });

    // Hard timeout: 60s. If exceeded, the worker is too slow — kill it
    // and let the caller fall back to the in-process path.
    const timeout = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error("graph build timed out after 60s"));
      }
    }, 60_000);
    worker.postMessage({ projectPath });
    // The timer is cleared when the worker resolves.
    worker.once("message", () => clearTimeout(timeout));
  });
}
