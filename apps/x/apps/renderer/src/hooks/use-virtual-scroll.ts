import * as React from "react";

interface UseVirtualScrollOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
}

export function useVirtualScroll({
  itemCount,
  itemHeight,
  overscan = 4,
}: UseVirtualScrollOptions) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const onScroll = () => setScrollTop(node.scrollTop);
    onScroll();
    node.addEventListener("scroll", onScroll);

    const resizeObserver = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height ?? 0;
      setHeight(nextHeight);
    });
    resizeObserver.observe(node);

    return () => {
      node.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const visibleCount = Math.max(1, Math.ceil(height / itemHeight));
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount,
    startIndex + visibleCount + overscan * 2,
  );

  return {
    containerRef,
    startIndex,
    endIndex,
    offsetTop: startIndex * itemHeight,
    totalHeight: itemCount * itemHeight,
  };
}
