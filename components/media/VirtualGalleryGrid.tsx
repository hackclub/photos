"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  Fragment,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface VirtualGalleryGridProps<T> {
  items: T[];
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  minColumnWidth?: number;
  fallbackCount?: number;
}

export default function VirtualGalleryGrid<T>({
  items,
  itemKey,
  renderItem,
  minColumnWidth = 192,
  fallbackCount = 48,
}: VirtualGalleryGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<{
    width: number;
    scrollMargin: number;
  } | null>(null);

  // Self-healing measurement: layout shifts above the grid (toolbars, banners)
  // move the container without resizing it, and a stale scrollMargin strands
  // rows outside the computed window. Bail out when nothing changed so this
  // never causes an extra render.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const width = element.offsetWidth;
    const scrollMargin = element.getBoundingClientRect().top + window.scrollY;
    setMetrics((prev) =>
      prev && prev.width === width && prev.scrollMargin === scrollMargin
        ? prev
        : { width, scrollMargin },
    );
  });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const width = element.offsetWidth;
      const scrollMargin = element.getBoundingClientRect().top + window.scrollY;
      setMetrics((prev) =>
        prev && prev.width === width && prev.scrollMargin === scrollMargin
          ? prev
          : { width, scrollMargin },
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const width = metrics?.width ?? 0;
  const gap = metrics && metrics.width < 768 ? 8 : 16;
  const columns =
    width > 0
      ? width < 768
        ? 2
        : Math.max(2, Math.floor((width + gap) / (minColumnWidth + gap)))
      : 2;
  const cellSize =
    width > 0 ? Math.floor((width - gap * (columns - 1)) / columns) : 0;
  const rowCount = Math.max(1, Math.ceil(items.length / columns));
  const rowSize = cellSize + gap;

  const virtualizer = useWindowVirtualizer({
    // Never let the virtualizer cache measurements under the degenerate
    // pre-measure geometry (rowSize 0 + gap): that stale size cache is what
    // leaves whole regions blank after scrolling.
    count: metrics ? rowCount : 0,
    estimateSize: () => rowSize,
    overscan: 6,
    scrollMargin: metrics?.scrollMargin ?? 0,
  });

  // estimateSize is not part of the virtualizer's cache key; without an
  // explicit measure() the itemSizeCache keeps whatever geometry was computed
  // first and the served range decouples from what we paint.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rowSize/rowCount changes must re-measure cached item sizes.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowSize, rowCount]);

  if (!metrics) {
    return (
      <div ref={containerRef} className="gallery-card-grid">
        {items.slice(0, fallbackCount).map((item, index) => (
          <Fragment key={itemKey(item, index)}>
            {renderItem(item, index)}
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const rowStart = virtualRow.index * columns;
        const rowItems = items.slice(rowStart, rowStart + columns);
        return (
          <div
            key={virtualRow.key}
            className="gallery-virtual-row absolute left-0 top-0 grid w-full"
            style={{
              height: cellSize,
              transform: `translateY(${virtualRow.start - (metrics.scrollMargin ?? 0)}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              columnGap: gap,
            }}
          >
            {rowItems.map((item, offset) => (
              <Fragment key={itemKey(item, rowStart + offset)}>
                {renderItem(item, rowStart + offset)}
              </Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
}
