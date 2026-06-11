import { useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  ChevronRight,
  List,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { type TocItem, type TocNode, buildHeadingTree } from "@/hooks/useTableOfContents";

interface TableOfContentsProps {
  headings: TocItem[];
  tree?: TocNode[];
  activeId?: string;
  onNavigate?: (id: string) => void;
  onClose?: () => void;
}

/**
 * Heading level indicator - shows a small bar whose width indicates depth.
 */
function HeadingLevelIndicator({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {Array.from({ length: Math.min(level, 6) }, (_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full",
            i === level - 1 ? "size-1.5 bg-primary" : "size-1 bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

/**
 * A single TOC item with optional children.
 */
const TocItemComponent = memo(function TocItemComponent({
  node,
  activeId,
  onNavigate,
  depth = 0,
}: {
  node: TocNode;
  activeId?: string;
  onNavigate?: (id: string) => void;
  depth?: number;
}) {
  const isActive = activeId === node.id;
  const hasChildren = node.children.length > 0;
  const [isExpanded, setIsExpanded] = useState(true);

  const handleClick = useCallback(() => {
    onNavigate?.(node.id);
  }, [node.id, onNavigate]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  }, []);

  // Font size based on heading level
  const textSizeClass = node.level <= 2
    ? "text-sm font-medium"
    : node.level <= 4
      ? "text-xs font-medium"
      : "text-xs";

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={cn(
          "group relative flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
          isActive
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {/* Collapse/expand toggle */}
        {hasChildren ? (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              onClick={handleToggle}
              className="flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted transition-colors"
              aria-label={isExpanded ? "Collapse section" : "Expand section"}
            >
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <ChevronRight className="size-3" />
              </motion.div>
            </button>
          </CollapsibleTrigger>
        ) : (
          <div className="flex size-4 shrink-0 items-center justify-center">
            <HeadingLevelIndicator level={node.level} />
          </div>
        )}

        {/* Clickable heading text */}
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            "flex-1 truncate text-left transition-colors",
            textSizeClass,
            isActive && "text-foreground"
          )}
          title={node.text}
        >
          {node.text}
        </button>

        {/* Active indicator bar */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              layoutId="toc-active-indicator"
              className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary"
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0 }}
              transition={{ duration: 0.15 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Children */}
      {hasChildren && (
        <CollapsibleContent>
          <AnimatePresence initial={false}>
            {node.children.map((child) => (
              <motion.div
                key={child.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <TocItemComponent
                  node={child}
                  activeId={activeId}
                  onNavigate={onNavigate}
                  depth={depth + 1}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
});

/**
 * Table of Contents panel component.
 * Displays a navigable outline of document headings with active tracking.
 */
export function TableOfContentsPanel({
  headings,
  tree,
  activeId,
  onNavigate,
  onClose,
}: TableOfContentsProps) {
  // Build tree from flat headings if not provided
  const headingTree = tree ?? buildHeadingTree(headings);

  if (headings.length === 0) {
    return (
      <div className="flex flex-col w-[260px] shrink-0 border-l border-border bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1.5">
            <List className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Table of Contents
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Close table of contents"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Empty state */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="text-center">
            <div className="rounded-full bg-muted p-3 mx-auto w-fit mb-3">
              <Hash className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No headings found in this document.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add headings (h1-h6) to see them here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-[260px] shrink-0 border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <List className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Table of Contents
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close table of contents"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Heading count */}
      <div className="px-3 py-1.5 border-b border-border/50 shrink-0">
        <span className="text-[11px] text-muted-foreground">
          {headings.length} {headings.length === 1 ? "heading" : "headings"}
        </span>
      </div>

      {/* TOC tree */}
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        <nav aria-label="Table of contents">
          {headingTree.map((node) => (
            <TocItemComponent
              key={node.id}
              node={node}
              activeId={activeId}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>

      {/* Footer with scroll-to-top */}
      <div className="shrink-0 border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-muted-foreground"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          Back to top
        </Button>
      </div>
    </div>
  );
}


