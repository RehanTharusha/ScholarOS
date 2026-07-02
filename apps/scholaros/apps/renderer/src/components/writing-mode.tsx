import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  FileDown,
  Copy,
  PenLine,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadLibrary,
  saveLibrary,
  formatAuthor,
  type Citation,
  type CitationLibrary,
} from "@/lib/citations";
import { CitationImportModal } from "@/components/citation-import-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WritingModeProps {
  content: string;
  onChange: (content: string) => void;
  onExit: () => void;
  wordTarget?: number;
  title?: string;
  course?: string;
  onExport?: (format: "md" | "pdf" | "docx") => void;
}

interface HeadingNode {
  level: number;
  text: string;
  line: number;
  children: HeadingNode[];
  id: string;
}

// ---------------------------------------------------------------------------
// Heading parsing
// ---------------------------------------------------------------------------

function parseHeadings(content: string): {
  level: number;
  text: string;
  line: number;
}[] {
  const lines = content.split("\n");
  const headings: { level: number; text: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,3})\s+(.+)/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/[*_`]/g, ""),
        line: i,
      });
    }
  }
  return headings;
}

function buildHeadingTree(
  flat: { level: number; text: string; line: number }[],
): HeadingNode[] {
  const root: HeadingNode[] = [];
  const stack: HeadingNode[] = [];
  for (const h of flat) {
    const node: HeadingNode = {
      ...h,
      children: [],
      id: `${h.level}-${h.line}`,
    };
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return root;
}

function collectAllIds(nodes: HeadingNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: HeadingNode[]) => {
    for (const n of list) {
      ids.push(n.id);
      walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

// ---------------------------------------------------------------------------
// Word & citation counting
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countCitations(content: string): number {
  let count = 0;
  // [1], [2], etc.
  const numeric = content.match(/\[\d+\]/g);
  if (numeric) count += numeric.length;
  // [@key] pandoc-style
  const pandoc = content.match(/\[@\w+\]/g);
  if (pandoc) count += pandoc.length;
  // (Author, YYYY)
  const paren = content.match(/\([^)]*\d{4}[^)]*\)/g);
  if (paren) count += paren.length;
  return count;
}

// ---------------------------------------------------------------------------
// Outline row
// ---------------------------------------------------------------------------

function OutlineRow({
  node,
  depth,
  collapsedIds,
  activeId,
  onToggleCollapse,
  onClickHeading,
}: {
  node: HeadingNode;
  depth: number;
  collapsedIds: Set<string>;
  activeId: string | null;
  onToggleCollapse: (id: string) => void;
  onClickHeading: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);

  return (
    <div key={node.id}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-muted",
          activeId === node.id
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onClickHeading(node.id)}
      >
        {hasChildren ? (
          <span
            className="flex size-4 shrink-0 items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(node.id);
            }}
          >
            {isCollapsed ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="truncate">{node.text}</span>
      </button>
      {hasChildren && !isCollapsed ? (
        <div>
          {node.children.map((child) => (
            <OutlineRow
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              activeId={activeId}
              onToggleCollapse={onToggleCollapse}
              onClickHeading={onClickHeading}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WritingMode({
  content,
  onChange,
  onExit,
  wordTarget: initialTarget = 3000,
  title = "Untitled",
  course,
  onExport,
}: WritingModeProps) {
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const [wordTarget, setWordTarget] = useState(initialTarget);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(String(initialTarget));
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  // Load citation library on mount
  useEffect(() => {
    loadLibrary().then((lib) => setCitations(lib.citations));
  }, []);

  // Convert citations to editor options format
  const citationOptions = useMemo(
    () =>
      citations.map((c) => ({
        value: c.key,
        label: `${formatAuthor(c.authors)} (${c.year})`,
        description: c.title,
      })),
    [citations],
  );

  const handleImportCitations = useCallback(
    async (newCitations: Citation[]) => {
      const existingKeys = new Set(citations.map((c) => c.key));
      const unique = newCitations.filter((c) => !existingKeys.has(c.key));
      if (unique.length === 0) return;
      const updated = [...citations, ...unique];
      setCitations(updated);
      const library: CitationLibrary = {
        citations: updated,
        lastImported: new Date().toISOString(),
      };
      await saveLibrary(library);
    },
    [citations],
  );

  const wordCount = useMemo(() => countWords(content), [content]);
  const citationCount = useMemo(() => countCitations(content), [content]);
  const headings = useMemo(() => {
    const flat = parseHeadings(content);
    return { flat, tree: buildHeadingTree(flat) };
  }, [content]);

  const progressRatio = useMemo(
    () => (wordTarget > 0 ? Math.min(wordCount / wordTarget, 1.25) : 0),
    [wordCount, wordTarget],
  );

  const progressColor = useMemo(() => {
    if (wordCount > wordTarget) return "bg-destructive";
    if (progressRatio >= 0.8) return "bg-emerald-500";
    return "bg-amber-500";
  }, [wordCount, wordTarget, progressRatio]);

  // Collapse all / expand all
  const allIds = useMemo(
    () => new Set(collectAllIds(headings.tree)),
    [headings.tree],
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Scroll editor to a heading by line number
  const scrollToHeading = useCallback(
    (id: string) => {
      const h = headings.flat.find((h) => `${h.level}-${h.line}` === id);
      if (!h) return;
      const wrapper = editorWrapperRef.current;
      if (!wrapper) return;
      const editorContent = wrapper.querySelector(".editor-content-wrapper");
      if (!editorContent) return;
      const matches = editorContent.querySelectorAll("h1, h2, h3");
      for (const el of matches) {
        if (el.textContent?.replace(/[*_`]/g, "").trim() === h.text) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }
    },
    [headings.flat],
  );

  // IntersectionObserver: track which heading is most visible
  useEffect(() => {
    const wrapper = editorWrapperRef.current;
    if (!wrapper) return;
    const editorContent = wrapper.querySelector(".editor-content-wrapper");
    if (!editorContent) return;
    const headingEls = editorContent.querySelectorAll("h1, h2, h3");
    const visibility = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const text = entry.target.textContent?.replace(/[*_`]/g, "").trim();
          if (text) {
            visibility.set(text, entry.intersectionRatio);
          }
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const h of headings.flat) {
          const ratio = visibility.get(h.text) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = h.id;
          }
        }
        if (bestRatio > 0) setActiveId(bestId);
      },
      {
        root: editorContent,
        rootMargin: "-48px 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const el of headingEls) observer.observe(el);
    return () => observer.disconnect();
  }, [headings.flat, content]);

  // Add section: insert heading markdown at cursor/end
  const addSection = useCallback(() => {
    const suffix = content.endsWith("\n") ? "" : "\n";
    onChange(content + suffix + "## New Section\n\n");
  }, [content, onChange]);

  // Export handlers
  const handleExport = useCallback(
    (format: "md" | "pdf" | "docx") => {
      onExport?.(format);
    },
    [onExport],
  );

  const handleCopyFormatted = useCallback(async () => {
    try {
      const plain = content
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/[*_~`>]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/^\s*[-*+]\s/gm, "• ")
        .replace(/^\s*\d+\.\s/gm, "")
        .trim();
      await navigator.clipboard.writeText(plain);
    } catch {
      // clipboard write can fail silently
    }
  }, [content]);

  const handleCommitTarget = useCallback(() => {
    const parsed = parseInt(targetInput, 10);
    if (parsed > 0) setWordTarget(parsed);
    else setTargetInput(String(wordTarget));
    setEditingTarget(false);
  }, [targetInput, wordTarget]);

  return (
    <div className="writing-mode flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 bg-background/95 px-6 py-3">
        <div className="flex items-center gap-3">
          <PenLine className="size-5 text-purple-500" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {course ? (
              <p className="text-xs text-muted-foreground">{course}</p>
            ) : null}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit Writing Mode
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Outline panel */}
        <aside className="w-[200px] shrink-0 border-r border-border/60 bg-muted/30 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Outline
            </span>
            <div className="flex items-center gap-1">
              {collapsedIds.size > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => setCollapsedIds(new Set())}
                >
                  Expand all
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => setCollapsedIds(allIds)}
                >
                  Collapse all
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-1 py-1">
            {headings.tree.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground/60">
                No headings yet.
              </p>
            ) : (
              headings.tree.map((node) => (
                <OutlineRow
                  key={node.id}
                  node={node}
                  depth={0}
                  collapsedIds={collapsedIds}
                  activeId={activeId}
                  onToggleCollapse={toggleCollapse}
                  onClickHeading={scrollToHeading}
                />
              ))
            )}
          </div>
          <div className="border-t border-border/40 px-2 py-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1.5 text-xs text-muted-foreground"
              onClick={addSection}
            >
              <Plus className="size-3" />
              Add Section
            </Button>
          </div>
        </aside>

        {/* Editor */}
        <div ref={editorWrapperRef} className="flex-1 min-w-0 flex flex-col">
          <MarkdownEditor
            content={content}
            onChange={onChange}
            placeholder="Start writing your paper…"
            citationOptions={citationOptions}
            onCitationClick={() => setImportOpen(true)}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-4 border-t border-border/60 bg-background px-6 py-1.5">
        {/* Word count target */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">
            Words: {wordCount.toLocaleString()}
            <span className="text-muted-foreground/60">
              {" / "}
              {editingTarget ? (
                <Input
                  className="inline h-5 w-20 px-1 py-0 text-xs"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  onBlur={handleCommitTarget}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommitTarget();
                    if (e.key === "Escape") {
                      setTargetInput(String(wordTarget));
                      setEditingTarget(false);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => {
                    setTargetInput(String(wordTarget));
                    setEditingTarget(true);
                  }}
                >
                  {wordTarget.toLocaleString()}
                </button>
              )}
            </span>
          </span>
          {/* Progress bar */}
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", progressColor)}
              style={{ width: `${Math.min(progressRatio * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-border/60" />

        {/* Citation count */}
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          Citations: {citationCount}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Export */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <FileDown className="size-3" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => handleExport("docx")}
              className="gap-2"
            >
              <FileText className="size-4" />
              Export as Word (.docx)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleExport("pdf")}
              className="gap-2"
            >
              <FileText className="size-4" />
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCopyFormatted} className="gap-2">
              <Copy className="size-4" />
              Copy as formatted text
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CitationImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        existingCitations={citations}
        onImport={handleImportCitations}
      />
    </div>
  );
}
