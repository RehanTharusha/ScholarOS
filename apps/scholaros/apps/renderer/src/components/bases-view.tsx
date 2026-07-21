import * as React from "react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  Save,
  Copy,
  Pencil,
  Trash2,
  FileText,
  FileIcon,
  Image,
  Music,
  Video,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  splitFrontmatter,
  extractAllFrontmatterValues,
} from "@/lib/frontmatter";
import { useDebounce } from "@/hooks/use-debounce";
import { EmptyState } from "@/components/ui/empty-state";
import { Table2 } from "lucide-react";

interface TreeNode {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: TreeNode[];
  stat?: { size: number; mtimeMs: number };
}

const AUDIO_EXTS = new Set([".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);
const DOC_EXTS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".csv"]);
const CODE_EXTS = new Set([".js", ".ts", ".py", ".java", ".cpp", ".rs", ".go", ".rb", ".css", ".json", ".xml"]);

type FileCategory = "md" | "pdf" | "html" | "code" | "image" | "audio" | "video" | "document" | "other";

function getFileCategory(ext: string): FileCategory {
  if (ext === ".md") return "md";
  if (ext === ".pdf") return "pdf";
  if (ext === ".html" || ext === ".htm") return "html";
  if (CODE_EXTS.has(ext)) return "code";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (DOC_EXTS.has(ext)) return "document";
  return "other";
}

