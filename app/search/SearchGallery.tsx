"use client";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FaDice } from "react-icons/fa";
import {
  HiArrowDown,
  HiArrowDownTray,
  HiArrowPath,
  HiArrowUp,
  HiCheck,
  HiCheckCircle,
  HiClock,
  HiHeart,
  HiPhoto,
  HiTrash,
} from "react-icons/hi2";
import { bulkDeleteMedia, getBulkMediaUrls } from "@/app/actions/bulk";
import { deleteMedia } from "@/app/actions/media";
import PhotoDetailModal from "@/components/media/PhotoDetailModal";
import VideoIndicator from "@/components/media/VideoIndicator";
import ConfirmModal from "@/components/ui/ConfirmModal";
import ServerActionModal from "@/components/ui/ServerActionModal";
export interface MediaItem {
  id: string;
  s3Url: string;
  thumbnailS3Key: string | null;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  exifData: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  uploadedAt: Date;
  eventId: string;
  event?: {
    id: string;
    name: string;
    slug: string;
  };
  uploadedBy: {
    id: string;
    name: string;
    email?: string;
    avatarS3Key?: string | null;
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
  const selectedMedia = useMemo(() => {
    const photoId = searchParams.get("photo");
    return photoId ? localMedia.find((m) => m.id === photoId) || null : null;
  }, [searchParams, localMedia]);
  const [sortBy, setSortBy] = useState<"date" | "likes" | "random">("date");
  const [dateOrder, setDateOrder] = useState<"desc" | "asc">("desc");
  const [randomSeed, setRandomSeed] = useState(Math.random());
  const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>(
    {},
  );
  const [completed, setCompleted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<string | null>(null);
  useEffect(() => {
    setLocalMedia(media);
  }, [media]);
  const sortedMedia = useMemo(() => {
    return [...localMedia].sort((a, b) => {
      if (sortBy === "date") {
        const aExif = a.exifData as {
          DateTimeOriginal?: string;
          dateTimeOriginal?: string;
        } | null;
        const bExif = b.exifData as {
          DateTimeOriginal?: string;
          dateTimeOriginal?: string;
        } | null;
        const aDate =
          aExif?.DateTimeOriginal || aExif?.dateTimeOriginal || a.uploadedAt;
        const bDate =
          bExif?.DateTimeOriginal || bExif?.dateTimeOriginal || b.uploadedAt;
        const diff = new Date(bDate).getTime() - new Date(aDate).getTime();
        return dateOrder === "desc" ? diff : -diff;
      }
      if (sortBy === "likes") {
        return (b.likeCount || 0) - (a.likeCount || 0);
      }
      if (sortBy === "random") {
        const hash = (str: string) => {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
          }
          return hash;
        };
        const aHash = hash(a.id + randomSeed);
        const bHash = hash(b.id + randomSeed);
        return aHash - bHash;
      }
      return 0;
    });
  }, [localMedia, sortBy, dateOrder, randomSeed]);
  const updateUrl = (mediaId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (mediaId) {
      params.set("photo", mediaId);
    } else {
      params.delete("photo");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  useEffect(() => {
    const loadThumbnails = async () => {
      if (localMedia.length === 0) {
        setPresignedUrls({});
        return;
      }
      const thumbnailKeys = localMedia
        .filter((item) => item.thumbnailS3Key)
        .map((item) => item.thumbnailS3Key!);
      if (thumbnailKeys.length === 0) {
        setPresignedUrls({});
        return;
      }
      try {
        const allUrls: Record<string, string> = {};
        for (let i = 0; i < thumbnailKeys.length; i += 100) {
          const batch = thumbnailKeys.slice(i, i + 100);
          const data = await getBulkMediaUrls(batch);
          Object.assign(allUrls, data.urls);
        }
        const newUrls: Record<string, string> = {};
        localMedia.forEach((item) => {
          if (item.thumbnailS3Key && allUrls[item.thumbnailS3Key]) {
            newUrls[item.id] = allUrls[item.thumbnailS3Key];
          }
        });
        setPresignedUrls(newUrls);
      } catch (error) {
        console.error("Failed to load thumbnails:", error);
      }
    };
    loadThumbnails();
  }, [localMedia]);
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(null);
  useEffect(() => {
    const loadFullSize = async () => {
      if (!selectedMedia) {
        setFullSizeUrl(null);
        return;
      }
      try {
        const data = await getBulkMediaUrls(undefined, [selectedMedia.id]);
        const url = data.urls?.[selectedMedia.id] ?? null;
        setFullSizeUrl(url);
      } catch (error) {
        console.error("Failed to load full-size image:", error);
      }
    };
    loadFullSize();
  }, [selectedMedia]);
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
      const url = presignedUrls[mediaItem.id];
      if (!url) {
        alert("Download URL not available");
        return;
      }
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
  const handleBulkDownload = async () => {
    const selectedCount = selectedItems.size;
    if (selectedCount === 0) return;
    try {
      setDownloading(true);
      for (const itemId of selectedItems) {
        const item = sortedMedia.find((m) => m.id === itemId);
        if (item) {
          await handleDownload(item);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      setDownloading(false);
      clearSelection();
    } catch (error) {
      console.error("Bulk download failed:", error);
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
          result.deletedIds.forEach((id) => {
            newSet.delete(id);
          });
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
      console.error("Bulk delete failed:", error);
      alert("Failed to delete items");
      setDeleting(false);
    }
  };
  const canDeleteSelection = Array.from(selectedItems).every((itemId) => {
    const item = sortedMedia.find((m) => m.id === itemId);
    return (
      item &&
      (item.canDelete || isAdmin || item.uploadedBy.id === currentUserId)
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
                onClick={() => setSortBy("date")}
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
                    setDateOrder(dateOrder === "desc" ? "asc" : "desc")
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
              onClick={() => setSortBy("likes")}
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
              onClick={() => {
                setSortBy("random");
                setRandomSeed(Math.random());
              }}
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

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        {sortedMedia.map((item) => {
          const url = presignedUrls[item.id];
          const isSelected = selectedItems.has(item.id);
          const isVideo = item.mimeType.startsWith("video/");
          const _event = item.event;
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
                  <Image
                    src={url}
                    alt={item.filename}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                    className="object-cover"
                  />
                )}

                {isVideo && url && <VideoIndicator size="lg" />}

                {sortBy === "date" && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-full text-xs text-white flex items-center gap-1">
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
                {sortBy === "likes" && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-full text-xs text-white flex items-center gap-1">
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
          event={selectedMedia.event}
          currentUserId={currentUserId}
          downloading={downloading}
          onClose={() => {
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
          onNext={() => {
            const currentIndex = sortedMedia.findIndex(
              (m) => m.id === selectedMedia.id,
            );
            if (currentIndex < sortedMedia.length - 1) {
              const nextMedia = sortedMedia[currentIndex + 1];
              updateUrl(nextMedia.id);
            }
          }}
          onPrevious={() => {
            const currentIndex = sortedMedia.findIndex(
              (m) => m.id === selectedMedia.id,
            );
            if (currentIndex > 0) {
              const prevMedia = sortedMedia[currentIndex - 1];
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
    </div>
  );
}
