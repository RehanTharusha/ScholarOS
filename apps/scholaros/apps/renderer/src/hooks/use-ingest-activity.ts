import { useEffect, useRef, useState } from "react";

type RunEventType = {
  runId: string;
  type: string;
  toolCallId?: string;
  toolName?: string;
  input?: string;
  result?: unknown;
  error?: string;
  reason?: string;
  query?: string;
};

export interface IngestFileActivity {
  id: string;
  fileName: string;
  status: "queued" | "parsing" | "classifying" | "writing" | "done" | "error";
  parserUsed?: string;
  pagesCreated: string[];
  error?: string;
}

export interface IngestActivitySnapshot {
  activities: IngestFileActivity[];
  phase: "idle" | "ingesting" | "paused" | "done";
  error?: string;
  pendingAskHuman?: { toolCallId: string; query: string };
}

type IngestState = {
  activities: Map<string, IngestFileActivity>;
  pendingParses: Map<string, string>;
  pendingWrites: Map<string, string>;
  currentPages: string[];
  hasError: boolean;
  errorMessage?: string;
  hasPaused: boolean;
  hasStopped: boolean;
  pendingAskHuman?: { toolCallId: string; query: string };
};

function freshState(): IngestState {
  return {
    activities: new Map(),
    pendingParses: new Map(),
    pendingWrites: new Map(),
    currentPages: [],
    hasError: false,
    hasPaused: false,
    hasStopped: false,
  };
}

function buildSnapshot(s: IngestState): IngestActivitySnapshot {
  const activities = Array.from(s.activities.values());
  let phase: "ingesting" | "paused" | "done" | "idle" = "ingesting";
  if (s.hasStopped || s.hasError) phase = "done";
  else if (s.hasPaused) phase = "paused";
  return { activities, phase, error: s.errorMessage, pendingAskHuman: s.pendingAskHuman };
}

function extractFileName(input: string): string | undefined {
  try {
    const parsed = JSON.parse(input);
    const raw = parsed.path || parsed.filepath || parsed.filePath;
    if (typeof raw === "string") {
      const segments = raw.replace(/\\/g, "/").split("/");
      return segments[segments.length - 1] || undefined;
    }
  } catch {
    /* not JSON */
  }
  return undefined;
}

