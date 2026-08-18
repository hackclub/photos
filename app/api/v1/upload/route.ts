import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { unauthorizedResponse, validateApiKey } from "@/lib/auth-api";
import { withDirectUploadSlot } from "@/lib/concurrency";
import { db } from "@/lib/db";
import {
  eventParticipants,
  events,
  media,
  mediaTags,
  pendingMediaOwnership,
  tags,
  users,
} from "@/lib/db/schema";
import { queueMediaForFaceIndexing } from "@/lib/face-indexing";
import { logger } from "@/lib/logger";
import { extractExifData, resolveTrustedDate } from "@/lib/media/exif";
import { uploadToS3 } from "@/lib/media/s3";
import {
  deleteMediaAndThumbnail,
  generateAndUploadThumbnail,
  processImageUpload,
} from "@/lib/media/thumbnail";
import {
  isUnsupportedImageBuffer,
  validateMediaFile,
} from "@/lib/media/validation";
import { extractVideoMetadata } from "@/lib/media/video-metadata";
import { PENDING_REGISTRATION_USER_ID } from "@/lib/pending-ownership";
import { can, getUserContext } from "@/lib/policy";
import { publicMedia } from "@/lib/public-data";
import { isValidSlackId, normalizeSlackId } from "@/lib/slack-id";
import { checkStorageLimit } from "@/lib/storage";

// Vercel rejects request bodies above 4.5 MB before this route executes.
const MAX_DIRECT_API_UPLOAD_BYTES = 4 * 1024 * 1024;

function safeFileExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  return /^[a-z0-9]{1,12}$/.test(ext) ? ext : "bin";
}

function parseJsonObject(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseTagNames(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => /^[a-z0-9][a-z0-9 -]{0,38}[a-z0-9]$/.test(tag)),
    ),
  ).slice(0, 25);
}

