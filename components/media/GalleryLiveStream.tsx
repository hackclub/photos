"use client";
import { useEffect } from "react";
import type { MediaItem } from "@/types/media";

type ActivityMedia = Record<string, any>;

function matchesScope(
  item: ActivityMedia,
  scopeType: "event" | "series",
  scopeId: string,
) {
  if (!item?.event) return false;
  if (scopeType === "event") {
    return item.event.id === scopeId || item.event.slug === scopeId;
  }
  return item.event.seriesId === scopeId;
}

function toMediaItem(item: ActivityMedia): MediaItem | null {
  const m = item?.media;
  if (!m?.id) return null;
  const up = m.uploadedBy || item.user || {};
  return {
    id: m.id,
    s3Url: m.s3Url,
    thumbnailS3Key: m.thumbnailS3Key ?? null,
    filename: m.filename || "",
    mimeType: m.mimeType || "image/jpeg",
    width: m.width ?? null,
    height: m.height ?? null,
    exifData: m.exifData ?? null,
    uploadedAt: m.uploadedAt ? new Date(m.uploadedAt) : new Date(),
    eventId: item.event?.id,
    event: item.event
      ? {
          id: item.event.id,
          name: item.event.name,
          slug: item.event.slug,
          visibility: item.event.visibility,
        }
      : undefined,
    uploadedBy: {
      id: up.id || "",
      name: up.handle || up.name || "Unknown",
      handle: up.handle,
      slackId: up.slackId,
      avatarUrl: up.avatarUrl,
    },
    likeCount: m.likeCount ?? 0,
  };
}

export default function GalleryLiveStream({
  scopeType,
  scopeId,
  onNewMedia,
  onFocus,
}: {
  scopeType: "event" | "series";
  scopeId: string;
  onNewMedia: (items: MediaItem[]) => void;
  onFocus: () => void;
}) {
  useEffect(() => {
    if (!scopeType || !scopeId) return;
    if (typeof window === "undefined") return;

    let socket: WebSocket | null = null;
    let closed = false;
    let retrySchedule: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const maxDelay = 30000;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";

    const destroy = () => {
      if (retrySchedule) {
        clearTimeout(retrySchedule);
        retrySchedule = null;
      }
      try {
        socket?.close();
      } catch {
        /* noop */
      }
      socket = null;
    };

    const handleMessage = (data: any) => {
      let incoming: ActivityMedia[] = [];
      if (data.type === "new_photos" && Array.isArray(data.items)) {
        incoming = data.items;
      } else if (data.type === "new_photo" && data.item) {
        incoming = [data.item];
      }
      const matching = incoming.filter((item) =>
        matchesScope(item, scopeType, scopeId),
      );
      if (matching.length === 0) return;
      const mediaItems = matching
        .map(toMediaItem)
        .filter((item): item is MediaItem => Boolean(item));
      if (mediaItems.length > 0) onNewMedia(mediaItems);
    };

    const scheduleReconnect = () => {
      if (closed) return;
      attempt++;
      const delay = Math.min(1000 * 2 ** (attempt - 1), maxDelay);
      retrySchedule = setTimeout(connect, delay);
    };

    const connect = () => {
      if (closed) return;
      destroy();
      socket = new WebSocket(`${protocol}//${location.host}/api/feed/stream`);
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (event) => {
        try {
          if (typeof event.data !== "string") return;
          handleMessage(JSON.parse(event.data));
        } catch {
          /* noop */
        }
      };
      socket.onclose = () => {
        if (closed) return;
        scheduleReconnect();
      };
      socket.onerror = () => {
        try {
          socket?.close();
        } catch {
          /* noop */
        }
      };
    };

    connect();

    const onVisibility = () => {
      if (document.hidden) {
        closed = true;
        destroy();
      } else {
        closed = false;
        attempt = 0;
        destroy();
        onFocus();
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      destroy();
    };
  }, [scopeType, scopeId, onNewMedia, onFocus]);

  return null;
}
