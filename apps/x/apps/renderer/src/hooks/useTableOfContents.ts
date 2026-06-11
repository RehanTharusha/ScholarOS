import { useState, useEffect, useCallback, useRef, useMemo } from "react";

export interface TocItem {
  id: string;
  text: string;
  level: number; // 1-6
}

export interface TocNode extends TocItem {
  children: TocNode[];
}

/**
 * Extracts headings from markdown content by parsing h1-h6 tags.
 * Expects rendered HTML with heading elements, or raw markdown with # syntax.
 */
function extractHeadingsFromMarkdown(markdown: string): TocItem[] {
  const headings: TocItem[] = [];
  // Match markdown headings: # through ######
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    // Generate a slug from the heading text
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    headings.push({ id, text, level });
  }

  return headings;
}

/**
 * Extracts headings from DOM elements (h1-h6) in a container.
 */
function extractHeadingsFromDOM(container: HTMLElement): TocItem[] {
  const headings: TocItem[] = [];
  const elements = container.querySelectorAll("h1, h2, h3, h4, h5, h6");

  elements.forEach((el) => {
    const level = parseInt(el.tagName.charAt(1), 10);
    const text = el.textContent?.trim() || "";
    const id = el.id || text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Ensure the element has an id for navigation
    if (!el.id) {
      el.id = id;
    }

    headings.push({ id, text, level });
  });

  return headings;
}

/**
 * Builds a tree structure from flat heading items.
 */
export function buildHeadingTree(headings: TocItem[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const heading of headings) {
    const node: TocNode = { ...heading, children: [] };

    // Pop stack until we find a parent with a lower level
    while (
      stack.length > 0 &&
      stack[stack.length - 1].level >= heading.level
    ) {
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

/**
 * Finds the currently active heading based on scroll position.
 * Uses an IntersectionObserver-like approach with getBoundingClientRect.
 */
function findActiveHeading(headings: TocItem[]): string | null {
  if (headings.length === 0) return null;

  const viewportTop = window.scrollY;
  const offset = 100; // Pixels from top to consider "active"

  // Find the last heading that is above the viewport top + offset
  let activeId: string | null = null;

  for (const heading of headings) {
    const element = document.getElementById(heading.id);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    const elementTop = rect.top + viewportTop;

    if (elementTop <= viewportTop + offset) {
      activeId = heading.id;
    }
  }

  return activeId || headings[0].id;
}

interface UseTableOfContentsOptions {
  /** Markdown content to extract headings from */
  markdown?: string;
  /** DOM container element to extract headings from */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Whether to track scroll position */
  trackScroll?: boolean;
  /** Offset from top of viewport for active heading detection (default: 100) */
  scrollOffset?: number;
}

interface UseTableOfContentsReturn {
  /** Flat list of headings */
  headings: TocItem[];
  /** Tree structure of headings */
  headingTree: TocNode[];
  /** Currently active heading ID */
  activeId: string | null;
  /** Scroll to a heading by ID */
  scrollToHeading: (id: string) => void;
  /** Manually refresh headings */
  refresh: () => void;
}

export function useTableOfContents(
  options: UseTableOfContentsOptions = {}
): UseTableOfContentsReturn {
  const { markdown, containerRef, trackScroll = true, scrollOffset = 100 } = options;
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const headingsRef = useRef<TocItem[]>([]);

  const refresh = useCallback(() => {
    let newHeadings: TocItem[] = [];

    if (containerRef?.current) {
      newHeadings = extractHeadingsFromDOM(containerRef.current);
    } else if (markdown) {
      newHeadings = extractHeadingsFromMarkdown(markdown);
    }

    headingsRef.current = newHeadings;
    setHeadings(newHeadings);
  }, [markdown, containerRef]);

  // Extract headings when content changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Track scroll position for active heading
  useEffect(() => {
    if (!trackScroll || headingsRef.current.length === 0) return;

    const handleScroll = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const currentHeadings = headingsRef.current;
        if (currentHeadings.length === 0) return;

        const viewportTop = window.scrollY;

        let foundId: string | null = null;

        for (const heading of currentHeadings) {
          const element = document.getElementById(heading.id);
          if (!element) continue;

          const rect = element.getBoundingClientRect();
          const elementTop = rect.top + viewportTop;

          if (elementTop <= viewportTop + scrollOffset) {
            foundId = heading.id;
          }
        }

        setActiveId(foundId || currentHeadings[0]?.id || null);
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [trackScroll, scrollOffset, headings]);

  const scrollToHeading = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return;

    const viewportTop = window.scrollY;
    const rect = element.getBoundingClientRect();
    const elementTop = rect.top + viewportTop;

    window.scrollTo({
      top: elementTop - scrollOffset,
      behavior: "smooth",
    });

    setActiveId(id);
  }, [scrollOffset]);

  const headingTree = useMemo(() => buildHeadingTree(headings), [headings]);

  return {
    headings,
    headingTree,
    activeId,
    scrollToHeading,
    refresh,
  };
}
