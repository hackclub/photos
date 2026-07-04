import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event, MediaItem } from "@/types/media";

function getMediaProxyUrl(
  mediaId: string,
  variant: "original" | "thumbnail" | "display" = "original",
) {
  if (variant === "thumbnail") return `/media/${mediaId}/thumbnail`;
  if (variant === "display") return `/media/${mediaId}/display`;
  return `/media/${mediaId}`;
}

function getFullSizeProxyUrl(item: MediaItem) {
  return getMediaProxyUrl(
    item.id,
    item.mimeType === "image/heic" || item.mimeType === "image/heif"
      ? "display"
      : "original",
  );
}

function isImageMedia(item: MediaItem) {
  return item.mimeType.startsWith("image/");
}

function getThumbnailProxyUrl(item: MediaItem) {
  return item.thumbnailS3Key || isImageMedia(item)
    ? getMediaProxyUrl(item.id, "thumbnail")
    : null;
}

function shouldReduceMediaPrefetch() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
  };
  return Boolean(
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 3) ||
      (navigator.hardwareConcurrency || 4) <= 4,
  );
}
export function useMediaGalleryData(
  media: MediaItem[],
  events: Event[],
  initialPhotoId?: string,
) {
  const [localMedia, setLocalMedia] = useState<MediaItem[]>(media);
  const [filter, setFilter] = useState<"all" | "photos" | "videos">("all");
  const [sortBy, setSortBy] = useState<
    "date" | "uploader" | "event" | "likes" | "random"
  >("date");
  const [dateOrder, setDateOrder] = useState<"desc" | "asc">("desc");
  const [randomSeed, setRandomSeed] = useState(Math.random());
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(null);
  const fullSizeUrlCacheRef = useRef<Record<string, string>>({});
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    setLocalMedia(media);
  }, [media]);
  const eventMap = useMemo(() => {
    const map = new Map<string, Event>();
    events.forEach((event) => {
      map.set(event.id, event);
    });
    return map;
  }, [events]);
  const sortedMedia = useMemo(() => {
    const filteredMedia = localMedia.filter((item) => {
      if (filter === "photos" && !item.mimeType.startsWith("image/"))
        return false;
      if (filter === "videos" && !item.mimeType.startsWith("video/"))
        return false;
      return true;
    });
    return [...filteredMedia].sort((a, b) => {
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
      if (sortBy === "uploader") {
        return (a.uploadedBy?.name || "").localeCompare(
          b.uploadedBy?.name || "",
        );
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
        return hash(a.id + randomSeed) - hash(b.id + randomSeed);
      }
      const eventA = a.event || (a.eventId ? eventMap.get(a.eventId) : null);
      const eventB = b.event || (b.eventId ? eventMap.get(b.eventId) : null);
      return (eventA?.name || "").localeCompare(eventB?.name || "");
    });
  }, [localMedia, filter, sortBy, dateOrder, eventMap, randomSeed]);
  useEffect(() => {
    if (initialPhotoId) {
      const photo = localMedia.find((m) => m.id === initialPhotoId);
      if (photo) setSelectedMedia(photo);
    }
  }, [initialPhotoId, localMedia]);
  const updateUrl = (mediaId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (mediaId) {
      params.set("photo", mediaId);
    } else {
      params.delete("photo");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const getThumbnailUrl = useCallback(getThumbnailProxyUrl, []);
  const selectedThumbnailUrl = selectedMedia
    ? getThumbnailProxyUrl(selectedMedia)
    : null;

  const refreshFullSizeUrl = useCallback(
    (mediaToLoad?: MediaItem | null) => {
      const target = mediaToLoad ?? selectedMedia;
      if (!target) {
        setFullSizeUrl(null);
        return;
      }
      const cachedUrl = fullSizeUrlCacheRef.current[target.id];
      if (cachedUrl) {
        setFullSizeUrl(cachedUrl);
        return;
      }
      const url = getFullSizeProxyUrl(target);
      fullSizeUrlCacheRef.current[target.id] = url;
      setFullSizeUrl(url);
    },
    [selectedMedia],
  );

  const prefetchFullSizeUrls = useCallback((items: MediaItem[]) => {
    if (shouldReduceMediaPrefetch()) return;
    const uncachedItems = items.filter(
      (item) => !fullSizeUrlCacheRef.current[item.id],
    );
    if (uncachedItems.length === 0) return;

    uncachedItems.forEach((item) => {
      fullSizeUrlCacheRef.current[item.id] = getFullSizeProxyUrl(item);
    });
  }, []);

  useEffect(() => {
    refreshFullSizeUrl(selectedMedia);
  }, [selectedMedia, refreshFullSizeUrl]);

  return {
    localMedia,
    setLocalMedia,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    dateOrder,
    setDateOrder,
    randomSeed,
    setRandomSeed,
    getThumbnailUrl,
    selectedMedia,
    setSelectedMedia,
    selectedThumbnailUrl,
    fullSizeUrl,
    setFullSizeUrl,
    refreshFullSizeUrl,
    prefetchFullSizeUrls,
    sortedMedia,
    eventMap,
    updateUrl,
  };
}
