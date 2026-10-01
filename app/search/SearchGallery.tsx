"use client";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaDice } from "react-icons/fa";
import {
  HiArrowDown,
  HiArrowDownTray,
  HiArrowPath,
  HiArrowUp,
  HiCheckCircle,
  HiClock,
  HiHeart,
  HiTrash,
  HiUser,
} from "react-icons/hi2";
import { bulkDeleteMedia } from "@/app/actions/bulk";
import { deleteMedia } from "@/app/actions/media";
import ChangeOwnerModal from "@/components/media/ChangeOwnerModal";
import GalleryCell from "@/components/media/GalleryCell";
import VirtualGalleryGrid from "@/components/media/VirtualGalleryGrid";
import ConfirmModal from "@/components/ui/ConfirmModal";
import ServerActionModal from "@/components/ui/ServerActionModal";
import { logger } from "@/lib/client-logger";
import { resolveMediaDate } from "@/lib/media/exif";
import { prefetchImage } from "@/lib/media/prefetch";
import { startViewTransition } from "@/lib/view-transition";

const PhotoDetailModal = dynamic(
  () => import("@/components/media/PhotoDetailModal"),
  { ssr: false },
);

function getMediaProxyUrl(
  mediaId: string,
  variant: "original" | "thumbnail" = "original",
) {
  if (variant === "thumbnail") return `/media/${mediaId}/thumbnail`;
  return `/media/${mediaId}`;
}

function getFullSizeUrl(item: MediaItem) {
  return getMediaProxyUrl(item.id, "original");
}

function getDisplayUrl(item: MediaItem) {
  if (!item.mimeType.startsWith("image/")) return getFullSizeUrl(item);
  return item.displayUrl ?? getFullSizeUrl(item);
}

