"use server";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventParticipants, events, media, series } from "@/lib/db/schema";
import { extractExifData } from "@/lib/media/exif";
import { deleteFromS3, getMediaProxyUrl, uploadToS3 } from "@/lib/media/s3";
import {
  deleteMediaAndThumbnail,
  generateAndUploadThumbnail,
  processBanner,
  processImageUpload,
} from "@/lib/media/thumbnail";
import { validateBannerFile, validateMediaFile } from "@/lib/media/validation";
import { extractVideoMetadata } from "@/lib/media/video-metadata";
import { can, getUserContext } from "@/lib/policy";
import { checkStorageLimit } from "@/lib/storage";
export async function uploadBanner(
  entityType: "event" | "series",
  entityId: string,
  formData: FormData,
) {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Unauthorized" };
    const user = await getUserContext(session.id);
    if (!user) return { success: false, error: "Unauthorized" };
    const table = entityType === "event" ? events : series;
    const entity =
      entityType === "event"
        ? await db.query.events.findFirst({
            where: eq(events.id, entityId),
          })
        : await db.query.series.findFirst({
            where: eq(series.id, entityId),
          });
    if (!entity) return { success: false, error: `${entityType} not found` };
    if (!(await can(user, "update", entityType, entity))) {
      return { success: false, error: "Forbidden" };
    }
    const file = formData.get("banner") as File;
    if (!file) return { success: false, error: "No file provided" };
    const validation = validateBannerFile(file);
    if (!validation.valid) return { success: false, error: validation.error };
    const buffer = await processBanner(Buffer.from(await file.arrayBuffer()));
    const key = `${entityType === "event" ? "events" : "series"}/${entityId}/banner.jpg`;
    await uploadToS3(buffer, key, "image/jpeg", undefined, {
      [`${entityType}Id`]: entityId,
      uploadedBy: session.id,
    });
    revalidateTag(`s3-url-${key}`, "default");
    try {
      await db
        .update(table)
        .set({ bannerS3Key: key, updatedAt: new Date() })
        .where(eq(table.id, entityId));
    } catch (error) {
      await deleteFromS3(key);
      throw error;
    }
    await auditLog(user.id, "update", entityType, entityId, {
      action: "upload_banner",
    });
    revalidatePath(
      `/${entityType === "event" ? "events" : "series"}/${entityId}`,
    );
    revalidatePath(
      `/admin/${entityType === "event" ? "events" : "series"}/${entityId}/edit`,
    );
    return { success: true, bannerS3Key: key };
  } catch (error) {
    console.error(`Error uploading ${entityType} banner:`, error);
    return { success: false, error: "Failed to upload banner" };
  }
}
export async function deleteBanner(
  entityType: "event" | "series",
  entityId: string,
) {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Unauthorized" };
    const user = await getUserContext(session.id);
    if (!user) return { success: false, error: "Unauthorized" };
    const table = entityType === "event" ? events : series;
    const entity =
      entityType === "event"
        ? await db.query.events.findFirst({
            where: eq(events.id, entityId),
          })
        : await db.query.series.findFirst({
            where: eq(series.id, entityId),
          });
    if (!entity) return { success: false, error: `${entityType} not found` };
    if (!(await can(user, "update", entityType, entity))) {
      return { success: false, error: "Forbidden" };
    }
    if (entity.bannerS3Key) {
      try {
        await deleteMediaAndThumbnail(entity.bannerS3Key, null);
      } catch (error) {
        console.error("Failed to delete banner from S3:", error);
      }
    }
    await db
      .update(table)
      .set({ bannerS3Key: null, updatedAt: new Date() })
      .where(eq(table.id, entityId));
    await auditLog(user.id, "update", entityType, entityId, {
      action: "delete_banner",
    });
    revalidatePath(
      `/${entityType === "event" ? "events" : "series"}/${entityId}`,
    );
    revalidatePath(
      `/admin/${entityType === "event" ? "events" : "series"}/${entityId}/edit`,
    );
    return { success: true };
  } catch (error) {
    console.error(`Error deleting ${entityType} banner:`, error);
    return { success: false, error: "Failed to delete banner" };
  }
}
export async function uploadEventBanner(id: string, data: FormData) {
  return uploadBanner("event", id, data);
}

export async function uploadSeriesBanner(id: string, data: FormData) {
  return uploadBanner("series", id, data);
}

export async function deleteEventBanner(id: string) {
  return deleteBanner("event", id);
}

