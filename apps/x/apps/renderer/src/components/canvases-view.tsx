"use client";

import { useEffect, useState } from "react";
import { Search, LayoutGrid, Trash2 } from "lucide-react";

interface CanvasEntry {
  name: string;
  path: string;
  mtimeMs: number;
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  const now = Date.now();
  const diffMs = Math.max(0, now - ms);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function CanvasesView({
  onOpenCanvas,
  onNewCanvas,
  onDeleteCanvas,
}: {
  onOpenCanvas?: (path: string) => void;
  onNewCanvas?: () => void;
  onDeleteCanvas?: (path: string) => void;
}) {
  const [canvases, setCanvases] = useState<CanvasEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        // Ensure canvases directory exists
        await window.ipc.invoke("workspace:mkdir", {
          path: "canvases",
          recursive: true,
        });

        const entries = await window.ipc.invoke("workspace:readdir", {
          path: "canvases",
          opts: { includeHidden: false, includeStats: true },
        });

        const fileEntries = entries.filter(
          (e: { kind: string }) => e.kind === "file",
        );

        const result: CanvasEntry[] = [];
        for (const entry of fileEntries) {
          if (!entry.name.endsWith(".canvas")) continue;
          result.push({
            name: entry.name.replace(/\.canvas$/, ""),
            path: entry.path,
            mtimeMs: entry.stat?.mtimeMs ?? 0,
          });
        }

        result.sort((a, b) => b.mtimeMs - a.mtimeMs);

        if (mounted) {
          setCanvases(result);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setCanvases([]);
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const filtered = searchQuery
    ? canvases.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : canvases;

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                onDeleteCanvas?.(contextMenu.path);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors text-left"
            >
              <Trash2 className="size-4 text-destructive" />
              <span>Delete</span>
            </button>
          </div>
        </>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-12 py-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif text-3xl text-foreground tracking-tight">
              Canvases
            </h1>
            <button
              type="button"
              onClick={onNewCanvas}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <LayoutGrid className="size-4" />
              <span>New canvas</span>
            </button>
          </div>

          {/* Search */}
          {canvases.length > 0 && (
            <div className="relative mb-8">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search canvases..."
                className="w-full rounded-2xl border border-border bg-card py-3.5 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none ring-0 transition-shadow focus:border-border focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground/60 text-sm">
              Loading canvases...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              {searchQuery ? (
                <>
                  <p className="text-muted-foreground/60 text-sm mb-1">
                    No canvases match "{searchQuery}"
                  </p>
                  <p className="text-muted-foreground/40 text-xs">
                    Try a different search term
                  </p>
                </>
              ) : (
                <>
                  <div className="size-12 rounded-2xl border border-dashed border-border flex items-center justify-center mb-4">
                    <LayoutGrid className="size-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-muted-foreground/60 text-sm mb-1">
                    No canvases yet
                  </p>
                  <p className="text-muted-foreground/40 text-xs">
                    Create a canvas to start visual note-taking
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((canvas) => (
                <button
                  key={canvas.path}
                  type="button"
                  onClick={() => onOpenCanvas?.(canvas.path)}
                  onContextMenu={(e) => handleContextMenu(e, canvas.path)}
                  className="group flex flex-col rounded-2xl border border-border bg-card p-0 text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* Preview */}
                  <div className="flex-1 p-5 pb-4 min-h-[100px] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                      <LayoutGrid className="size-10" />
                      <span className="text-xs text-muted-foreground/30">
                        Canvas
                      </span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-border/50 mx-5" />

                  {/* Metadata */}
                  <div className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground/80 truncate">
                      {canvas.name}
                    </span>
                    <span className="text-xs text-muted-foreground/50 whitespace-nowrap shrink-0">
                      {formatTime(canvas.mtimeMs)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