function getFileIcon(cat: FileCategory) {
  switch (cat) {
    case "md": return BookOpen;
    case "pdf": return FileText;
    case "html": return FileText;
    case "code": return FileIcon;
    case "image": return Image;
    case "audio": return Music;
    case "video": return Video;
    case "document": return FileText;
    case "other": return FileIcon;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

type FileEntry = {
  path: string;
  name: string;
  ext: string;
  folder: string;
  rootFolder: string;
  fields: Record<string, string | string[]>;
  size: number;
  mtimeMs: number;
};

type SortDir = "asc" | "desc";
type ActiveFilter = { category: string; value: string };

export type BaseConfig = {
  name: string;
  visibleColumns: string[];
  columnWidths: Record<string, number>;
  sort: { field: string; dir: SortDir };
  filters: ActiveFilter[];
};

export const DEFAULT_BASE_CONFIG: BaseConfig = {
  name: "All Files",
  visibleColumns: ["name", "ext", "folder", "size", "mtimeMs"],
  columnWidths: {},
  sort: { field: "mtimeMs", dir: "desc" },
  filters: [],
};

const PAGE_SIZE = 25;

/** Built-in columns that don't come from frontmatter */
const BUILTIN_COLUMNS = ["name", "ext", "folder", "size", "mtimeMs"] as const;
type BuiltinColumn = (typeof BUILTIN_COLUMNS)[number];

const BUILTIN_LABELS: Record<BuiltinColumn, string> = {
  name: "Name",
  ext: "Type",
  folder: "Folder",
  size: "Size",
  mtimeMs: "Last Modified",
};

/** Default pixel widths for columns */
const DEFAULT_WIDTHS: Record<string, number> = {
  name: 240,
  ext: 70,
  folder: 160,
  size: 90,
  mtimeMs: 140,
};
const DEFAULT_FRONTMATTER_WIDTH = 150;

/** Convert key to title case: `first_met` → `First Met` */
function toTitleCase(key: string): string {
  if (key in BUILTIN_LABELS) return BUILTIN_LABELS[key as BuiltinColumn];
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type BasesViewProps = {
  tree: TreeNode[];
  onSelectNote: (path: string) => void;
  config: BaseConfig;
  onConfigChange: (config: BaseConfig) => void;
  isDefaultBase: boolean;
  onSave: (name: string | null) => void;
  /** Search query set externally (e.g. by app-navigation tool). */
  externalSearch?: string;
  /** Called after the external search has been consumed (applied to internal state). */
  onExternalSearchConsumed?: () => void;
  /** Actions for context menu */
  actions?: {
    rename: (oldPath: string, newName: string, isDir: boolean) => Promise<void>;
    remove: (path: string) => Promise<void>;
    copyPath: (path: string) => void;
  };
};

function collectFiles(
  nodes: TreeNode[],
): { path: string; name: string; ext: string; mtimeMs: number; size: number }[] {
  return nodes.flatMap((n) =>
    n.kind === "file"
      ? [
          {
            path: n.path,
            name: n.name.replace(/\.[^.]+$/, ""),
            ext: (n.name.match(/\.[^.]+$/) || [""])[0].toLowerCase(),
            mtimeMs: n.stat?.mtimeMs ?? 0,
            size: n.stat?.size ?? 0,
          },
        ]
      : n.children
        ? collectFiles(n.children)
        : [],
  );
}

function getFolderPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function getRootFolder(path: string): string {
  const parts = path.split("/");
  return parts[0] ?? "";
}

function formatDate(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function filtersEqual(a: ActiveFilter, b: ActiveFilter): boolean {
  return a.category === b.category && a.value === b.value;
}

function hasFilter(filters: ActiveFilter[], f: ActiveFilter): boolean {
  return filters.some((x) => filtersEqual(x, f));
}

/** Get the string values for a column from a file entry */
function getColumnValues(note: FileEntry, column: string): string[] {
  if (column === "name") return [note.name];
  if (column === "ext") return [note.ext];
  if (column === "folder") return [note.folder];
  if (column === "size") return [];
  if (column === "mtimeMs") return [];
  const v = note.fields[column];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Get a single sortable string for a column */
function getSortValue(note: FileEntry, column: string): string | number {
  if (column === "name") return note.name;
  if (column === "ext") return note.ext;
  if (column === "folder") return note.folder;
  if (column === "size") return note.size;
  if (column === "mtimeMs") return note.mtimeMs;
  const v = note.fields[column];
  if (!v) return "";
  const s = Array.isArray(v) ? (v[0] ?? "") : v;
  const ms = Date.parse(s);
  return isNaN(ms) ? s : ms;
}

export function BasesView({
  tree,
  onSelectNote,
  config,
  onConfigChange,
  isDefaultBase,
  onSave,
  externalSearch,
  onExternalSearchConsumed,
  actions,
}: BasesViewProps) {
  // Build file entries instantly from tree
  const files = useMemo<FileEntry[]>(() => {
    return collectFiles(tree).map((f) => ({
      path: f.path,
      name: f.name,
      ext: f.ext,
      folder: getFolderPath(f.path),
      rootFolder: getRootFolder(f.path),
      fields: {},
      size: f.size,
      mtimeMs: f.mtimeMs,
    }));
  }, [tree]);

  // Frontmatter fields loaded async, keyed by path (MD files only)
  const [fieldsByPath, setFieldsByPath] = useState<
    Map<string, Record<string, string | string[]>>
  >(new Map());
  const loadGenRef = useRef(0);

  // Load frontmatter in background batches
  useEffect(() => {
    const gen = ++loadGenRef.current;
    let cancelled = false;
    const mdFiles = files.filter((f) => f.ext === ".md");

    async function load() {
      const BATCH = 30;
      for (let i = 0; i < mdFiles.length; i += BATCH) {
        if (cancelled) return;
        const batch = mdFiles.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(async (f) => {
            try {
              const result = await window.ipc.invoke("workspace:readFile", {
                path: f.path,
                encoding: "utf8",
              });
              const { raw } = splitFrontmatter(result.data);
              return { path: f.path, fields: extractAllFrontmatterValues(raw) };
            } catch {
              return {
                path: f.path,
                fields: {} as Record<string, string | string[]>,
              };
            }
          }),
        );
        if (cancelled || gen !== loadGenRef.current) return;
        setFieldsByPath((prev) => {
          const next = new Map(prev);
          for (const r of results) next.set(r.path, r.fields);
          return next;
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [files]);

  // Merge tree-derived files with async-loaded fields
  const enrichedFiles = useMemo<FileEntry[]>(() => {
    if (fieldsByPath.size === 0) return files;
    return files.map((n) => {
      const f = fieldsByPath.get(n.path);
      return f ? { ...n, fields: f } : n;
    });
  }, [files, fieldsByPath]);

  const [activeTypeFilter, setActiveTypeFilter] = useState<FileCategory | "all">("md");

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const file of enrichedFiles) {
      const cat = getFileCategory(file.ext);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [enrichedFiles]);

  const rootFolders = useMemo(() => {
    const set = new Set<string>();
    for (const file of enrichedFiles) {
      if (file.rootFolder) set.add(file.rootFolder);
    }
    return Array.from(set).sort();
  }, [enrichedFiles]);

  const FILTER_CATEGORIES: { key: FileCategory | "all"; label: string }[] = useMemo(() => {
    const cats: { key: FileCategory | "all"; label: string }[] = [{ key: "all", label: "All" }];
    const order: [FileCategory, string][] = [
      ["md", "MD"],
      ["pdf", "PDF"],
      ["html", "HTML"],
      ["code", "Code"],
      ["image", "Image"],
      ["document", "Document"],
      ["audio", "Audio"],
      ["video", "Video"],
    ];
    for (const [cat, label] of order) {
      if ((typeCounts[cat] ?? 0) > 0) {
        cats.push({ key: cat, label });
      }
    }
    const otherCount = typeCounts["other"] ?? 0;
    if (otherCount > 0) {
      cats.push({ key: "other", label: "Other" });
    }
    return cats;
  }, [typeCounts]);

  const visibleColumns = config.visibleColumns;
  const columnWidths = config.columnWidths;
  const filters = config.filters;
  const sortField = config.sort.field;
  const sortDir = config.sort.dir;
  const [page, setPage] = useState(0);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);

  const handleSaveClick = useCallback(() => {
    if (isDefaultBase) {
      setSaveName("");
      setSaveDialogOpen(true);
    } else {
      onSave(null);
    }
  }, [isDefaultBase, onSave]);

  const handleSaveConfirm = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    setSaveDialogOpen(false);
    onSave(name);
  }, [saveName, onSave]);

  const getColWidth = useCallback(
    (col: string) => {
      return (
        columnWidths[col] ?? DEFAULT_WIDTHS[col] ?? DEFAULT_FRONTMATTER_WIDTH
      );
    },
    [columnWidths],
  );

  // Column resize via drag
  const resizingRef = useRef<{
    col: string;
    startX: number;
    startW: number;
  } | null>(null);

  const configRef = useRef(config);
  configRef.current = config;

  const onResizeStart = useCallback(
    (col: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW =
        configRef.current.columnWidths[col] ??
        DEFAULT_WIDTHS[col] ??
        DEFAULT_FRONTMATTER_WIDTH;
      resizingRef.current = { col, startX, startW };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = ev.clientX - resizingRef.current.startX;
        const newW = Math.max(60, resizingRef.current.startW + delta);
        const c = configRef.current;
        const updated = {
          ...c,
          columnWidths: { ...c.columnWidths, [resizingRef.current!.col]: newW },
        };
        onConfigChange(updated);
      };

      const onMouseUp = () => {
        resizingRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [onConfigChange],
  );

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Apply external search from app-navigation tool
  useEffect(() => {
    if (externalSearch !== undefined) {
      setSearchQuery(externalSearch);
      onExternalSearchConsumed?.();
    }
  }, [externalSearch, onExternalSearchConsumed]);
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [searchMatchPaths, setSearchMatchPaths] = useState<Set<string> | null>(
    null,
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchMatchPaths(null);
      return;
    }
    let cancelled = false;
    window.ipc
      .invoke("search:query", {
        query: debouncedSearch,
        limit: 200,
        types: ["knowledge"],
      })
      .then((res: { results: { path: string }[] }) => {
        if (!cancelled) {
          setSearchMatchPaths(new Set(res.results.map((r) => r.path)));
        }
      })
      .catch(() => {
        if (!cancelled) setSearchMatchPaths(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  // Reset page when filters or search change
  useEffect(() => {
    setPage(0);
  }, [filters, searchMatchPaths]);

  // Filter (search + type pill + badge filters)
  const filteredFiles = useMemo(() => {
    let result = enrichedFiles;
    // Apply type pill filter
    if (activeTypeFilter !== "all") {
      result = result.filter((file) => getFileCategory(file.ext) === activeTypeFilter);
    }
    // Apply search filter
    if (searchMatchPaths) {
      result = result.filter((file) => searchMatchPaths.has(file.path));
    }
    // Apply badge filters
    if (filters.length > 0) {
      const byCategory = new Map<string, string[]>();
      for (const f of filters) {
        const vals = byCategory.get(f.category) ?? [];
        vals.push(f.value);
        byCategory.set(f.category, vals);
      }
      result = result.filter((file) => {
        for (const [category, requiredValues] of byCategory) {
          if (category === "folder") {
            const folderMatches = requiredValues.some((value) => {
              const normalizedValue = value.replace(/\/+$/, "");
              return (
                file.folder === normalizedValue ||
                file.folder.startsWith(`${normalizedValue}/`) ||
                file.path.startsWith(`${normalizedValue}/`)
              );
            });
            if (!folderMatches) return false;
            continue;
          }
          const fileValues = getColumnValues(file, category);
          if (!requiredValues.some((v) => fileValues.includes(v))) return false;
        }
        return true;
      });
    }
    return result;
  }, [enrichedFiles, activeTypeFilter, filters, searchMatchPaths]);

  // Sort
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      const va = getSortValue(a, sortField);
      const vb = getSortValue(b, sortField);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredFiles, sortField, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedFiles.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageFiles = useMemo(
    () =>
      sortedFiles.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE),
    [sortedFiles, clampedPage],
  );

  const toggleFilter = useCallback(
    (category: string, value: string) => {
      const c = configRef.current;
      const f: ActiveFilter = { category, value };
      const next = hasFilter(c.filters, f)
        ? c.filters.filter((x) => !filtersEqual(x, f))
        : [...c.filters, f];
      onConfigChange({ ...c, filters: next });
    },
    [onConfigChange],
  );

  const clearFilters = useCallback(() => {
    onConfigChange({ ...configRef.current, filters: [] });
  }, [onConfigChange]);

  const handleSort = useCallback(
    (field: string) => {
      const c = configRef.current;
      if (field === c.sort.field) {
        onConfigChange({
          ...c,
          sort: { field, dir: c.sort.dir === "asc" ? "desc" : "asc" },
        });
      } else {
        onConfigChange({
          ...c,
          sort: { field, dir: field === "mtimeMs" ? "desc" : "asc" },
        });
      }
    },
    [onConfigChange],
  );

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="size-3 inline ml-1" />
    ) : (
      <ArrowDown className="size-3 inline ml-1" />
    );
  };

  const SORT_OPTIONS: { field: string; label: string; defaultDir: SortDir }[] = [
    { field: "name", label: "Name", defaultDir: "asc" },
    { field: "mtimeMs", label: "Modified", defaultDir: "desc" },
    { field: "ext", label: "Type", defaultDir: "asc" },
    { field: "size", label: "Size", defaultDir: "desc" },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border px-4 py-2 space-y-2">
        {/* Row 1: Search + Save */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            {searchQuery && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {searchMatchPaths ? `${searchMatchPaths.size} matches` : "..."}
              </span>
            )}
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setSearchMatchPaths(null); }}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <button
            onClick={handleSaveClick}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            <Save className="size-3.5" />
            {isDefaultBase ? "Save As" : "Save"}
          </button>
        </div>

        {/* Row 2: Type pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_CATEGORIES.map(({ key, label }) => {
            const count = key === "all"
              ? Object.values(typeCounts).reduce((a, b) => a + b, 0)
              : (typeCounts[key] ?? 0);
            const isActive = activeTypeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTypeFilter(key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-primary/20 hover:text-foreground",
                )}
              >
                {label}
                <span className={cn(
                  "text-[10px]",
                  isActive ? "text-primary-foreground/70" : "text-muted-foreground",
                )}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 3: Sort pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">
            Sort:
          </span>
          {SORT_OPTIONS.map((opt) => {
            const isActive = sortField === opt.field;
            return (
              <button
                key={opt.field}
                onClick={() => handleSort(opt.field)}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[11px] transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {opt.label}
                {isActive && (
                  sortDir === "asc"
                    ? <ArrowUp className="size-3" />
                    : <ArrowDown className="size-3" />
                )}
              </button>
            );
          })}
        </div>

        {/* Row 4: Folder pills */}
        {rootFolders.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">
              Folders:
            </span>
            {rootFolders.map((folder) => {
              const isActive = hasFilter(filters, { category: "folder", value: folder });
              return (
                <button
                  key={folder}
                  onClick={() => toggleFilter("folder", folder)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-colors",
                    isActive
                      ? "bg-primary/10 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  {folder}
                  <span className="text-[10px] text-muted-foreground">
                    ({enrichedFiles.filter((f) => f.rootFolder === folder).length})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Row 5: Active filters bar */}
        {filters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">
              {sortedFiles.length} of {enrichedFiles.length} files
            </span>
            {filters.map((f) => (
              <button
                key={`${f.category}:${f.value}`}
                onClick={() => toggleFilter(f.category, f.value)}
                className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[11px] font-medium"
              >
                <span className="text-primary-foreground/60">
                  {f.category}:
                </span>
                {f.value}
                <X className="size-3" />
              </button>
            ))}
            <button
              onClick={clearFilters}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {visibleColumns.map((col) => (
              <col key={col} style={{ width: getColWidth(col) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-background border-b border-border z-10">
            <tr>
              {visibleColumns.map((col) => (
                <th
                  key={col}
                  className="relative text-left px-4 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none group"
                  onClick={() => handleSort(col)}
                >
                  <span className="truncate block">
                    {toTitleCase(col)}
                    <SortIcon field={col} />
                  </span>
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:!opacity-100 bg-border/60"
                    onMouseDown={(e) => onResizeStart(col, e)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageFiles.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                visibleColumns={visibleColumns}
                filters={filters}
                toggleFilter={toggleFilter}
                onSelectNote={onSelectNote}
                actions={actions}
              />
            ))}
            {pageFiles.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length} className="p-0">
                  <EmptyState
                    icon={<Table2 className="size-5" />}
                    title="No matching files"
                    description="Try clearing your filters or add files to your vault."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="shrink-0 border-t border-border px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {sortedFiles.length === 0
            ? "0 files"
            : `${clampedPage * PAGE_SIZE + 1}\u2013${Math.min((clampedPage + 1) * PAGE_SIZE, sortedFiles.length)} of ${sortedFiles.length}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs text-muted-foreground px-2">
              Page {clampedPage + 1} of {totalPages}
            </span>
            <button
              disabled={clampedPage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Save As dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Save Base</DialogTitle>
            <DialogDescription>
              Choose a name for this base view.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={saveInputRef}
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveConfirm();
            }}
            placeholder="e.g. Active Papers, CS Lectures..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <DialogFooter>
            <button
              onClick={() => setSaveDialogOpen(false)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveConfirm}
              disabled={!saveName.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Renders a single table cell based on the column type */
function CellRenderer({
  file,
  column,
  filters,
  toggleFilter,
}: {
  file: FileEntry;
  column: string;
  filters: ActiveFilter[];
  toggleFilter: (category: string, value: string) => void;
}) {
  if (column === "name") {
    const cat = getFileCategory(file.ext);
    const Icon = getFileIcon(cat);
    return (
      <span className="font-medium truncate block flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {file.name}
      </span>
    );
  }
  if (column === "ext") {
    const cat = getFileCategory(file.ext);
    const Icon = getFileIcon(cat);
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-xs font-mono">{file.ext.replace(/^\./, "").toUpperCase()}</span>
      </span>
    );
  }
  if (column === "folder") {
    return (
      <span className="text-muted-foreground truncate block">
        {file.folder}
      </span>
    );
  }
  if (column === "size") {
    return (
      <span className="text-muted-foreground whitespace-nowrap truncate block text-xs font-mono">
        {formatFileSize(file.size)}
      </span>
    );
  }
  if (column === "mtimeMs") {
    return (
      <span className="text-muted-foreground whitespace-nowrap truncate block">
        {formatDate(file.mtimeMs)}
      </span>
    );
  }

  // Frontmatter column
  const value = file.fields[column];
  if (!value) return null;

  if (Array.isArray(value)) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {value.map((v) => (
          <CategoryBadge
            key={v}
            category={column}
            value={v}
            active={hasFilter(filters, { category: column, value: v })}
            onClick={toggleFilter}
          />
        ))}
      </div>
    );
  }

  // Single string value — render as badge for filterability
  return (
    <CategoryBadge
      category={column}
      value={value}
      active={hasFilter(filters, { category: column, value })}
      onClick={toggleFilter}
    />
  );
}

function FileRow({
  file,
  visibleColumns,
  filters,
  toggleFilter,
  onSelectNote,
  actions,
}: {
  file: FileEntry;
  visibleColumns: string[];
  filters: ActiveFilter[];
  toggleFilter: (category: string, value: string) => void;
  onSelectNote: (path: string) => void;
  actions?: BasesViewProps["actions"];
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const isSubmittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus();
  }, [isRenaming]);

  const baseName = file.name;
  const handleRenameSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === baseName) {
      setIsRenaming(false);
      return;
    }
    isSubmittingRef.current = true;
    try {
      await actions?.rename(file.path, trimmed, false);
    } catch {
      // ignore
    }
    setIsRenaming(false);
    isSubmittingRef.current = false;
  }, [newName, baseName, actions, file.path]);

  const handleCopyPath = useCallback(() => {
    actions?.copyPath(file.path);
  }, [actions, file.path]);

  const handleDelete = useCallback(() => {
    void actions?.remove(file.path);
  }, [actions, file.path]);

  const row = (
    <tr
      className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={() => onSelectNote(file.path)}
    >
      {visibleColumns.map((col) => (
        <td key={col} className="px-4 py-2 overflow-hidden">
          {col === "name" && isRenaming ? (
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => void handleRenameSubmit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameSubmit();
                if (e.key === "Escape") setIsRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent text-sm font-medium outline-none ring-1 ring-ring rounded px-1"
            />
          ) : (
            <CellRenderer
              file={file}
              column={col}
              filters={filters}
              toggleFilter={toggleFilter}
            />
          )}
        </td>
      ))}
    </tr>
  );

  if (!actions) return row;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleCopyPath}>
          <Copy className="mr-2 size-4" />
          Copy Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            setNewName(baseName);
            isSubmittingRef.current = false;
            setIsRenaming(true);
          }}
        >
          <Pencil className="mr-2 size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onClick={handleDelete}>
          <Trash2 className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function CategoryBadge({
  category,
  value,
  active,
  onClick,
}: {
  category: string;
  value: string;
  active: boolean;
  onClick: (category: string, value: string) => void;
}) {
  return (
    <Badge
      variant={active ? "default" : "secondary"}
      className={cn(
        "text-[10px] px-1.5 py-0 cursor-pointer",
        !active && "hover:bg-primary hover:text-primary-foreground",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick(category, value);
      }}
    >
      {value}
    </Badge>
  );
}
