"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiArrowUp } from "react-icons/hi2";
import { deleteMedia } from "@/app/actions/media";
import { logger } from "@/lib/client-logger";
import { startViewTransition } from "@/lib/view-transition";
import ConfirmModal from "../ui/ConfirmModal";
import LoadingSpinner from "../ui/LoadingSpinner";
import FeedEmptyState from "./FeedEmptyState";
import FeedItem from "./FeedItem";
import FeedLiveIndicator from "./FeedLiveIndicator";
import type { FeedItemType } from "./types";

const PhotoDetailModal = dynamic(() => import("../media/PhotoDetailModal"), {
  ssr: false,
});

type ActivityFeedProps = {
  fetchData: (limit: number, offset: number) => Promise<any>;
  type: "global" | "event" | "series";
  pollInterval?: number;
};
const MAX_FEED_ITEMS = 500;

function capFeedItems(items: FeedItemType[]) {
  return items.slice(0, MAX_FEED_ITEMS);
}

export default function ActivityFeed({
  fetchData,
  type,
  pollInterval = 30000,
}: ActivityFeedProps) {
  const [items, setItems] = useState<FeedItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<
    FeedItemType["media"] | null
  >(null);
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const itemsLengthRef = useRef(0);
  const itemsRef = useRef<FeedItemType[]>([]);
  const isFetchingRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isLive, setIsLive] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<string | null>(null);
  useEffect(() => {
    itemsLengthRef.current = items.length;
    itemsRef.current = items;
  }, [items]);
  const fetchFeed = useCallback(
    async (append = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        setLoading(true);
        const offset = append ? itemsLengthRef.current : 0;
        const result = await fetchData(20, offset);
        if (!result.success) {
          throw new Error(result.error || "Failed to fetch feed");
        }
        const data = result;
        const newItems = data.items || [];
        setItems((prev) => {
          if (append) {
            const existingIds = new Set(prev.map((item) => item.id));
            const uniqueItems = newItems.filter(
              (item: FeedItemType) => !existingIds.has(item.id),
            );
            return capFeedItems([...prev, ...uniqueItems]);
          }
          return capFeedItems(newItems);
        });
        setHasMore(data.hasMore);
        setError(null);
      } catch (err) {
        logger.error("Feed error:", err);
        setError(err instanceof Error ? err.message : "Failed to load feed");
      } finally {
        isFetchingRef.current = false;
        setLoading(false);
      }
    },
    [fetchData],
  );
  useEffect(() => {
    fetchFeed(false);
  }, [fetchFeed]);
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data.user?.id || null);
          setIsGlobalAdmin(Boolean(data.user?.isGlobalAdmin));
        }
      } catch (error) {
        logger.error("Error fetching user session:", error);
      }
    };
    fetchUser();
  }, []);
  useEffect(() => {
    if (type !== "global") {
      return;
    }
    let reconnectAttempt = 0;
    let disposed = false;
    const maxReconnectDelay = 30000;
    const connect = () => {
      if (disposed) return;
      socketRef.current?.close();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/feed/stream`,
      );
      socketRef.current = socket;
      socket.onopen = () => {
        setIsLive(true);
        reconnectAttempt = 0;
        setReconnectAttempts(0);
      };
      socket.onmessage = (event) => {
        try {
          if (typeof event.data !== "string") return;
          const data = JSON.parse(event.data);
          if (
            data.type === "new_photos" &&
            Array.isArray(data.items) &&
            data.items.length > 0
          ) {
            const incoming = data.items as FeedItemType[];
            setItems((prev) => {
              const existingIds = new Set(prev.map((item) => item.id));
              const fresh = incoming.filter((item) => {
                if (!item.id || existingIds.has(item.id)) return false;
                existingIds.add(item.id);
                return true;
              });
              for (const id of fresh.map((i) => i.id)) {
                setNewlyAddedIds((prevNew) => new Set(prevNew).add(id));
                setTimeout(() => {
                  setNewlyAddedIds((prevNew) => {
                    const next = new Set(prevNew);
                    next.delete(id);
                    return next;
                  });
                }, 5000);
              }
              if (fresh.length === 0) return prev;
              return capFeedItems([...fresh, ...prev]);
            });
          } else if (
            (data.type === "new_photo" ||
              data.type === "new_comment" ||
              data.type === "new_like") &&
            data.item
          ) {
            setItems((prev) => {
              const existingIds = new Set(prev.map((item) => item.id));
              if (existingIds.has(data.item.id)) return prev;
              setNewlyAddedIds((prevNew) => {
                const next = new Set(prevNew);
                next.add(data.item.id);
                return next;
              });
              setTimeout(() => {
                setNewlyAddedIds((prevNew) => {
                  const next = new Set(prevNew);
                  next.delete(data.item.id);
                  return next;
                });
              }, 5000);
              return capFeedItems([data.item, ...prev]);
            });
          } else if (data.type === "photo_deleted" && data.mediaId) {
            setItems((prev) =>
              prev.filter((item) => item.media?.id !== data.mediaId),
            );
          }
        } catch (err) {
          logger.error("WebSocket message parse error:", err);
        }
      };
      socket.onerror = (err) => {
        if (disposed || socketRef.current !== socket) return;
        logger.error("[ActivityFeed] WebSocket error:", err);
        setIsLive(false);
      };
      socket.onclose = () => {
        if (disposed || socketRef.current !== socket) return;
        setIsLive(false);
        if (reconnectTimeoutRef.current) return;
        reconnectAttempt++;
        setReconnectAttempts(reconnectAttempt);
        const delay = Math.min(
          1000 * 2 ** (reconnectAttempt - 1),
          maxReconnectDelay,
        );
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, delay);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsLive(false);
    };
  }, [type]);
  useEffect(() => {
    if (type === "global" || socketRef.current) {
      return;
    }
    const pollForNew = async () => {
      if (document.hidden) return;
      try {
        const result = await fetchData(10, 0);
        if (!result.success) return;
        const data = result;
        const newItems = data.items || [];
        const currentItems = itemsRef.current;
        if (newItems.length > 0 && currentItems.length > 0) {
          const existingIds = new Set(currentItems.map((item) => item.id));
          const uniqueNewItems = newItems.filter(
            (item: FeedItemType) => !existingIds.has(item.id),
          );
          if (uniqueNewItems.length > 0) {
            setItems((prev) => capFeedItems([...uniqueNewItems, ...prev]));
          }
        }
      } catch (err) {
        logger.error("Poll error:", err);
      }
    };
    pollIntervalRef.current = setInterval(
      pollForNew,
      pollInterval,
    ) as unknown as NodeJS.Timeout;
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchData, pollInterval, type]);
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          fetchFeed(true);
        }
      },
      { threshold: 0.1 },
    );
    observerRef.current.observe(loadMoreRef.current);
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, fetchFeed]);
  useEffect(() => {
    if (!selectedMedia) {
      setFullSizeUrl(null);
      return;
    }
    setFullSizeUrl(`/media/${selectedMedia.id}`);
  }, [selectedMedia]);
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const transitionNames = useMemo(() => {
    const names = new Map<string, string>();
    const used = new Set<string>();
    for (const item of items) {
      const mediaId = item.media?.id;
      if (!mediaId || used.has(mediaId)) continue;
      used.add(mediaId);
      names.set(item.id, mediaId);
    }
    return names;
  }, [items]);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="xl" center />
      </div>
    );
  }
  if (error && items.length === 0) {
    return (
      <div className="p-8 text-center text-red-400">
        <p>{error}</p>
      </div>
    );
  }
  if (items.length === 0) {
    return <FeedEmptyState />;
  }
  return (
    <>
      {type === "global" && (
        <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-zinc-800/50 -mx-4 px-4 py-4 mb-8 sm:mx-0 sm:px-0 sm:bg-transparent sm:backdrop-blur-none sm:border-none sm:static">
          <div className="flex items-center justify-end">
            <FeedLiveIndicator
              isLive={isLive}
              reconnectAttempts={reconnectAttempts}
            />
          </div>
        </div>
      )}

      <div className="feed-card-grid w-full pb-20">
        {items.map((item, index) => {
          const imageUrl = item.media?.thumbnailUrl ?? null;
          const isNew = newlyAddedIds.has(item.id);
          const mediaId = item.media?.id;
          const viewTransitionName =
            mediaId && selectedMedia?.id !== mediaId
              ? transitionNames.get(item.id) === mediaId
                ? `photo-${mediaId}`
                : undefined
              : undefined;
          return (
            <FeedItem
              key={item.id}
              item={item}
              imageUrl={imageUrl}
              isNew={isNew}
              index={index}
              viewTransitionName={viewTransitionName}
              onSelect={(media) =>
                startViewTransition(() => setSelectedMedia(media))
              }
            />
          );
        })}
      </div>

      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          <LoadingSpinner size="lg" center />
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="text-zinc-400 text-sm">That's all for now!</div>
        </div>
      )}

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-6 right-6 z-50 p-4 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 ${
          showScrollTop
            ? "translate-y-0 opacity-100"
            : "translate-y-20 opacity-0 pointer-events-none"
        }`}
        aria-label="Back to Top"
      >
        <HiArrowUp className="w-6 h-6" />
      </button>

      {selectedMedia && (
        <PhotoDetailModal
          media={{
            id: selectedMedia.id,
            filename: selectedMedia.filename,
            mimeType: selectedMedia.mimeType,
            width: selectedMedia.width,
            height: selectedMedia.height,
            exifData: selectedMedia.exifData,
            uploadedAt: selectedMedia.uploadedAt,
            uploadedBy: selectedMedia.uploadedBy,
            s3Url: selectedMedia.s3Url,
            thumbnailS3Key: selectedMedia.thumbnailS3Key || null,
            caption: selectedMedia.caption,
            likeCount: selectedMedia.likeCount,
            canDelete: selectedMedia.canDelete,
          }}
          fullSizeUrl={fullSizeUrl}
          displayUrl={selectedMedia.displayUrl ?? null}
          displayAvifUrl={selectedMedia.displayAvifUrl ?? null}
          event={items.find((i) => i.media?.id === selectedMedia.id)?.event}
          currentUserId={currentUserId || undefined}
          isGlobalAdmin={isGlobalAdmin}
          onClose={() => startViewTransition(() => setSelectedMedia(null))}
          onDownload={async () => {
            if (!fullSizeUrl) return;
            try {
              const response = await fetch(fullSizeUrl);
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = selectedMedia.filename;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
            } catch (error) {
              logger.error("Download failed:", error);
            }
          }}
          onDelete={
            selectedMedia.canDelete ||
            (currentUserId && selectedMedia.uploadedBy.id === currentUserId)
              ? () => {
                  setMediaToDelete(selectedMedia.id);
                  setShowDeleteModal(true);
                }
              : undefined
          }
          downloading={false}
        />
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setMediaToDelete(null);
        }}
        onConfirm={async () => {
          if (!mediaToDelete) return;
          try {
            await deleteMedia(mediaToDelete);
            setItems((prev) =>
              prev.filter((item) => item.media?.id !== mediaToDelete),
            );
            setSelectedMedia(null);
          } catch (error) {
            logger.error("Failed to delete media:", error);
            alert("Failed to delete media");
          } finally {
            setShowDeleteModal(false);
            setMediaToDelete(null);
          }
        }}
        title="Delete Media"
        message="Are you sure you want to delete this media? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
      />
    </>
  );
}
