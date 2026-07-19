"use client";

import { useEffect, useState } from "react";
import { Search, FileText, File as FileIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingCard } from "@/components/ui/loading-card";

interface ArtifactEntry {
  name: string;
  path: string;
  ext: string;
  mtimeMs: number;
  size: number;
  preview: string | null;
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

function extractHtmlPreview(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 200).trim() || "HTML document";
}

function extractPreview(data: string, ext: string): string | null {
  if (ext === ".html" || ext === ".htm") {
    return extractHtmlPreview(data);
  }
  if (ext === ".md") {
    const text = data
      .replace(/^---[\s\S]*?---\n?/, "")
      .replace(/#{1,6}\s*/g, "")
      .replace(/[`*~_[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 200).trim() || "Markdown document";
  }
  if (ext === ".txt" || ext === ".csv") {
    return data.slice(0, 200).trim();
  }
  if (ext === ".json") {
    try {
      return JSON.stringify(JSON.parse(data), null, 2).slice(0, 200).trim();
    } catch {
      return data.slice(0, 200).trim();
    }
  }
  return null;
}

export function ArtifactsView({
  onOpenArtifact,
}: {
  onOpenArtifact?: (path: string) => void;
}) {
  const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const entries = await window.ipc.invoke("workspace:readdir", {
          path: "artifacts",
          opts: { includeHidden: false, includeStats: true },
        });

        const fileEntries = entries.filter(
          (e: { kind: string }) => e.kind === "file",
        );

        const result: ArtifactEntry[] = [];
        for (const entry of fileEntries) {
          const ext = entry.name.includes(".")
            ? entry.name.substring(entry.name.lastIndexOf(".")).toLowerCase()
            : "";
          let preview: string | null = null;

          const textExtensions = new Set([
            ".html", ".htm", ".md", ".txt", ".csv", ".json", ".xml", ".svg", ".css", ".js",
          ]);

          if (textExtensions.has(ext)) {
            try {
              const fileResult = await window.ipc.invoke("workspace:readFile", {
                path: entry.path,
                encoding: "utf8",
              });
              preview = extractPreview(fileResult.data, ext);
            } catch {
              /* ignore read errors */
            }
          }

          result.push({
            name: entry.name,
            path: entry.path,
            ext,
            mtimeMs: entry.stat?.mtimeMs ?? 0,
            size: entry.stat?.size ?? 0,
            preview,
          });
        }

        result.sort((a, b) => b.mtimeMs - a.mtimeMs);

        if (mounted) {
          setArtifacts(result);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setArtifacts([]);
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = searchQuery
    ? artifacts.filter((a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : artifacts;

  const handleOpen = (path: string) => {
    onOpenArtifact?.(path);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-12 py-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif text-3xl text-foreground tracking-tight">
              Artifacts
            </h1>
            <button
              type="button"
              onClick={() => handleOpen("artifacts")}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <FileIcon className="size-4" />
              <span>New artifact</span>
            </button>
          </div>

          {/* Search */}
          {artifacts.length > 0 && (
            <div className="relative mb-8">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search artifacts..."
                className="w-full rounded-2xl border border-border bg-card py-3.5 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none ring-0 transition-shadow focus:border-border focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className="py-12">
              <LoadingCard rows={4} label="Loading artifacts" />
            </div>
          ) : filtered.length === 0 ? (
            searchQuery ? (
              <EmptyState
                icon={<Search className="size-5" />}
                title={`No artifacts match "${searchQuery}"`}
                description="Try a different search term."
              />
            ) : (
              <EmptyState
                icon={<FileText className="size-5" />}
                title="No artifacts yet"
                description="Generated documents and exports will appear here."
              />
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((artifact) => (
                <button
                  key={artifact.path}
                  type="button"
                  onClick={() => handleOpen(artifact.path)}
                  className="group flex flex-col rounded-2xl border border-border bg-card p-0 text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* Preview */}
                  <div className="flex-1 p-5 pb-4 min-h-[100px]">
                    {artifact.preview !== null ? (
                      <p className="text-sm text-muted-foreground/70 leading-relaxed line-clamp-5">
                        {artifact.preview}
                      </p>
                    ) : (
                      <div className="flex items-center gap-3 py-2">
                        <FileText className="size-8 text-muted-foreground/30 shrink-0" />
                        <span className="text-sm text-muted-foreground/50">
                          {artifact.ext ? artifact.ext.slice(1).toUpperCase() : "File"} document
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-border/50 mx-5" />

                  {/* Metadata */}
                  <div className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground/80 truncate">
                      {artifact.name}
                    </span>
                    <span className="text-xs text-muted-foreground/50 whitespace-nowrap shrink-0">
                      {formatTime(artifact.mtimeMs)}
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
