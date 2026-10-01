"use client";

import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface VirtualGalleryGridProps<T> {
  items: T[];
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  fallbackCount?: number;
}

const WINDOW_INCREMENT = 48;

export default function VirtualGalleryGrid<T>({
  items,
  itemKey,
  renderItem,
  fallbackCount = 48,
}: VirtualGalleryGridProps<T>) {
  const [visibleCount, setVisibleCount] = useState(fallbackCount);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Grow-only windowing in normal document flow: rows are laid out by the
  // plain CSS grid exactly like a static page, so there is no absolute
  // positioning, offset math, or size caching that can strand a blank
  // region. Offscreen cells stay cheap via content-visibility.
  const growWindow = useCallback(() => {
    setVisibleCount((count) => count + WINDOW_INCREMENT);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the sentinel element remounts as the window grows, so the observer must re-attach.
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) growWindow();
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [growWindow, visibleCount, items.length]);

  const end = Math.min(items.length, visibleCount);

  return (
    <>
      <div className="gallery-card-grid">
        {items.slice(0, end).map((item, index) => (
          <Fragment key={itemKey(item, index)}>
            {renderItem(item, index)}
          </Fragment>
        ))}
      </div>
      {end < items.length ? (
        <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
      ) : null}
    </>
  );
}
