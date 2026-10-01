"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiArrowDownTray,
  HiArrowPath,
  HiCalendar,
  HiClock,
  HiHeart,
  HiTrash,
  HiUser,
} from "react-icons/hi2";
import { bulkDeleteMedia } from "@/app/actions/bulk";
import { deleteMedia, getDownloadUrl } from "@/app/actions/media";
import IncludesMeDrawer from "@/components/face/IncludesMeDrawer";
import { useMediaGalleryData } from "@/hooks/useMediaGallery";
import { logger } from "@/lib/client-logger";
import { startViewTransition } from "@/lib/view-transition";
import type { Event, MediaItem } from "@/types/media";
import ConfirmModal from "../ui/ConfirmModal";
import ServerActionModal from "../ui/ServerActionModal";
import ChangeOwnerModal from "./ChangeOwnerModal";
import GalleryCell from "./GalleryCell";
import GalleryLiveStream from "./GalleryLiveStream";
import MediaGalleryToolbar from "./MediaGalleryToolbar";
import VirtualGalleryGrid from "./VirtualGalleryGrid";

const PhotoDetailModal = dynamic(() => import("./PhotoDetailModal"), {
  ssr: false,
});

let modalChunkPreloaded = false;

function preloadModalChunk() {
  if (modalChunkPreloaded) return;
  modalChunkPreloaded = true;
  void import("./PhotoDetailModal");
}

