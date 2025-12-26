"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiArrowUp } from "react-icons/hi2";
import { deleteMedia } from "@/app/actions/media";
import PhotoDetailModal from "../media/PhotoDetailModal";
import ConfirmModal from "../ui/ConfirmModal";
import LoadingSpinner from "../ui/LoadingSpinner";
import FeedEmptyState from "./FeedEmptyState";
import FeedItem from "./FeedItem";
import FeedLiveIndicator from "./FeedLiveIndicator";
import type { FeedItemType } from "./types";

type ActivityFeedProps = {
  fetchData: (limit: number, offset: number) => Promise<any>;
  type: "global" | "event" | "series";
  pollInterval?: number;
};
export default function ActivityFeed({
  fetchData,
  type,
  pollInterval = 30000,
}: ActivityFeedProps) {
  const [items, setItems] = useState<FeedItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [selectedMedia, setSelectedMedia] = useState<
    FeedItemType["media"] | null
  >(null);
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<string | null>(null);
  const fetchFeed = useCallback(
    async (append = false) => {
      try {
        setLoading(true);
        const offset = append ? items.length : 0;
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
            return [...prev, ...uniqueItems];
          }
          return newItems;
        });
        setHasMore(data.hasMore);
        setError(null);
        const mediaIds = newItems
          .filter((item: FeedItemType) => item.media)
          .map((item: FeedItemType) => item.media?.id);
        if (mediaIds.length > 0) {
          try {
            const { getMediaUrls } = await import("@/app/actions/media");
            const result = await getMediaUrls(mediaIds);
            if (result.success && result.urls) {
              setImageUrls((prev) => {
                const newUrls = new Map(prev);
                for (const [mediaId, url] of Object.entries(result.urls!)) {
                  newUrls.set(mediaId, url as string);
                }
                return newUrls;
              });
            }
          } catch (err) {
            console.error("Failed to fetch image URLs:", err);
          }
        }
      } catch (err) {
        console.error("Feed error:", err);
        setError(err instanceof Error ? err.message : "Failed to load feed");
      } finally {
        setLoading(false);
      }
    },
    [fetchData, items.length],
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
        }
      } catch (error) {
        console.error("Error fetching user session:", error);
      }
    };
    fetchUser();
  }, []);
  useEffect(() => {
    if (type !== "global") {
      return;
    }
    let reconnectAttempt = 0;
    const maxReconnectDelay = 30000;
    const connect = () => {
      const eventSource = new EventSource("/api/feed/stream");
      eventSourceRef.current = eventSource;
      eventSource.onopen = () => {
        setIsLive(true);
        reconnectAttempt = 0;
        setReconnectAttempts(0);
      };
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
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
              return [data.item, ...prev];
            });
            if (data.item.media) {
              import("@/app/actions/media").then(({ getMediaUrls }) => {
                getMediaUrls([data.item.media.id])
                  .then((result) => {
                    if (result.success && result.urls) {
                      setImageUrls((prev) => {
                        const newUrls = new Map(prev);
                        newUrls.set(
                          data.item.media.id,
                          result.urls![data.item.media.id],
                        );
                        return newUrls;
                      });
                    }
                  })
                  .catch(console.error);
              });
            }
          } else if (data.type === "photo_deleted" && data.mediaId) {
            setItems((prev) =>
              prev.filter((item) => item.media?.id !== data.mediaId),
            );
            setImageUrls((prev) => {
              const newUrls = new Map(prev);
              newUrls.delete(data.mediaId);
              return newUrls;
            });
          }
        } catch (err) {
          console.error("SSE message parse error:", err);
        }
      };
      eventSource.onerror = (err) => {
        console.error("[ActivityFeed] SSE error:", err);
        setIsLive(false);
        if (eventSource.readyState === EventSource.CLOSED) {
          reconnectAttempt++;
          setReconnectAttempts(reconnectAttempt);
          const delay = Math.min(
            1000 * 2 ** (reconnectAttempt - 1),
            maxReconnectDelay,
          );
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay) as unknown as NodeJS.Timeout;
        }
      };
    };
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsLive(false);
    };
  }, [type]);
  useEffect(() => {
    if (eventSourceRef.current) {
      return;
    }
    const pollForNew = async () => {
      try {
        const result = await fetchData(10, 0);
        if (!result.success) return;
        const data = result;
        const newItems = data.items || [];
        if (newItems.length > 0 && items.length > 0) {
          const existingIds = new Set(items.map((item) => item.id));
          const uniqueNewItems = newItems.filter(
            (item: FeedItemType) => !existingIds.has(item.id),
          );
          if (uniqueNewItems.length > 0) {
            setItems((prev) => [...uniqueNewItems, ...prev]);
            const mediaIds = uniqueNewItems
              .filter((item: FeedItemType) => item.media)
              .map((item: FeedItemType) => item.media?.id);
            if (mediaIds.length > 0) {
              const { getMediaUrls } = await import("@/app/actions/media");
              const result = await getMediaUrls(mediaIds);
              if (result.success && result.urls) {
                setImageUrls((prev) => {
                  const newUrls = new Map(prev);
                  for (const [mediaId, url] of Object.entries(result.urls!)) {
                    newUrls.set(mediaId, url as string);
                  }
                  return newUrls;
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
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
  }, [fetchData, pollInterval, items]);
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
    const loadFullSize = async () => {
      if (!selectedMedia) {
        setFullSizeUrl(null);
        return;
      }
      try {
        const { getMediaUrls } = await import("@/app/actions/media");
        const result = await getMediaUrls([selectedMedia.id]);
        if (result.success && result.urls) {
          const url = result.urls[selectedMedia.id];
          setFullSizeUrl(url);
        }
      } catch (error) {
        console.error("Failed to load full-size image:", error);
      }
    };
    loadFullSize();
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
          <div className="max-w-7xl mx-auto flex items-center justify-end">
            <FeedLiveIndicator
              isLive={isLive}
              reconnectAttempts={reconnectAttempts}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto w-full pb-20">
        {items.map((item, index) => {
          const imageUrl = item.media
            ? item.media.thumbnailS3Key
              ? imageUrls.get(item.media.thumbnailS3Key)
              : imageUrls.get(item.media.id)
            : null;
          const isNew = newlyAddedIds.has(item.id);
          return (
            <FeedItem
              key={item.id}
              item={item}
              imageUrl={imageUrl || null}
              isNew={isNew}
              index={index}
              onSelect={(media) => setSelectedMedia(media)}
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

      {selectedMedia && fullSizeUrl && (
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
          event={items.find((i) => i.media?.id === selectedMedia.id)?.event}
          currentUserId={currentUserId || undefined}
          onClose={() => setSelectedMedia(null)}
          onDownload={async () => {
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
              console.error("Download failed:", error);
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
            console.error("Failed to delete media:", error);
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
