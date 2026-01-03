"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import {
  HiArrowDownTray,
  HiArrowPath,
  HiCalendar,
  HiCheck,
  HiClock,
  HiHeart,
  HiPhoto,
  HiTrash,
  HiUser,
} from "react-icons/hi2";
import { bulkDeleteMedia } from "@/app/actions/bulk";
import { deleteMedia, getDownloadUrl } from "@/app/actions/media";
import { useMediaGalleryData } from "@/hooks/useMediaGallery";
import type { Event, MediaItem } from "@/types/media";
import ConfirmModal from "../ui/ConfirmModal";
import ServerActionModal from "../ui/ServerActionModal";
import MediaGalleryToolbar from "./MediaGalleryToolbar";
import PhotoDetailModal from "./PhotoDetailModal";
import VideoIndicator from "./VideoIndicator";

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
  title?: string;
  emptyMessage?: string;
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
    presignedUrls,
    selectedMedia,
    setSelectedMedia,
    selectedThumbnailUrl,
    fullSizeUrl,
    refreshFullSizeUrl,
    sortedMedia,
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
  const [mediaToDelete, setMediaToDelete] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
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
      const downloadUrl = new URL(result.url);
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
      console.error("Download failed:", error);
      alert("Failed to download file");
    } finally {
      setDownloading(false);
    }
  };
  const toggleSelection = (itemId: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };
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
          const item = sortedMedia.find((m) => m.id === itemId);
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
      console.error("Bulk download failed:", error);
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
      console.error("Bulk delete failed:", error);
      alert("Failed to delete items");
      setDeleting(false);
    }
  };
  const canDeleteSelection = Array.from(selectedItems).every((itemId) => {
    const item = sortedMedia.find((m) => m.id === itemId);
    return (
      item &&
      (isAdmin || item.canDelete || item.uploadedBy.id === currentUserId)
    );
  });
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
          setFilter={setFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          dateOrder={dateOrder}
          setDateOrder={setDateOrder}
          setRandomSeed={setRandomSeed}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          showUploaderFilter={showUploaderFilter}
          showEventFilter={showEventFilter}
          showTypeFilter={showTypeFilter}
          showSortFilter={showSortFilter}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        {sortedMedia.map((item) => {
          const url = presignedUrls[item.id];
          const isSelected = selectedItems.has(item.id);
          const isVideo = item.mimeType.startsWith("video/");
          const event =
            item.event || (item.eventId ? eventMap.get(item.eventId) : null);
          return (
            <div
              key={item.id}
              className="relative aspect-square bg-zinc-800 rounded-lg overflow-hidden border border-zinc-800 hover:border-zinc-700 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl group"
            >
              <button
                type="button"
                className="w-full h-full"
                onClick={() => {
                  if (selectionMode) {
                    toggleSelection(item.id);
                  } else {
                    setSelectedMedia(item);
                    updateUrl(item.id);
                  }
                }}
                aria-label={`View ${item.filename}`}
              >
                {!url ? (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                    <HiPhoto className="w-12 h-12 text-zinc-600 animate-pulse" />
                  </div>
                ) : (
                  <img
                    src={url}
                    alt={item.filename}
                    className="object-cover w-full h-full"
                  />
                )}

                {isVideo && url && <VideoIndicator size="lg" />}

                {sortBy === "date" && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs text-white flex items-center gap-1">
                    <HiClock className="w-3 h-3" />
                    <span>
                      {new Date(
                        (
                          item.exifData as {
                            DateTimeOriginal?: string;
                            dateTimeOriginal?: string;
                          }
                        )?.DateTimeOriginal ||
                          (
                            item.exifData as {
                              DateTimeOriginal?: string;
                              dateTimeOriginal?: string;
                            }
                          )?.dateTimeOriginal ||
                          item.uploadedAt,
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </span>
                  </div>
                )}
                {sortBy === "event" && event && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs text-white flex items-center gap-1">
                    <HiCalendar className="w-3 h-3" />
                    <span>{event.name}</span>
                  </div>
                )}
                {sortBy === "uploader" && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs text-white flex items-center gap-1">
                    <HiUser className="w-3 h-3" />
                    <span>{item.uploadedBy?.name || "Unknown"}</span>
                  </div>
                )}
                {sortBy === "likes" && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs text-white flex items-center gap-1">
                    <HiHeart className="w-3 h-3" />
                    <span>{item.likeCount || 0}</span>
                  </div>
                )}
              </button>

              {selectionMode && (
                <div className="absolute top-2 left-2 z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelection(item.id);
                    }}
                    className={`w-8 h-8 rounded-lg backdrop-blur-sm border-2 flex items-center justify-center transition-all hover:bg-zinc-800 ${
                      isSelected
                        ? "bg-red-600 border-red-600"
                        : "bg-zinc-900/80 border-white"
                    }`}
                  >
                    {isSelected && <HiCheck className="w-5 h-5 text-white" />}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedMedia && fullSizeUrl && (
        <PhotoDetailModal
          media={selectedMedia}
          fullSizeUrl={fullSizeUrl}
          thumbnailUrl={selectedThumbnailUrl}
          onRequestFreshUrl={() => refreshFullSizeUrl(selectedMedia)}
          event={
            selectedMedia.event ||
            (selectedMedia.eventId
              ? eventMap.get(selectedMedia.eventId)
              : undefined)
          }
          currentUserId={currentUserId}
          downloading={downloading}
          onClose={() => {
            setSelectedMedia(null);
            updateUrl(null);
          }}
          onMediaUpdate={(updatedMedia) => {
            setLocalMedia((prev) =>
              prev.map((item) =>
                item.id === updatedMedia.id ? updatedMedia : item,
              ),
            );
            if (selectedMedia?.id === updatedMedia.id) {
              setSelectedMedia(updatedMedia);
            }
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
          onNext={() => {
            const currentIndex = sortedMedia.findIndex(
              (m) => m.id === selectedMedia.id,
            );
            if (currentIndex < sortedMedia.length - 1) {
              const nextMedia = sortedMedia[currentIndex + 1];
              setSelectedMedia(nextMedia);
              updateUrl(nextMedia.id);
            }
          }}
          onPrevious={() => {
            const currentIndex = sortedMedia.findIndex(
              (m) => m.id === selectedMedia.id,
            );
            if (currentIndex > 0) {
              const prevMedia = sortedMedia[currentIndex - 1];
              setSelectedMedia(prevMedia);
              updateUrl(prevMedia.id);
            }
          }}
          hasNext={
            sortedMedia.findIndex((m) => m.id === selectedMedia.id) <
            sortedMedia.length - 1
          }
          hasPrevious={
            sortedMedia.findIndex((m) => m.id === selectedMedia.id) > 0
          }
        />
      )}

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
    </div>
  );
}