async function handlePost(req: NextRequest) {
  try {
    const auth = await validateApiKey(true);
    if (!auth) {
      return unauthorizedResponse();
    }
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (!contentLength) {
      return NextResponse.json(
        { error: "Content-Length is required" },
        { status: 411 },
      );
    }
    if (contentLength > MAX_DIRECT_API_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Direct API uploads are limited to 4MB on Vercel" },
        { status: 413 },
      );
    }
    const { user, apiKeyId, apiKeyName, isAdminApiKey } = auth;
    if (!user) {
      logger.error("API Key validated but no user found", { apiKeyId });
      return NextResponse.json(
        { error: "User not found for API key" },
        { status: 401 },
      );
    }
    const formData: any = await req.formData();
    const exifJson = formData.get("exif");
    if (exifJson) {
    }
    if (!formData.get("eventId")) {
      const lastJoinedEvent = await db.query.eventParticipants.findFirst({
        where: eq(eventParticipants.userId, user.id),
        orderBy: [desc(eventParticipants.joinedAt)],
        with: {
          event: true,
        },
      });
      if (lastJoinedEvent?.event) {
        formData.append("eventId", lastJoinedEvent.event.id);
      } else {
        const lastCreatedEvent = await db.query.events.findFirst({
          where: eq(events.createdById, user.id),
          orderBy: [desc(events.createdAt)],
        });
        if (lastCreatedEvent) {
          formData.append("eventId", lastCreatedEvent.id);
        } else {
          return NextResponse.json(
            { error: "Event ID is required and no default event found" },
            { status: 400 },
          );
        }
      }
    }
    const eventId = formData.get("eventId") as string;
    const file = formData.get("file") as File;
    const uploadAsUserId = formData.get("uploadedById") as string | null;
    const metadata = parseJsonObject(formData.get("metadata"));
    const tagNames = parseTagNames(formData.get("tags"));
    const globalAdminOnlyDelete =
      formData.get("globalAdminOnlyDelete") === "true" ||
      formData.get("globalAdminOnlyDelete") === "1";
    if (globalAdminOnlyDelete && !isAdminApiKey) {
      return NextResponse.json(
        { error: "Admin API key required for global-admin-only delete" },
        { status: 403 },
      );
    }
    if (!eventId || !file) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }
    const validation = validateMediaFile(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    if (file.size > MAX_DIRECT_API_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Direct API uploads are limited to 4MB on Vercel" },
        { status: 413 },
      );
    }
    const ctx = await getUserContext(user.id);
    const canUpload =
      isAdminApiKey || (await can(ctx, "upload", "event", eventId));
    if (!canUpload) {
      return NextResponse.json(
        { error: "Not a participant or admin" },
        { status: 403 },
      );
    }
    let uploadedById = user.id;
    let pendingOwnerSlackId: string | null = null;
    let pendingOwnerHackclubId: string | null = null;
    if (uploadAsUserId) {
      if (!isAdminApiKey) {
        return NextResponse.json(
          { error: "Admin API key required for upload-as" },
          { status: 403 },
        );
      }
      if (/^[0-9a-f-]{36}$/i.test(uploadAsUserId)) {
        const targetUser = await db.query.users.findFirst({
          where: eq(users.id, uploadAsUserId),
          columns: { id: true, isBanned: true },
        });
        if (!targetUser || targetUser.isBanned) {
          return NextResponse.json(
            { error: "Upload-as user not found" },
            { status: 404 },
          );
        }
        uploadedById = targetUser.id;
      } else if (isValidSlackId(uploadAsUserId)) {
        const slackId = normalizeSlackId(uploadAsUserId);
        const targetUser = await db.query.users.findFirst({
          where: eq(users.slackId, slackId),
          columns: { id: true, isBanned: true },
        });
        if (targetUser?.isBanned) {
          return NextResponse.json(
            { error: "Upload-as user is banned" },
            { status: 404 },
          );
        }
        uploadedById = targetUser?.id ?? PENDING_REGISTRATION_USER_ID;
        pendingOwnerSlackId = targetUser ? null : slackId;
      } else {
        const hackclubId = uploadAsUserId.trim();
        if (!hackclubId || hackclubId.length > 200) {
          return NextResponse.json(
            {
              error:
                "uploadedById must be a user UUID, Slack user ID, or Hack Club ID",
            },
            { status: 400 },
          );
        }
        const targetUser = await db.query.users.findFirst({
          where: eq(users.hackclubId, hackclubId),
          columns: { id: true, isBanned: true },
        });
        if (targetUser?.isBanned) {
          return NextResponse.json(
            { error: "Upload-as user is banned" },
            { status: 404 },
          );
        }
        uploadedById = targetUser?.id ?? PENDING_REGISTRATION_USER_ID;
        pendingOwnerHackclubId = targetUser ? null : hackclubId;
      }
    }
    const storageCheck = isAdminApiKey
      ? { allowed: true }
      : await checkStorageLimit(uploadedById, file.size, ctx);
    if (!storageCheck.allowed) {
      return NextResponse.json(
        { error: "Storage limit exceeded" },
        { status: 403 },
      );
    }
    const bytes = await file.arrayBuffer();
    const originalBuffer = Buffer.from(bytes);
    if (isUnsupportedImageBuffer(originalBuffer)) {
      return NextResponse.json(
        {
          error:
            "Unsupported image format. Convert the file to JPEG before uploading.",
        },
        { status: 400 },
      );
    }
    const mimeType = file.type;
    const mediaId = randomUUID();
    const fileExtension = safeFileExtension(file.name);
    const s3Key = `media/${mediaId}/original.${fileExtension}`;
    const objectTags = {
      eventId,
      uploadedBy: uploadedById,
      uploadedVia: "api",
    };
    let thumbnailS3Key: string | null = null;
    let exifData: Record<string, unknown> | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let takenAt: Date | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    const uploadOriginalPromise = uploadToS3(
      originalBuffer,
      s3Key,
      mimeType,
      undefined,
      objectTags,
    );
    if (file.type.startsWith("image/")) {
      try {
        const originalExifResult = await extractExifData(
          originalBuffer,
          mimeType,
        );
        if (originalExifResult) {
          exifData = { ...originalExifResult };
          takenAt = originalExifResult.dateTimeOriginal
            ? new Date(originalExifResult.dateTimeOriginal)
            : null;
          latitude = originalExifResult.gpsLatitude ?? null;
          longitude = originalExifResult.gpsLongitude ?? null;
        }
        const result = await processImageUpload(
          originalBuffer,
          mediaId,
          user.id,
          eventId,
          mimeType,
        );
        thumbnailS3Key = result.thumbnailS3Key;
        width = result.width ?? null;
        height = result.height ?? null;
        if (!exifData && result.exifBuffer) {
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
        logger.error("Image processing error:", e);
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
          objectTags,
        );
      } catch (e) {
        logger.error("Video processing error:", e);
      }
    }
    try {
      await uploadOriginalPromise;
    } catch (error) {
      await deleteMediaAndThumbnail(s3Key, thumbnailS3Key);
      throw error;
    }
    let inserted: typeof media.$inferSelect;
    try {
      // Trust only plausible (>= 2015) capture dates; fall back to upload time.
      takenAt = resolveTrustedDate(takenAt, new Date());
      [inserted] = await db
        .insert(media)
        .values({
          id: mediaId,
          eventId,
          uploadedById,
          s3Key,
          s3Url: s3Key,
          thumbnailS3Key,
          filename: file.name,
          mimeType,
          fileSize: originalBuffer.length,
          exifData,
          metadata: {
            ...(metadata ?? {}),
            uploadedVia: "api",
            apiKeyId,
            apiKeyName,
            actingUserId: user.id,
            uploadAs: uploadedById !== user.id,
            pendingOwnerSlackId,
            pendingOwnerHackclubId,
            globalAdminOnlyDelete,
          },
          globalAdminOnlyDelete,
          width,
          height,
          duration: (exifData?.duration as number | undefined) ?? null,
          takenAt,
          latitude,
          longitude,
          apiKeyId,
        })
        .returning();
    } catch (error) {
      await deleteMediaAndThumbnail(s3Key, thumbnailS3Key);
      throw error;
    }
    if (pendingOwnerSlackId || pendingOwnerHackclubId) {
      try {
        await db.insert(pendingMediaOwnership).values({
          mediaId: inserted.id,
          slackId: pendingOwnerSlackId,
          hackclubId: pendingOwnerHackclubId,
          showPlaceholder: true,
          previousOwnerId: user.id,
          createdById: user.id,
        });
      } catch (error) {
        await deleteMediaAndThumbnail(s3Key, thumbnailS3Key);
        await db.delete(media).where(eq(media.id, inserted.id));
        throw error;
      }
    }
    if (tagNames.length > 0) {
      await db
        .insert(tags)
        .values(tagNames.map((name) => ({ name })))
        .onConflictDoNothing();
      const tagRows = await db.query.tags.findMany({
        where: inArray(tags.name, tagNames),
        columns: { id: true },
      });
      if (tagRows.length > 0) {
        await db
          .insert(mediaTags)
          .values(
            tagRows.map((tag) => ({ mediaId: inserted.id, tagId: tag.id })),
          )
          .onConflictDoNothing();
      }
    }
    try {
      const { broadcastNewPhoto } = await import("@/app/api/feed/stream/route");
      broadcastNewPhoto(inserted.id).catch((error) => {
        logger.error("Failed to broadcast new photo:", error);
      });
    } catch (error) {
      logger.error("Failed to broadcast new photo:", error);
    }
    try {
      const { notifyUploadForFeed } = await import("@/lib/slack-notifications");
      notifyUploadForFeed(inserted.id).catch((error) => {
        logger.error("Failed to enqueue Slack feed notification:", error);
      });
    } catch (error) {
      logger.error("Failed to load Slack feed notification:", error);
    }
    await auditLog(user.id, "upload", "media", inserted.id, {
      eventId,
      filename: file.name,
      viaApiKey: true,
      apiKeyId,
      apiKeyName,
      isAdminApiKey,
      uploadedById,
      uploadAs: uploadedById !== user.id,
      pendingOwnerSlackId,
      pendingOwnerHackclubId,
      globalAdminOnlyDelete,
      tags: tagNames,
    });
    await queueMediaForFaceIndexing(inserted.id).catch((error) => {
      logger.error("Failed to queue face indexing:", error);
    });
    revalidatePath(`/events/${eventId}`);
    return NextResponse.json({
      success: true,
      media: publicMedia(inserted),
      tags: tagNames,
    });
  } catch (error) {
    logger.error("API upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    return await withDirectUploadSlot(() => handlePost(req), req.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload rejected";
    return NextResponse.json(
      { error: message },
      { status: req.signal.aborted ? 499 : 503 },
    );
  }
}
