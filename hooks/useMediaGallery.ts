import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBulkMediaUrls } from "@/app/actions/bulk";
import { logger } from "@/lib/logger";
import type { Event, MediaItem } from "@/types/media";
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
  const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>(
    {},
  );
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [selectedThumbnailUrl, setSelectedThumbnailUrl] = useState<
    string | null
  >(null);
  const [fullSizeUrl, setFullSizeUrl] = useState<string | null>(null);
  const fullSizeUrlCacheRef = useRef<Record<string, string>>({});
  const thumbnailUrlCacheRef = useRef<Record<string, string>>({});
  const fullSizeRequestSeqRef = useRef(0);
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
  const loadThumbnailUrls = useCallback(async (items: MediaItem[]) => {
    const unloadedItems = items.filter(
      (item) => item.thumbnailS3Key && !thumbnailUrlCacheRef.current[item.id],
    );
    if (unloadedItems.length === 0) return;

    try {
      const data = await getBulkMediaUrls(
        unloadedItems.map((item) => item.thumbnailS3Key!),
      );
      const newUrls: Record<string, string> = {};
      const urls = data.urls ?? {};
      unloadedItems.forEach((item) => {
        if (item.thumbnailS3Key && urls[item.thumbnailS3Key]) {
          newUrls[item.id] = urls[item.thumbnailS3Key];
        }
      });
      if (Object.keys(newUrls).length > 0) {
        Object.assign(thumbnailUrlCacheRef.current, newUrls);
        setPresignedUrls((prev) => ({ ...prev, ...newUrls }));
      }
    } catch (error) {
      logger.error("Failed to load thumbnails:", error);
    }
  }, []);

  useEffect(() => {
    setPresignedUrls((prev) => {
      if (localMedia.length === 0) return {};
      const ids = new Set(localMedia.map((item) => item.id));
      let changed = false;
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([id, url]) => {
        if (ids.has(id)) {
          next[id] = url;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [localMedia]);
  useEffect(() => {
    if (!selectedMedia) {
      setSelectedThumbnailUrl(null);
      return;
    }
    const thumb = presignedUrls[selectedMedia.id] ?? null;
    setSelectedThumbnailUrl(thumb);
  }, [selectedMedia, presignedUrls]);

  const refreshFullSizeUrl = useCallback(
    async (mediaToLoad?: MediaItem | null) => {
      const target = mediaToLoad ?? selectedMedia;
      if (!target) {
        setFullSizeUrl(null);
        return;
      }
      const requestSeq = ++fullSizeRequestSeqRef.current;
      setFullSizeUrl(fullSizeUrlCacheRef.current[target.id] ?? null);
      try {
        const data = await getBulkMediaUrls(undefined, [target.id]);
        let url = data.urls?.[target.id] ?? null;
        if (requestSeq !== fullSizeRequestSeqRef.current) return;

        if (
          url &&
          (target.mimeType === "image/heic" ||
            target.mimeType === "image/heif") &&
          (url.includes("/api/v1/view") || url.includes("/media/"))
        ) {
          const urlObj = new URL(url, window.location.origin);
          urlObj.searchParams.delete("variant");
          urlObj.searchParams.set("variant", "display");
          url = urlObj.toString();
        }

        if (url) fullSizeUrlCacheRef.current[target.id] = url;
        setFullSizeUrl(url);
      } catch (error) {
        if (requestSeq !== fullSizeRequestSeqRef.current) return;
        logger.error("Failed to load full-size image:", error);
      }
    },
    [selectedMedia],
  );

  const prefetchFullSizeUrls = useCallback(async (items: MediaItem[]) => {
    const mediaIds = items
      .filter((item) => !fullSizeUrlCacheRef.current[item.id])
      .map((item) => item.id);
    if (mediaIds.length === 0) return;

    try {
      const data = await getBulkMediaUrls(undefined, mediaIds);
      Object.entries(data.urls ?? {}).forEach(([id, url]) => {
        fullSizeUrlCacheRef.current[id] = url;
      });
    } catch (error) {
      logger.error("Failed to prefetch full-size images:", error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!selectedMedia) {
        if (isMounted) setFullSizeUrl(null);
        return;
      }
      await refreshFullSizeUrl(selectedMedia);
    };
    load();
    return () => {
      isMounted = false;
    };
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
    presignedUrls,
    loadThumbnailUrls,
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
