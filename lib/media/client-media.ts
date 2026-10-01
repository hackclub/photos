import { toPublicUser } from "@/lib/user-display";
import type { MediaItem } from "@/types/media";
import { getMediaDisplayUrl, getMediaThumbnailUrl } from "./urls";

type MediaRow = {
  id: string;
  filename: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  uploadedAt: Date | string;
  caption?: string | null;
  eventId?: string | null;
  exifData?: unknown;
  latitude?: number | null;
  longitude?: number | null;
  likeCount?: number | null;
  thumbnailS3Key?: string | null;
  canDelete?: boolean;
  suggestedMention?: boolean;
  suggestionId?: string;
  canConfirmSuggestion?: boolean;
  apiKeyId?: string | null;
  apiKey?: { id: string; name: string | null } | null;
  event?: {
    id: string;
    name: string;
    slug: string;
    visibility?: string;
  } | null;
  uploadedBy?: {
    id: string;
    preferredName?: string | null;
    name?: string | null;
    handle?: string | null;
    slackId?: string | null;
    isGlobalAdmin?: boolean;
  } | null;
};

export function slimExifData(
  exifData: unknown,
): Record<string, unknown> | null {
  if (!exifData || typeof exifData !== "object") return null;
  const exif = exifData as Record<string, unknown>;
  const dateTimeOriginal = exif.DateTimeOriginal ?? exif.dateTimeOriginal;
  if (dateTimeOriginal == null) return null;
  return { DateTimeOriginal: dateTimeOriginal };
}

function hasThumbnail(item: MediaRow) {
  return Boolean(item.thumbnailS3Key) || item.mimeType.startsWith("image/");
}

export function toClientMedia(
  item: MediaRow,
  options: { stripLocation?: boolean } = {},
): MediaItem {
  const isImage = item.mimeType.startsWith("image/");
  const visibility = item.event?.visibility as
    | "public"
    | "unlisted"
    | "auth_required"
    | undefined;
  return {
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    width: item.width ?? null,
    height: item.height ?? null,
    duration: item.duration ?? null,
    uploadedAt:
      item.uploadedAt instanceof Date
        ? item.uploadedAt
        : new Date(item.uploadedAt),
    caption: item.caption ?? null,
    eventId: item.eventId ?? undefined,
    exifData: slimExifData(item.exifData),
    latitude: options.stripLocation ? undefined : (item.latitude ?? null),
    longitude: options.stripLocation ? undefined : (item.longitude ?? null),
    likeCount: item.likeCount ?? 0,
    canDelete: item.canDelete,
    suggestedMention: item.suggestedMention,
    suggestionId: item.suggestionId,
    canConfirmSuggestion: item.canConfirmSuggestion,
    apiKeyId: item.apiKeyId ?? null,
    apiKey: item.apiKey ?? null,
    thumbnailUrl: hasThumbnail(item)
      ? getMediaThumbnailUrl(item.id, "sm")
      : null,
    thumbnailAvifUrl: hasThumbnail(item)
      ? getMediaThumbnailUrl(item.id, "sm", "avif")
      : null,
    displayUrl: isImage ? getMediaDisplayUrl(item.id) : null,
    displayAvifUrl: isImage ? getMediaDisplayUrl(item.id, "avif") : null,
    event: item.event
      ? {
          id: item.event.id,
          name: item.event.name,
          slug: item.event.slug,
          ...(visibility ? { visibility } : {}),
        }
      : undefined,
    uploadedBy: item.uploadedBy
      ? toPublicUser({
          id: item.uploadedBy.id,
          handle: item.uploadedBy.handle,
          preferredName: item.uploadedBy.preferredName ?? item.uploadedBy.name,
          slackId: item.uploadedBy.slackId,
          isGlobalAdmin: item.uploadedBy.isGlobalAdmin,
        })
      : {
          id: "",
          name: "Unknown",
          handle: null,
          slackId: null,
          avatarUrl: null,
        },
  };
}
