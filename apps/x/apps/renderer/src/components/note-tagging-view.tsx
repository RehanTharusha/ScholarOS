import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AcademicPageShell,
  AcademicPageHeader,
  AcademicMetricCard,
  AcademicEmptyState,
} from "@/components/academic/academic-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Tags,
  Hash,
  BookOpen,
  Search,
  Sparkles,
  LoaderIcon,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { splitFrontmatter, extractAllFrontmatterValues } from "@/lib/frontmatter";

type NoteEntry = {
  path: string;
  name: string;
  tags: string[];
  noteType: string;
};

type NoteTypeFilter = string | "all";
type StatusFilter = "all" | "tagged" | "untagged";

const NOTE_TYPES = [
  "concept",
  "lecture-notes",
  "assignment",
  "paper-summary",
  "synthesis",
  "resource",
];

function getBasename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1] || "";
  return last.replace(/\.md$/i, "");
}

export function NoteTaggingView() {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagging, setTagging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const entries: NoteEntry[] = [];
      const seen = new Set<string>();

      async function walkDir(dirPath: string) {
        const { entries: dirEntries } = await window.ipc.invoke("workspace:readdir", {
          path: dirPath,
        });
        for (const entry of dirEntries) {
          const fullPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
          if (entry.kind === "dir") {
            await walkDir(fullPath);
          } else if (entry.kind === "file" && entry.name.endsWith(".md")) {
            if (seen.has(fullPath)) continue;
            seen.add(fullPath);
            try {
              const { data: content } = await window.ipc.invoke("workspace:readFile", {
                path: fullPath,
                encoding: "utf8",
              });
              const { raw } = splitFrontmatter(content);
              const frontmatter = extractAllFrontmatterValues(raw);
              const tags: string[] = [];
              if (Array.isArray(frontmatter.tags)) {
                tags.push(...frontmatter.tags);
              } else if (typeof frontmatter.tags === "string") {
                tags.push(frontmatter.tags);
              }
              const noteType =
                (typeof frontmatter.academic_note_type === "string"
                  ? frontmatter.academic_note_type
                  : "") || "unknown";
              entries.push({
                path: fullPath,
                name: getBasename(fullPath),
                tags,
                noteType,
              });
            } catch {
              // skip unreadable files
            }
          }
        }
      }

      await walkDir("knowledge");
      setNotes(entries);
    } catch (err) {
      console.error("[NoteTaggingView] Failed to load notes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleTagNow = useCallback(async () => {
    setTagging(true);
    try {
      await window.ipc.invoke("note-tagging:trigger", null);
      await loadNotes();
    } catch (err) {
      console.error("[NoteTaggingView] Tagging failed:", err);
    } finally {
      setTagging(false);
    }
  }, [loadNotes]);

  const filteredNotes = useMemo(() => {
    let result = notes;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.path.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (noteTypeFilter !== "all") {
      result = result.filter((n) => n.noteType === noteTypeFilter);
    }

    if (statusFilter === "tagged") {
      result = result.filter((n) => n.tags.length > 0);
    } else if (statusFilter === "untagged") {
      result = result.filter((n) => n.tags.length === 0);
    }

    return result;
  }, [notes, searchQuery, noteTypeFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = notes.length;
    const tagged = notes.filter((n) => n.tags.length > 0).length;
    const untagged = total - tagged;
    const uniqueTypes = new Set(notes.map((n) => n.noteType));
    return { total, tagged, untagged, types: uniqueTypes.size };
  }, [notes]);

  if (loading) {
    return (
      <AcademicPageShell>
        <AcademicPageHeader
          eyebrow="Knowledge"
          title="Note Tagging"
          description="Browse and manage tags across your knowledge base"
        />
        <div className="flex flex-1 items-center justify-center">
          <AcademicEmptyState
            title="Loading notes..."
            description="Reading your knowledge base."
          />
        </div>
      </AcademicPageShell>
    );
  }

  return (
    <AcademicPageShell>
      <AcademicPageHeader
        eyebrow="Knowledge"
        title="Note Tagging"
        description="Browse and manage tags across your knowledge base"
        actions={
          <Button
            variant="default"
            size="sm"
            onClick={handleTagNow}
            disabled={tagging}
          >
            {tagging ? (
              <LoaderIcon className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 size-4" />
            )}
            {tagging ? "Tagging..." : "Tag Now"}
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 pt-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <AcademicMetricCard
            label="Total Notes"
            value={stats.total}
            icon={FileText}
          />
          <AcademicMetricCard
            label="Tagged"
            value={stats.tagged}
            icon={Tags}
          />
          <AcademicMetricCard
            label="Untagged"
            value={stats.untagged}
            icon={Hash}
          />
          <AcademicMetricCard
            label="Note Types"
            value={stats.types}
            icon={BookOpen}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter by name, path, or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <select
            value={noteTypeFilter}
            onChange={(e) => setNoteTypeFilter(e.target.value as NoteTypeFilter)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="all">All Types</option>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="all">All Status</option>
            <option value="tagged">Tagged</option>
            <option value="untagged">Untagged</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["all", "tagged", "untagged"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {s === "all" ? "All" : s === "tagged" ? "Tagged" : "Untagged"}
            </button>
          ))}
          {NOTE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                setNoteTypeFilter(noteTypeFilter === t ? "all" : t)
              }
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                noteTypeFilter === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {filteredNotes.length === 0 ? (
          <AcademicEmptyState
            title="No notes found"
            description={
              searchQuery || noteTypeFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters."
                : "No markdown notes in your knowledge base yet."
            }
            action={
              <Button variant="outline" size="sm" onClick={loadNotes}>
                <FolderOpen className="mr-1.5 size-4" />
                Refresh
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Note</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {filteredNotes.map((note) => (
                  <tr
                    key={note.path}
                    className="border-b border-border/50 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {note.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {note.path}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {note.noteType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {note.tags.length > 0 ? (
                          note.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="cursor-pointer text-xs"
                              onClick={() => setSearchQuery(tag)}
                            >
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            No tags
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AcademicPageShell>
  );
}