export async function deleteSeriesBanner(id: string) {
  return deleteBanner("series", id);
}
export async function getMediaUrls(
  mediaIdsOrId?: string | string[],
  s3Keys?: string[],
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    const urls: Record<string, string> = {};
    const mediaIdsToFetch = new Set<string>();
    const s3KeysToFetch = new Set<string>();
    if (mediaIdsOrId) {
      const ids = Array.isArray(mediaIdsOrId) ? mediaIdsOrId : [mediaIdsOrId];
      for (const id of ids) {
        mediaIdsToFetch.add(id);
      }
    }
    if (s3Keys) {
      for (const key of s3Keys) {
        s3KeysToFetch.add(key);
      }
    }
    if (mediaIdsToFetch.size === 0 && s3KeysToFetch.size === 0) {
      return { success: true, urls: {} };
    }
    const conditions = [];
    if (mediaIdsToFetch.size > 0) {
      conditions.push(inArray(media.id, Array.from(mediaIdsToFetch)));
    }
    if (s3KeysToFetch.size > 0) {
      conditions.push(inArray(media.s3Key, Array.from(s3KeysToFetch)));
      conditions.push(inArray(media.thumbnailS3Key, Array.from(s3KeysToFetch)));
    }
    const mediaItems = await db.query.media.findMany({
      where: or(...conditions),
      with: {
        event: true,
      },
    });
    const accessibleMedia = [];
    for (const item of mediaItems) {
      if (item.event) {
        if (await can(user, "view", "event", item.event)) {
          accessibleMedia.push(item);
        }
      }
    }
    await Promise.all(
      accessibleMedia.map(async (item) => {
        try {
          if (mediaIdsToFetch.has(item.id)) {
            if (
              item.mimeType === "image/heic" ||
              item.mimeType === "image/heif"
            ) {
              urls[item.id] = `/api/v1/view/${item.id}`;
            } else {
              const url = getMediaProxyUrl(item.id);
              urls[item.id] = url;
            }
            if (item.thumbnailS3Key) {
              const thumbUrl = getMediaProxyUrl(item.id, "thumbnail");
              urls[item.thumbnailS3Key] = thumbUrl;
            }
          }
          if (s3KeysToFetch.has(item.s3Key)) {
            const url = getMediaProxyUrl(item.id);
            urls[item.s3Key] = url;
          }
          if (item.thumbnailS3Key && s3KeysToFetch.has(item.thumbnailS3Key)) {
            const thumbUrl = getMediaProxyUrl(item.id, "thumbnail");
            urls[item.thumbnailS3Key] = thumbUrl;
          }
        } catch (e) {
          console.error(`Failed to sign URL for media ${item.id}`, e);
        }
      }),
    );
    return { success: true, urls };
  } catch (error) {
    console.error("Error generating media URLs:", error);
    return { success: false, error: "Failed to generate URLs" };
  }
}
export async function updateMediaCaption(mediaId: string, caption: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: "Unauthorized" };
    }
    const user = await getUserContext(session.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      columns: { uploadedById: true, eventId: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    const isOwner = mediaItem.uploadedById === user.id;
    const canManageEvent = await can(
      user,
      "manage",
      "event",
      mediaItem.eventId,
    );
    if (!isOwner && !canManageEvent) {
      return { success: false, error: "Forbidden" };
    }
    await db
      .update(media)
      .set({ caption: caption || null })
      .where(eq(media.id, mediaId));
    await auditLog(user.id, "update", "media", mediaId, {
      action: "update_caption",
    });
    revalidatePath(`/events`);
    return { success: true };
  } catch (error) {
    console.error("Error updating caption:", error);
    return { success: false, error: "Failed to update caption" };
  }
}
export async function uploadMedia(formData: FormData) {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: "Unauthorized" };
    }
    const user = await getUserContext(session.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const eventId = formData.get("eventId") as string;
    const file = formData.get("file") as File;
    if (!eventId || !file) {
      return { success: false, error: "Missing required fields" };
    }
    const validation = validateMediaFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });
    if (!event) {
      return { success: false, error: "Event not found" };
    }
    const participant = await db.query.eventParticipants.findFirst({
      where: and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.userId, user.id),
      ),
    });
    const isAdmin = await can(user, "manage", "event", event);
    if (!participant && !isAdmin) {
      return { success: false, error: "Not a participant or admin" };
    }
    const storageCheck = await checkStorageLimit(user.id, file.size);
    if (!storageCheck.allowed) {
      const remainingGB = (
        (storageCheck.limit - storageCheck.currentUsage) /
        (1024 * 1024 * 1024)
      ).toFixed(2);
      return {
        success: false,
        error: `Hey sorry, this would exceed your storage limit (${remainingGB}GB remaining). Tell us why you need more storage and we'll give you more! This is no hard limit, we just want to prevent abuse of this service. Valid reason = upgrade :)`,
      };
    }
    const bytes = await file.arrayBuffer();
    const originalBuffer = Buffer.from(bytes);
    const buffer = originalBuffer;
    const mimeType = file.type;
    const mediaId = randomUUID();
    const fileExtension = file.name.split(".").pop() || "bin";
    const s3Key = `media/${mediaId}/original.${fileExtension}`;
    const tags = {
      eventId,
      uploadedBy: session.id,
    };
    await uploadToS3(buffer, s3Key, mimeType, undefined, tags);
    let thumbnailS3Key: string | null = null;
    let exifData: Record<string, unknown> | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let takenAt: Date | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (file.type.startsWith("image/")) {
      try {
        const result = await processImageUpload(
          originalBuffer,
          mediaId,
          session.id,
          eventId,
          mimeType,
        );
        thumbnailS3Key = result.thumbnailS3Key;
        width = result.width;
        height = result.height;
        if (result.exifBuffer) {
          const exifResult = await extractExifData(result.exifBuffer, mimeType);
          if (exifResult) {
            exifData = {
              ...exifResult,
            };
            takenAt = exifResult.dateTimeOriginal
              ? new Date(exifResult.dateTimeOriginal)
              : null;
            latitude = exifResult.gpsLatitude ?? null;
            longitude = exifResult.gpsLongitude ?? null;
          }
        }
      } catch (e) {
        console.error("Image processing error:", e);
      }
    } else if (file.type.startsWith("video/")) {
      try {
        const meta = await extractVideoMetadata(originalBuffer);
        if (meta) {
          width = meta.width ?? null;
          height = meta.height ?? null;
          takenAt = meta.creationTime ? new Date(meta.creationTime) : null;
          exifData = { duration: meta.duration, ...meta };
          latitude = meta.latitude ?? null;
          longitude = meta.longitude ?? null;
        }
        thumbnailS3Key = await generateAndUploadThumbnail(
          originalBuffer,
          file.type,
          mediaId,
          undefined,
          tags,
        );
      } catch (e) {
        console.error("Video processing error:", e);
      }
    }
    let inserted: typeof media.$inferSelect;
    try {
      [inserted] = await db
        .insert(media)
        .values({
          id: mediaId,
          eventId,
          uploadedById: session.id,
          s3Key,
          s3Url: s3Key,
          thumbnailS3Key,
          filename: file.name,
          mimeType,
          fileSize: buffer.length,
          exifData: exifData ? JSON.stringify(exifData) : null,
          width,
          height,
          takenAt,
          latitude,
          longitude,
        })
        .returning();
    } catch (error) {
      await deleteMediaAndThumbnail(s3Key, thumbnailS3Key);
      throw error;
    }
    try {
      const { broadcastNewPhoto } = await import("@/app/api/feed/stream/route");
      broadcastNewPhoto(inserted.id).catch(console.error);
    } catch (error) {
      console.error("Failed to broadcast new photo:", error);
    }
    await auditLog(user.id, "upload", "media", inserted.id, {
      eventId,
      filename: file.name,
    });
    revalidatePath(`/events/${eventId}`);
    return { success: true, media: inserted };
  } catch (error) {
    console.error("Upload error:", error);
    return { success: false, error: "Upload failed" };
  }
}
export async function getDownloadUrl(mediaId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: {
        event: true,
      },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (mediaItem.event) {
      if (!(await can(user, "view", "event", mediaItem.event))) {
        return { success: false, error: "Forbidden" };
      }
    }
    if (user) {
      await auditLog(user.id, "download", "media", mediaId);
    }
    const filename = mediaItem.filename;
    const encodedFilename = encodeURIComponent(filename)
      .replace(/['()]/g, escape)
      .replace(/\*/g, "%2A");
    const _contentDisposition = `attachment; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedFilename}`;
    const url = `/media/${mediaId}?download=true`;
    return { success: true, url };
  } catch (error) {
    console.error("Error getting download URL:", error);
    return { success: false, error: "Failed to get download URL" };
  }
}
export async function deleteMedia(mediaId: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: "Unauthorized" };
    }
    const user = await getUserContext(session.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (!(await can(user, "delete", "media", mediaItem))) {
      return { success: false, error: "Forbidden" };
    }
    await deleteMediaAndThumbnail(mediaItem.s3Key, mediaItem.thumbnailS3Key);
    await db.delete(media).where(eq(media.id, mediaId));
    await auditLog(user.id, "delete", "media", mediaId);
    try {
      const { reports } = await import("@/lib/db/schema");
      await db
        .update(reports)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          resolvedById: user.id,
          resolutionNotes: "Media was deleted",
        })
        .where(
          and(eq(reports.mediaId, mediaId), eq(reports.status, "pending")),
        );
    } catch (e) {
      console.error("Failed to auto-resolve reports for deleted media:", e);
    }
    revalidatePath(`/events/${mediaItem.eventId}`);
    revalidatePath("/users/[username]", "page");
    return { success: true };
  } catch (error) {
    console.error("Error deleting media:", error);
    return { success: false, error: "Failed to delete media" };
  }
}