export interface MediaItem {
  id: string;
  s3Url?: string;
  s3Key?: string;
  thumbnailS3Key?: string | null;
  thumbnailUrl?: string | null;
  displayUrl?: string | null;
  displayAvifUrl?: string | null;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  exifData: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  uploadedAt: Date;
  eventId?: string;
  event?: {
    id: string;
    name: string;
    slug: string;
    visibility?: "public" | "unlisted" | "auth_required";
  };
  uploadedBy: {
    id: string;
    name: string;
    email?: string;
    handle?: string | null;
    slackId?: string | null;
  };
  likeCount?: number;
  caption?: string | null;
  canDelete?: boolean;
}
export interface Event {
  id: string;
  name: string;
  slug: string;
}
interface SearchGalleryProps {
  media: MediaItem[];
  currentUserId?: string;
  isAdmin?: boolean;
}
export default function SearchGallery({
  media,
  currentUserId,
  isAdmin = false,
}: SearchGalleryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localMedia, setLocalMedia] = useState<MediaItem[]>(media);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  useEffect(() => {
    const photoId = searchParams.get("photo");
    setSelectedMedia(
      photoId ? localMedia.find((m) => m.id === photoId) || null : null,
    );
  }, [searchParams, localMedia]);
  const [sortBy, setSortBy] = useState<"date" | "likes" | "random">("date");
  const [dateOrder, setDateOrder] = useState<"desc" | "asc">("desc");
  const [randomSeed, setRandomSeed] = useState(Math.random());
  const [completed, setCompleted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showChangeOwnerModal, setShowChangeOwnerModal] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<string | null>(null);
  useEffect(() => {
    setLocalMedia(media);
  }, [media]);
  const sortKeys = useMemo(() => {
    const map = new Map<
      string,
      { date: number; likes: number; hash: number; dateLabel: string }
    >();
    for (const item of localMedia) {
      const date = resolveMediaDate(item.exifData, item.uploadedAt);
      map.set(item.id, {
        date: date.getTime(),
        likes: item.likeCount || 0,
        dateLabel: date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }),
        hash: (() => {
          let hash = 0;
          const value = item.id + randomSeed;
          for (let i = 0; i < value.length; i++) {
            hash = (hash << 5) - hash + value.charCodeAt(i);
            hash &= hash;
          }
          return hash;
        })(),
      });
    }
    return map;
  }, [localMedia, randomSeed]);
  const sortedMedia = useMemo(() => {
    return [...localMedia].sort((a, b) => {
      const aKey = sortKeys.get(a.id);
      const bKey = sortKeys.get(b.id);
      if (!aKey || !bKey) return 0;
      if (sortBy === "date") {
        const diff = bKey.date - aKey.date;
        return dateOrder === "desc" ? diff : -diff;
      }
      if (sortBy === "likes") {
        return bKey.likes - aKey.likes;
      }
      return aKey.hash - bKey.hash;
    });
  }, [localMedia, sortBy, dateOrder, sortKeys]);
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
  const updateUrl = useCallback(
    (mediaId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (mediaId) {
        params.set("photo", mediaId);
      } else {
        params.delete("photo");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [displayAvifUrl, setDisplayAvifUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedMedia) {
      setFullSizeUrl(null);
      setDisplayUrl(null);
      setDisplayAvifUrl(null);
      return;
    }
    setFullSizeUrl(getFullSizeUrl(selectedMedia));
    setDisplayUrl(getDisplayUrl(selectedMedia));
    setDisplayAvifUrl(selectedMedia.displayAvifUrl ?? null);
  }, [selectedMedia]);

  const prefetchAdjacentMedia = useCallback(
    (item: MediaItem) => {
      const currentIndex = sortedMedia.findIndex((m) => m.id === item.id);
      if (currentIndex === -1) return;
      for (const neighbor of [
        sortedMedia[currentIndex - 1],
        sortedMedia[currentIndex + 1],
        sortedMedia[currentIndex + 2],
      ]) {
        if (!neighbor || !neighbor.mimeType.startsWith("image/")) continue;
        prefetchImage(getDisplayUrl(neighbor));
      }
    },
    [sortedMedia],
  );
  const openMedia = useCallback(
    (item: MediaItem) => {
      startViewTransition(() => {
        setSelectedMedia(item);
      });
      updateUrl(item.id);
      prefetchAdjacentMedia(item);
    },
    [updateUrl, prefetchAdjacentMedia],
  );
  const goToMedia = useCallback(
    (index: number) => {
      const nextMedia = sortedMedia[index];
      if (!nextMedia) return;
      startViewTransition(() => {
        setSelectedMedia(nextMedia);
      });
      updateUrl(nextMedia.id);
      prefetchAdjacentMedia(nextMedia);
    },
    [sortedMedia, updateUrl, prefetchAdjacentMedia],
  );
  const handleDeleteConfirm = async () => {
    if (!mediaToDelete) return;
    try {
      await deleteMedia(mediaToDelete);
      setLocalMedia((prev) => prev.filter((item) => item.id !== mediaToDelete));
      if (selectedMedia?.id === mediaToDelete) {
        updateUrl(null);
      }
      setShowDeleteModal(false);
    } catch (_error) {
      alert("Failed to delete media");
    } finally {
      setMediaToDelete(null);
    }
  };
  const handleDownload = async (mediaItem: MediaItem) => {
    setDownloading(true);
    try {
      const url = `${getMediaProxyUrl(mediaItem.id)}?download=true`;
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = mediaItem.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
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
  const handleBulkDownload = async () => {
    const selectedCount = selectedItems.size;
    if (selectedCount === 0) return;
    try {
      setDownloading(true);
      for (const itemId of selectedItems) {
        const item = mediaById.get(itemId);
        if (item) {
          await handleDownload(item);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      setDownloading(false);
      clearSelection();
    } catch (_error) {
      alert("Failed to download files");
      setDownloading(false);
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
          prev.filter((item) => !result.deletedIds.includes(item.id)),
        );
        if (selectedMedia && result.deletedIds.includes(selectedMedia.id)) {
          updateUrl(null);
        }
        setSelectedItems((prev) => {
          const newSet = new Set(prev);
          for (const id of result.deletedIds) {
            newSet.delete(id);
          }
          return newSet;
        });
      }
      setSelectionMode(false);
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
        !(item.canDelete || isAdmin || item.uploadedBy.id === currentUserId)
      ) {
        return false;
      }
    }
    return true;
  }, [selectedItems, mediaById, isAdmin, currentUserId]);

  const renderBadges = (item: MediaItem) => (
    <>
      {sortBy === "date" && (
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-full text-xs text-white flex items-center gap-1">
          <HiClock className="w-3 h-3" />
          <span>{sortKeys.get(item.id)?.dateLabel ?? ""}</span>
        </div>
      )}
      {sortBy === "likes" && (
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-full text-xs text-white flex items-center gap-1">
          <HiHeart className="w-3 h-3" />
          <span>{item.likeCount || 0}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4">
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
                disabled={selectedItems.size === 0 || downloading || deleting}
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
                disabled={selectedItems.size === 0 || downloading || deleting}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition flex items-center justify-center gap-2"
              >
                {downloading ? (
                  <HiArrowPath className="w-5 h-5 animate-spin" />
                ) : (
                  <HiArrowDownTray className="w-5 h-5" />
                )}
                <span className="hidden sm:inline">
                  {downloading ? "Downloading..." : "Download"}
                </span>
                <span className="sm:hidden">
                  {downloading ? "Downloading..." : "Download"}
                </span>
              </button>
            )}
            {canDeleteSelection && (
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(true)}
                disabled={selectedItems.size === 0 || downloading || deleting}
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

      <div className="space-y-3">
        <div className="flex gap-2 sm:gap-3 items-center justify-between flex-wrap">
          {!selectionMode && (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition flex items-center gap-2 border border-zinc-700 font-medium"
            >
              <HiCheckCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Select</span>
            </button>
          )}

          <div className="flex gap-1 sm:gap-2 flex-wrap w-full sm:w-auto ml-auto">
            <div className="flex gap-0">
              <button
                type="button"
                onClick={() => startViewTransition(() => setSortBy("date"))}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-l-lg font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                  sortBy === "date"
                    ? "bg-red-600 text-white shadow-lg "
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                }`}
              >
                <HiClock className="w-5 h-5" />
                <span className="hidden sm:inline">Date</span>
              </button>
              {sortBy === "date" && (
                <button
                  type="button"
                  onClick={() =>
                    startViewTransition(() =>
                      setDateOrder(dateOrder === "desc" ? "asc" : "desc"),
                    )
                  }
                  className="px-2 sm:px-3 py-2 sm:py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-r-lg transition-all shadow-lg border-l border-red-600"
                  title={dateOrder === "desc" ? "Newest first" : "Oldest first"}
                >
                  {dateOrder === "desc" ? (
                    <HiArrowDown className="w-5 h-5" />
                  ) : (
                    <HiArrowUp className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => startViewTransition(() => setSortBy("likes"))}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-lg font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                sortBy === "likes"
                  ? "bg-red-600 text-white shadow-lg "
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
              }`}
            >
              <HiHeart className="w-5 h-5" />
              <span className="hidden sm:inline">Likes</span>
            </button>
            <button
              type="button"
              onClick={() =>
                startViewTransition(() => {
                  setSortBy("random");
                  setRandomSeed(Math.random());
                })
              }
              className={`px-3 sm:px-4 py-2 sm:py-2.5 text-sm rounded-lg font-medium transition-all flex items-center gap-1 sm:gap-2 ${
                sortBy === "random"
                  ? "bg-red-600 text-white shadow-lg "
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
              }`}
            >
              <FaDice className="w-5 h-5" />
              <span className="hidden sm:inline">Random</span>
            </button>
          </div>
        </div>
      </div>

      <VirtualGalleryGrid
        items={sortedMedia}
        itemKey={(item) => item.id}
        renderItem={(item, index) => (
          <GalleryCell
            item={item}
            selected={selectedItems.has(item.id)}
            selectionMode={selectionMode}
            optimize={
              Boolean(item.thumbnailUrl) || item.event?.visibility === "public"
            }
            priority={index < 10}
            badges={renderBadges(item)}
            viewTransitionName={
              selectedMedia?.id === item.id ? undefined : `photo-${item.id}`
            }
            onOpen={openMedia}
            onToggleSelect={toggleSelection}
          />
        )}
      />

      {selectedMedia && (
        <PhotoDetailModal
          media={selectedMedia}
          fullSizeUrl={fullSizeUrl}
          displayUrl={displayUrl}
          displayAvifUrl={displayAvifUrl}
          event={selectedMedia.event}
          currentUserId={currentUserId}
          isGlobalAdmin={isAdmin}
          downloading={downloading}
          onClose={() => {
            startViewTransition(() => {
              setSelectedMedia(null);
            });
            updateUrl(null);
          }}
          onMediaUpdate={(updatedMedia) => {
            setLocalMedia((prev) =>
              prev.map((item) =>
                item.id === updatedMedia.id
                  ? { ...updatedMedia, eventId: item.eventId }
                  : item,
              ),
            );
          }}
          onDownload={() => handleDownload(selectedMedia)}
          onDelete={
            selectedMedia.canDelete ||
            currentUserId === selectedMedia.uploadedBy.id ||
            isAdmin
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
      )}

      <ServerActionModal
        isOpen={downloading || deleting || completed}
        isLoading={downloading || deleting}
        isSuccess={completed}
        title={deleting ? "Deleting Files" : "Downloading Files"}
        message={
          deleting
            ? "Permanently removing selected items..."
            : "Your download should start automatically..."
        }
        successTitle={deleting ? "Deletion Complete" : "Download Ready"}
        successMessage={
          deleting
            ? "Items have been permanently removed."
            : "Your download is ready!"
        }
        type={deleting ? "delete" : "download"}
        progress={null}
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
    </div>
  );
}