function extractParserUsed(result: unknown): string | undefined {
  try {
    const r = result as Record<string, unknown>;
    const meta = r?.metadata as Record<string, unknown> | undefined;
    if (meta?.fallback) {
      return `via ${String(meta.fallback)}`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function extractWritePath(input: string): string | undefined {
  try {
    const parsed = JSON.parse(input);
    const p = parsed.path as string | undefined;
    if (p && p.includes("courses/") && p.endsWith(".md")) return p;
  } catch {
    /* ignore */
  }
  return undefined;
}

function extractFileNameFromResult(result: unknown): string | undefined {
  try {
    const r = result as Record<string, unknown>;
    const name = r?.fileName as string | undefined;
    if (name) return name;
  } catch {
    /* ignore */
  }
  return undefined;
}

function replayEvent(ev: RunEventType, s: IngestState, needsFlush: { v: boolean }): void {
  switch (ev.type) {
    case "tool-invocation": {
      if (ev.toolName === "parseFile" && ev.input) {
        const fileName = extractFileName(ev.input) || "unknown";
        const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const pages = s.currentPages.length > 0 ? s.currentPages.splice(0) : [];
        s.activities.set(id, {
          id,
          fileName,
          status: "parsing",
          pagesCreated: pages,
        });
        if (ev.toolCallId) {
          s.pendingParses.set(ev.toolCallId, id);
        }
        needsFlush.v = true;
      }

      if (ev.toolName === "classifyFiles") {
        for (const act of s.activities.values()) {
          if (act.status === "parsing" || act.status === "queued") {
            act.status = "classifying";
          }
        }
        needsFlush.v = true;
      }

      if (ev.toolName === "workspace-writeFile" && ev.input) {
        const pagePath = extractWritePath(ev.input);
        if (pagePath) {
          let target = Array.from(s.activities.values())
            .filter((a) => a.status !== "done" && a.status !== "error")
            .pop();
          if (!target) {
            target = Array.from(s.activities.values()).pop();
          }
          if (target && !target.pagesCreated.includes(pagePath)) {
            target.pagesCreated = [...target.pagesCreated, pagePath];
            target.status = "writing";
            needsFlush.v = true;
          }
          if (!target) {
            s.currentPages = [...s.currentPages, pagePath];
          }
          if (ev.toolCallId) {
            s.pendingWrites.set(ev.toolCallId, pagePath);
          }
        }
      }
      break;
    }

    case "tool-result": {
      if (ev.toolName === "parseFile") {
        const id = ev.toolCallId
          ? s.pendingParses.get(ev.toolCallId)
          : undefined;
        if (id) {
          const act = s.activities.get(id);
          if (act) {
            const parser = extractParserUsed(ev.result);
            if (parser) act.parserUsed = parser;
            act.status = "classifying";
            s.pendingParses.delete(ev.toolCallId!);
            needsFlush.v = true;
          }
        } else {
          const fileName = extractFileNameFromResult(ev.result);
          if (fileName) {
            for (const act of s.activities.values()) {
              if (act.fileName === fileName && act.status === "parsing") {
                const parser = extractParserUsed(ev.result);
                if (parser) act.parserUsed = parser;
                act.status = "classifying";
                needsFlush.v = true;
                break;
              }
            }
          }
        }
      }

      if (ev.toolName === "classifyFiles") {
        for (const act of s.activities.values()) {
          if (act.status === "classifying") {
            act.status = "writing";
          }
        }
        needsFlush.v = true;
      }

      if (ev.toolName === "workspace-writeFile") {
        const pagePath = ev.toolCallId
          ? s.pendingWrites.get(ev.toolCallId)
          : undefined;
        if (pagePath) {
          s.pendingWrites.delete(ev.toolCallId!);
          for (const act of s.activities.values()) {
            if (act.pagesCreated.includes(pagePath)) {
              act.status = "done";
              needsFlush.v = true;
              break;
            }
          }
        }
      }
      break;
    }

    case "ask-human-request":
      s.hasPaused = true;
      s.pendingAskHuman = {
        toolCallId: ev.toolCallId || "",
        query: (ev as Record<string, unknown>).query as string || "",
      };
      needsFlush.v = true;
      break;

    case "ask-human-response":
      s.hasPaused = false;
      s.pendingAskHuman = undefined;
      needsFlush.v = true;
      break;

    case "error": {
      s.hasError = true;
      s.errorMessage = ev.error || "Unknown error";
      for (const act of s.activities.values()) {
        if (act.status !== "done") {
          act.status = "error";
          act.error = s.errorMessage;
        }
      }
      needsFlush.v = true;
      break;
    }

    case "run-stopped":
      s.hasStopped = true;
      for (const act of s.activities.values()) {
        if (act.status !== "done" && act.status !== "error") {
          act.status = "done";
        }
      }
      needsFlush.v = true;
      break;
  }
}

export function useIngestActivity(
  activeRunId: string | undefined,
): IngestActivitySnapshot {
  const [snapshot, setSnapshot] = useState<IngestActivitySnapshot>({
    activities: [],
    phase: "idle",
  });

  const stateRef = useRef<IngestState>(freshState());
  const bufferRef = useRef<RunEventType[]>([]);
  const currentRunIdRef = useRef<string | undefined>(undefined);
  const BUFFER_LIMIT = 200;

  // Keep IPC listener alive permanently. Buffer unmatched events; replay
  // into the derivation when activeRunId becomes known.
  useEffect(() => {
    const cleanup = window.ipc.on("runs:events", (event: unknown) => {
      const ev = event as RunEventType;

      if (currentRunIdRef.current && ev.runId === currentRunIdRef.current) {
        const needsFlush = { v: false };
        replayEvent(ev, stateRef.current, needsFlush);
        if (needsFlush.v) {
          setSnapshot(buildSnapshot(stateRef.current));
        }
      } else if (currentRunIdRef.current) {
        // Only buffer if we have an active run; otherwise discard
        bufferRef.current.push(ev);
        if (bufferRef.current.length > BUFFER_LIMIT) {
          bufferRef.current = bufferRef.current.slice(-BUFFER_LIMIT);
        }
      }
    });

    return () => {
      cleanup();
    };
  }, []);

  // When activeRunId changes, replay buffered events for that run
  useEffect(() => {
    if (!activeRunId) {
      currentRunIdRef.current = undefined;
      return;
    }

    const s = freshState();
    stateRef.current = s;
    currentRunIdRef.current = activeRunId;

    // Replay buffer
    const needsFlush = { v: false };
    for (const ev of bufferRef.current) {
      if (ev.runId === activeRunId) {
        replayEvent(ev, s, needsFlush);
      }
    }
    bufferRef.current = [];

    setSnapshot(buildSnapshot(s));
  }, [activeRunId]);

  return snapshot;
}
