import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { unauthorizedResponse, validateApiKey } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { eventParticipants, events, media } from "@/lib/db/schema";
import { extractExifData } from "@/lib/media/exif";
import { uploadToS3 } from "@/lib/media/s3";
import {
  deleteMediaAndThumbnail,
  generateAndUploadThumbnail,
  processImageUpload,
} from "@/lib/media/thumbnail";
import { validateMediaFile } from "@/lib/media/validation";
import { extractVideoMetadata } from "@/lib/media/video-metadata";
import { can, getUserContext } from "@/lib/policy";
import { checkStorageLimit } from "@/lib/storage";
export async function POST(req: NextRequest) {
  try {
    const auth = await validateApiKey(true);
    if (!auth) {
      return unauthorizedResponse();
    }
    const { user, apiKeyId, apiKeyName } = auth;
    if (!user) {
      console.error("API Key validated but no user found", { apiKeyId });
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
    if (!eventId || !file) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }
    const validation = validateMediaFile(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const ctx = await getUserContext(user.id);
    const canUpload = await can(ctx, "upload", "event", eventId);
    if (!canUpload) {
      return NextResponse.json(
        { error: "Not a participant or admin" },
        { status: 403 },
      );
    }
    const storageCheck = await checkStorageLimit(user.id, file.size);
    if (!storageCheck.allowed) {
      return NextResponse.json(
        { error: "Storage limit exceeded" },
        { status: 403 },
      );
    }
    const bytes = await file.arrayBuffer();
    const originalBuffer = Buffer.from(bytes);
    const mimeType = file.type;
    const mediaId = randomUUID();
    const fileExtension = file.name.split(".").pop() || "bin";
    const s3Key = `media/${mediaId}/original.${fileExtension}`;
    const tags = {
      eventId,
      uploadedBy: user.id,
    };
    await uploadToS3(originalBuffer, s3Key, mimeType, undefined, tags);
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
          user.id,
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
          uploadedById: user.id,
          s3Key,
          s3Url: s3Key,
          thumbnailS3Key,
          filename: file.name,
          mimeType,
          fileSize: originalBuffer.length,
          exifData: exifData ? JSON.stringify(exifData) : null,
          width,
          height,
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
    try {
      const { broadcastNewPhoto } = await import("@/app/api/feed/stream/route");
      broadcastNewPhoto(inserted.id).catch(console.error);
    } catch (error) {
      console.error("Failed to broadcast new photo:", error);
    }
    await auditLog(user.id, "upload", "media", inserted.id, {
      eventId,
      filename: file.name,
      viaApiKey: true,
      apiKeyId,
      apiKeyName,
    });
    revalidatePath(`/events/${eventId}`);
    return NextResponse.json({ success: true, media: inserted });
  } catch (error) {
    console.error("API upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