interface MediaGalleryProps {
  media: MediaItem[];
  events?: Event[];
  currentUserId?: string;
  isAdmin?: boolean;
  eventId?: string;
  initialPhotoId?: string;
  showUploaderFilter?: boolean;
  showEventFilter?: boolean;
  showTypeFilter?: boolean;
  showSortFilter?: boolean;
  hideControls?: boolean;
  liveScopeType?: "event" | "series";
  liveScopeId?: string;
  title?: string;
  emptyMessage?: string;
  blurMode?: boolean;
  blurDrafts?: Record<
    string,
    {
      media: MediaItem;
      regions: { x: number; y: number; width: number; height: number }[];
      previewDataUrl: string;
    }
  >;
  onBlurDraft?: (draft: {
    media: MediaItem;
    regions: { x: number; y: number; width: number; height: number }[];
    previewDataUrl: string;
  }) => void;
}
export default function MediaGallery({
  media,
  events = [],
  currentUserId,
  isAdmin = false,
  eventId,
  initialPhotoId,
  showUploaderFilter = true,
  showEventFilter = false,
  showTypeFilter = true,
  showSortFilter = true,
  hideControls = false,
  liveScopeType,
  liveScopeId,
  blurMode = false,
  blurDrafts = {},
  onBlurDraft,
}: MediaGalleryProps) {
  const {
    setLocalMedia,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    dateOrder,
    setDateOrder,
    setRandomSeed,
    selectedMedia,
    setSelectedMedia,
    selectedThumbnailUrl,
    selectedDisplayUrl,
    selectedDisplayAvifUrl,
    fullSizeUrl,
    refreshFullSizeUrl,
    prefetchFullSizeUrls,
    sortedMedia: unfilteredSortedMedia,
    dateLabels,
    eventMap,
    updateUrl,
  } = useMediaGalleryData(media, events, initialPhotoId);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showChangeOwnerModal, setShowChangeOwnerModal] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<string | null>(null);
  const [faceDrawerOpen, setFaceDrawerOpen] = useState(false);
  const [includesMeActive, setIncludesMeActive] = useState(false);
  const [faceMediaIds, setFaceMediaIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const handleLiveNewMedia = useCallback(
    (newItems: MediaItem[]) => {
      if (newItems.length === 0) return;
      setLocalMedia((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const fresh = newItems.filter((m) => !existing.has(m.id));
        if (fresh.length === 0) return prev;
        return [...fresh, ...prev];
      });
    },
    [setLocalMedia],
  );
  const handleLiveFocus = useCallback(() => {
    router.refresh();
  }, [router]);
  const liveEnabled =
    Boolean(liveScopeType) && Boolean(liveScopeId) && !blurMode;
  const abortControllerRef = useRef<AbortController | null>(null);
  const sortedMedia = useMemo(
    () =>
      includesMeActive
        ? unfilteredSortedMedia.filter((item) => faceMediaIds.has(item.id))
        : unfilteredSortedMedia,
    [includesMeActive, faceMediaIds, unfilteredSortedMedia],
  );
  const mediaById = useMemo(
    () => new Map(sortedMedia.map((item) => [item.id, item])),
    [sortedMedia],
  );
  const selectedMediaIndex = useMemo(
    () =>
      selectedMedia
        ? sortedMedia.findIndex((item) => item.id === selectedMedia.id)
        : -1,
    [sortedMedia, selectedMedia],
  );

  useEffect(() => {
    const idle: typeof requestIdleCallback =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? window.requestIdleCallback
        : (callback) => window.setTimeout(callback, 300);
    const handle = idle(() => preloadModalChunk());
    return () => {
      if ("cancelIdleCallback" in window) {
        window.cancelIdleCallback(handle as number);
      }
    };
  }, []);

  const prefetchAdjacentMedia = useCallback(
    (item: MediaItem) => {
      const currentIndex = sortedMedia.findIndex((m) => m.id === item.id);
      if (currentIndex === -1) return;
      void prefetchFullSizeUrls(
        [
          sortedMedia[currentIndex - 1],
          sortedMedia[currentIndex + 1],
          sortedMedia[currentIndex + 2],
        ].filter((mediaItem): mediaItem is MediaItem => Boolean(mediaItem)),
      );
    },
    [sortedMedia, prefetchFullSizeUrls],
  );
  const openMedia = useCallback(
    (item: MediaItem) => {
      startViewTransition(() => {
        setSelectedMedia(item);
      });
      updateUrl(item.id);
      prefetchAdjacentMedia(item);
    },
    [setSelectedMedia, updateUrl, prefetchAdjacentMedia],
  );
  const goToMedia = useCallback(
    (index: number) => {
      const nextMedia = sortedMedia[index];
      if (!nextMedia) return;
      setSelectedMedia(nextMedia);
      updateUrl(nextMedia.id);
      prefetchAdjacentMedia(nextMedia);
    },
    [sortedMedia, setSelectedMedia, updateUrl, prefetchAdjacentMedia],
  );
  const handleDeleteConfirm = async () => {
    if (!mediaToDelete) return;
    try {
      await deleteMedia(mediaToDelete);
      setLocalMedia((prev) => prev.filter((m) => m.id !== mediaToDelete));
      if (selectedMedia?.id === mediaToDelete) {
        setSelectedMedia(null);
        updateUrl(null);
      }
    } catch (_error) {
      alert("Failed to delete media");
    } finally {
      setMediaToDelete(null);
      setShowDeleteModal(false);
    }
  };
  const handleDownload = async (mediaItem: MediaItem) => {
    setDownloading(true);
    try {
      const result = await getDownloadUrl(mediaItem.id);
      if (!result.success || !result.url) {
        throw new Error(result.error || "Failed to get download URL");
      }
      const downloadUrl = new URL(result.url, window.location.origin);
      downloadUrl.searchParams.set("variant", "original");
      const a = document.createElement("a");
      a.href = downloadUrl.toString();
      a.download = mediaItem.filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      logger.error("Download failed:", error);
      alert("Failed to download file");
    } finally {
      setDownloading(false);
    }
  };
  const toggleSelection = useCallback((itemId: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);
  const selectAll = () => {
    setSelectedItems(new Set(sortedMedia.map((item) => item.id)));
  };
  const clearSelection = () => {
    setSelectedItems(new Set());
    setSelectionMode(false);
  };
  const handleCloseModal = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPreparing(false);
    setDownloading(false);
    setDeleting(false);
    setCompleted(false);
    setProgress(null);
  };
  const handleBulkDownload = async () => {
    const selectedCount = selectedItems.size;
    if (selectedCount === 0) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      if (eventId && selectedCount > 100) {
        const selectedIds = Array.from(selectedItems);
        setPreparing(true);
        setCompleted(false);
        setProgress(null);
        const prepareResponse = await fetch(
          `/api/events/${eventId}/download/prepare`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaIds: selectedIds }),
            signal: controller.signal,
          },
        );
        if (!prepareResponse.ok) {
          const data = await prepareResponse.json();
          alert(data.error || "Failed to prepare download");
          setPreparing(false);
          return;
        }
        const { downloadId, fileCount } = await prepareResponse.json();
        setProgress({ current: fileCount, total: fileCount });
        setPreparing(false);
        setDownloading(true);
        const a = document.createElement("a");
        a.href = `/api/events/${eventId}/download/${downloadId}`;
        a.download = `selected-photos-${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => {
          setCompleted(true);
          setDownloading(false);
          clearSelection();
        }, 1500);
        setTimeout(() => {
          setCompleted(false);
        }, 3000);
      } else {
        setDownloading(true);
        for (const itemId of selectedItems) {
          if (controller.signal.aborted) break;
          const item = mediaById.get(itemId);
          if (item) {
            await handleDownload(item);
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
        setDownloading(false);
        clearSelection();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      logger.error("Bulk download failed:", error);
      alert("Failed to download files");
      setPreparing(false);
      setDownloading(false);
    } finally {
      abortControllerRef.current = null;
    }
  };
  const handleBulkDeleteConfirm = async () => {
    setShowBulkDeleteModal(false);
    setDeleting(true);
    setCompleted(false);
    try {
      const result = await bulkDeleteMedia(Array.from(selectedItems));
      if ((result.skipped ?? 0) > 0) {
        alert(
          `Deleted ${result.deleted} items. ${result.skipped} items were skipped (no permission).`,
        );
      }
      if (result.deletedIds && result.deletedIds.length > 0) {
        setLocalMedia((prev) =>
          prev.filter((m) => !result.deletedIds!.includes(m.id)),
        );
        setSelectedItems(new Set());
        setSelectionMode(false);
      }
      setCompleted(true);
      setTimeout(() => {
        setCompleted(false);
        setDeleting(false);
      }, 2000);
    } catch (error) {
      logger.error("Bulk delete failed:", error);
      alert("Failed to delete items");
      setDeleting(false);
    }
  };
  const canDeleteSelection = useMemo(() => {
    for (const itemId of selectedItems) {
      const item = mediaById.get(itemId);
      if (
        !item ||
        !(isAdmin || item.canDelete || item.uploadedBy.id === currentUserId)
      ) {
        return false;
      }
    }
    return true;
  }, [selectedItems, mediaById, isAdmin, currentUserId]);

  const renderBadges = (item: MediaItem) => {
    const event =
      item.event || (item.eventId ? eventMap.get(item.eventId) : null);
    return (
      <>
        {sortBy === "date" && (
          <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-lg bg-black/70 px-2 py-1 text-xs text-white backdrop-blur-sm">
            <HiClock className="w-3 h-3" />
            <span>{dateLabels.get(item.id) ?? ""}</span>
          </div>
        )}
        {sortBy === "event" && event && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs text-white flex items-center gap-1">
            <HiCalendar className="w-3 h-3" />
            <span className="truncate">{event.name}</span>
          </div>
        )}
        {sortBy === "uploader" && (
          <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-lg bg-black/70 px-2 py-1 text-xs text-white backdrop-blur-sm">
            <HiUser className="w-3 h-3" />
            <span className="truncate">
              {item.uploadedBy?.name || "Unknown"}
            </span>
          </div>
        )}
        {sortBy === "likes" && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs text-white flex items-center gap-1">
            <HiHeart className="w-3 h-3" />
            <span>{item.likeCount || 0}</span>
          </div>
        )}
      </>
    );
  };

  const detailModal = selectedMedia ? (
    <PhotoDetailModal
      media={selectedMedia}
      fullSizeUrl={fullSizeUrl}
      displayUrl={selectedDisplayUrl}
      displayAvifUrl={selectedDisplayAvifUrl}
      thumbnailUrl={selectedThumbnailUrl}
      onRequestFreshUrl={() => refreshFullSizeUrl(selectedMedia)}
      event={
        selectedMedia.event ||
        (selectedMedia.eventId
          ? eventMap.get(selectedMedia.eventId)
          : undefined)
      }
      currentUserId={currentUserId}
      isGlobalAdmin={isAdmin}
      downloading={downloading}
      onClose={() => {
        startViewTransition(() => {
          setSelectedMedia(null);
        });
        updateUrl(null);
      }}
      onDownload={() => handleDownload(selectedMedia)}
      blurMode={blurMode && selectedMedia.mimeType.startsWith("image/")}
      blurDraft={blurDrafts[selectedMedia.id]}
      onBlurSave={blurMode ? onBlurDraft : undefined}
      onMediaUpdate={
        blurMode
          ? undefined
          : (updatedMedia) => {
              setLocalMedia((prev) =>
                prev.map((item) =>
                  item.id === updatedMedia.id ? updatedMedia : item,
                ),
              );
              if (selectedMedia?.id === updatedMedia.id) {
                setSelectedMedia(updatedMedia);
              }
            }
      }
      onSuggestionResolved={
        blurMode
          ? undefined
          : (status) => {
              if (status === "rejected") {
                setLocalMedia((current) =>
                  current.filter((item) => item.id !== selectedMedia.id),
                );
                setSelectedMedia(null);
                updateUrl(null);
                return;
              }
              const updated = {
                ...selectedMedia,
                suggestedMention: false,
                suggestionId: undefined,
              };
              setLocalMedia((current) =>
                current.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              );
              setSelectedMedia(updated);
            }
      }
      onDelete={
        !blurMode &&
        (selectedMedia.canDelete ||
          currentUserId === selectedMedia.uploadedBy.id ||
          isAdmin)
          ? () => {
              setMediaToDelete(selectedMedia.id);
              setShowDeleteModal(true);
            }
          : undefined
      }
      onNext={
        selectedMediaIndex < sortedMedia.length - 1
          ? () => goToMedia(selectedMediaIndex + 1)
          : undefined
      }
      onPrevious={
        selectedMediaIndex > 0
          ? () => goToMedia(selectedMediaIndex - 1)
          : undefined
      }
      hasNext={selectedMediaIndex < sortedMedia.length - 1}
      hasPrevious={selectedMediaIndex > 0}
    />
  ) : null;

  return (
    <div className="space-y-4">
      {liveEnabled ? (
        <GalleryLiveStream
          scopeType={liveScopeType!}
          scopeId={liveScopeId!}
          onNewMedia={handleLiveNewMedia}
          onFocus={handleLiveFocus}
        />
      ) : null}
      {selectionMode && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-zinc-800 rounded-lg border border-zinc-700 sticky top-4 z-30 shadow-xl">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <button
              type="button"
              onClick={clearSelection}
              className="px-3 sm:px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={selectAll}
              className="px-3 sm:px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 rounded-lg transition"
            >
              Select All
            </button>
            <span className="text-sm text-zinc-400">
              {selectedItems.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowChangeOwnerModal(true)}
                disabled={
                  selectedItems.size === 0 ||
                  downloading ||
                  preparing ||
                  deleting
                }
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition flex items-center justify-center gap-2"
              >
                <HiUser className="w-5 h-5" />
                <span className="hidden sm:inline">Change Owner</span>
                <span className="sm:hidden">Owner</span>
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={handleBulkDownload}
                disabled={
                  selectedItems.size === 0 ||
                  downloading ||
                  preparing ||
                  deleting
                }
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition flex items-center justify-center gap-2"
              >
                {downloading || preparing ? (
                  <HiArrowPath className="w-5 h-5 animate-spin" />
                ) : (
                  <HiArrowDownTray className="w-5 h-5" />
                )}
                <span className="hidden sm:inline">
                  {preparing
                    ? "Preparing..."
                    : downloading
                      ? "Downloading..."
                      : `Download ${eventId && selectedItems.size > 100 ? "(ZIP)" : ""}`}
                </span>
                <span className="sm:hidden">
                  {preparing
                    ? "Preparing..."
                    : downloading
                      ? "Downloading..."
                      : "Download"}
                </span>
              </button>
            )}
            {canDeleteSelection && (
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(true)}
                disabled={
                  selectedItems.size === 0 ||
                  downloading ||
                  preparing ||
                  deleting
                }
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <HiArrowPath className="w-5 h-5 animate-spin" />
                ) : (
                  <HiTrash className="w-5 h-5" />
                )}
                <span className="hidden sm:inline">
                  {deleting ? "Deleting..." : "Delete"}
                </span>
                <span className="sm:hidden">
                  {deleting ? "Deleting..." : "Delete"}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {!hideControls && (
        <MediaGalleryToolbar
          filter={filter}
          setFilter={(value) => startViewTransition(() => setFilter(value))}
          sortBy={sortBy}
          setSortBy={(value) => startViewTransition(() => setSortBy(value))}
          dateOrder={dateOrder}
          setDateOrder={(value) =>
            startViewTransition(() => setDateOrder(value))
          }
          setRandomSeed={(value) =>
            startViewTransition(() => setRandomSeed(value))
          }
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          showUploaderFilter={showUploaderFilter}
          showEventFilter={showEventFilter}
          showTypeFilter={showTypeFilter}
          showSortFilter={showSortFilter}
          showIncludesMe={Boolean(eventId && currentUserId && !blurMode)}
          includesMeActive={includesMeActive}
          onIncludesMeClick={() => {
            if (includesMeActive) {
              setIncludesMeActive(false);
            } else {
              setFaceDrawerOpen(true);
            }
          }}
        />
      )}

      {includesMeActive && sortedMedia.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="font-medium text-white">No photos found</p>
          <p className="mt-1 text-sm text-zinc-500">Try again later.</p>
        </div>
      ) : null}

      <VirtualGalleryGrid
        items={sortedMedia}
        itemKey={(item) => item.id}
        renderItem={(item, index) => {
          const event =
            item.event || (item.eventId ? eventMap.get(item.eventId) : null);
          const optimizeMedia = event?.visibility === "public";
          return (
            <GalleryCell
              item={item}
              selected={selectedItems.has(item.id)}
              selectionMode={selectionMode}
              optimize={optimizeMedia}
              priority={index < 10}
              highlight={Boolean(item.suggestedMention)}
              draftSelected={blurMode && Boolean(blurDrafts[item.id])}
              badges={renderBadges(item)}
              viewTransitionName={
                selectedMedia?.id === item.id ? undefined : `photo-${item.id}`
              }
              onOpen={openMedia}
              onToggleSelect={toggleSelection}
            />
          );
        }}
      />

      {detailModal}

      <ServerActionModal
        isOpen={
          preparing ||
          (downloading && !!eventId && selectedItems.size > 100) ||
          deleting ||
          completed
        }
        isLoading={preparing || downloading || deleting}
        isSuccess={completed}
        title={
          deleting
            ? "Deleting Files"
            : preparing
              ? "Preparing Download"
              : "Downloading Files"
        }
        message={
          deleting
            ? "Permanently removing selected items..."
            : preparing
              ? "Creating ZIP file on server..."
              : "Your download should start automatically..."
        }
        successTitle={deleting ? "Deletion Complete" : "Download Ready"}
        successMessage={
          deleting
            ? "Items have been permanently removed."
            : "Your download is ready!"
        }
        type={deleting ? "delete" : "download"}
        progress={progress}
        onClose={handleCloseModal}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setMediaToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Media"
        message="Are you sure you want to delete this media? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
        timerSeconds={3}
      />

      <ConfirmModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleBulkDeleteConfirm}
        title="Delete Selected Items"
        message={`Are you sure you want to delete ${selectedItems.size} ${selectedItems.size === 1 ? "item" : "items"}? This action cannot be undone.`}
        confirmText={`Delete ${selectedItems.size} ${selectedItems.size === 1 ? "item" : "items"}`}
        cancelText="Cancel"
        danger={true}
        timerSeconds={3}
      />

      <ChangeOwnerModal
        isOpen={showChangeOwnerModal}
        onClose={() => setShowChangeOwnerModal(false)}
        mediaIds={Array.from(selectedItems)}
        onComplete={() => {
          setLocalMedia((prev) => [...prev]);
          setSelectedItems(new Set());
          setSelectionMode(false);
        }}
      />

      {eventId && currentUserId ? (
        <IncludesMeDrawer
          eventId={eventId}
          open={faceDrawerOpen}
          onClose={() => setFaceDrawerOpen(false)}
          onApply={(matches) => {
            setFaceMediaIds(new Set(matches.map((match) => match.mediaId)));
            setIncludesMeActive(true);
          }}
        />
      ) : null}
    </div>
  );
}
