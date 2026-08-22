"use server";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
} from "@aws-sdk/client-s3";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { queueMediaForFaceIndexing } from "@/lib/face-indexing";
import { logger } from "@/lib/logger";
import {
  type ExifData,
  extractExifData,
  resolveTrustedDate,
} from "@/lib/media/exif";
import {
  MAX_BUFFERED_IMAGE_BYTES,
  withMediaBufferingSlot,
  withVideoStagingSlot,
} from "@/lib/media/image-processing";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteFromS3,
  getSignedPartUrl,
  getSignedUploadUrl,
  S3_BUCKET_NAME,
  s3Client,
} from "@/lib/media/s3";
import { getThumbnailS3Key, processImageUpload } from "@/lib/media/thumbnail";
import {
  isUnsupportedImageBuffer,
  validateMediaFile,
} from "@/lib/media/validation";
import { extractVideoMetadataFromS3Key } from "@/lib/media/video-metadata";
import {
  forgetMultipartSession,
  getMultipartSession,
  markMultipartSessionCompleted,
  rememberMultipartSession,
} from "@/lib/multipart-sessions";
import { can, getUserContext } from "@/lib/policy";
import { publicMedia } from "@/lib/public-data";
import { checkStorageLimit } from "@/lib/storage";

const MEDIA_KEY_PATTERN = /^media\/([0-9a-f-]{36})\/[A-Za-z0-9._-]+$/i;
const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
function getMediaIdFromKey(s3Key: string) {
  return MEDIA_KEY_PATTERN.exec(s3Key)?.[1] ?? null;
}

function safeFileExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  return /^[a-z0-9]{1,12}$/.test(ext) ? ext : "bin";
}

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BUFFERED_IMAGE_BYTES) {
      stream.destroy(
        new Error("Image source exceeds the server processing limit"),
      );
      throw new Error("Image source exceeds the server processing limit");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}

function hasExifValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function mergeExifData(
  primary: ExifData | Record<string, unknown> | null | undefined,
  fallback: ExifData | Record<string, unknown> | null | undefined,
) {
  const merged: Record<string, unknown> = {};
  if (fallback) {
    for (const [key, value] of Object.entries(fallback)) {
      if (hasExifValue(value)) merged[key] = value;
    }
  }
  if (primary) {
    for (const [key, value] of Object.entries(primary)) {
      if (hasExifValue(value)) merged[key] = value;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

async function objectExists(key: string) {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      }),
    );
    return true;
  } catch (error: any) {
    if (error instanceof NotFound || error?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function storedObjectHasUnsupportedImageFormat(key: string) {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Range: "bytes=0-63",
    }),
  );
  if (!response.Body) throw new Error("S3 object had no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const body = response.Body as AsyncIterable<Uint8Array> & {
    destroy?: (error?: Error) => void;
  };
  for await (const chunk of body) {
    size += chunk.length;
    if (size > 64) {
      body.destroy?.(new Error("S3 range response exceeded limit"));
      throw new Error("S3 range response exceeded limit");
    }
    chunks.push(chunk);
  }
  return isUnsupportedImageBuffer(Buffer.concat(chunks, size));
}

export async function getPresignedUrl(
  eventId: string,
  filename: string,
  fileType: string,
  fileSize: number,
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!UUID_PATTERN.test(eventId)) {
      return { success: false, error: "Invalid event ID" };
    }
    if (!(await can(user, "upload", "event", eventId))) {
      return {
        success: false,
        error: "Forbidden: You must be a participant or admin to upload",
      };
    }
    const validation = validateMediaFile({
      type: fileType,
      size: fileSize,
      name: filename,
    });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    const storageCheck = await checkStorageLimit(user.id, fileSize, user);
    if (!storageCheck.allowed) {
      const remainingGB = (
        (storageCheck.limit - storageCheck.currentUsage) /
        (1024 * 1024 * 1024)
      ).toFixed(2);
      return {
        success: false,
        error: `Storage limit exceeded (${remainingGB}GB remaining). Please upgrade for more storage!`,
      };
    }
    const mediaId = randomUUID();
    const fileExtension = safeFileExtension(filename);
    const s3Key = `media/${mediaId}/original.${fileExtension}`;
    const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
    const [uploadUrl, thumbnailUploadUrl] = await Promise.all([
      getSignedUploadUrl(s3Key, fileType),
      getSignedUploadUrl(thumbnailS3Key, "image/jpeg"),
    ]);
    return {
      success: true,
      mediaId,
      uploadUrl,
      thumbnailUploadUrl,
      s3Key,
      thumbnailS3Key,
    };
  } catch (error) {
    logger.error("Error generating presigned URL:", error);
    return { success: false, error: "Failed to generate upload URL" };
  }
}
export async function initiateMultipartUpload(
  eventId: string,
  filename: string,
  fileType: string,
  fileSize: number,
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) return { success: false, error: "Unauthorized" };
    if (!UUID_PATTERN.test(eventId)) {
      return { success: false, error: "Invalid event ID" };
    }
    if (!(await can(user, "upload", "event", eventId))) {
      return { success: false, error: "Forbidden" };
    }
    const validation = validateMediaFile({
      type: fileType,
      size: fileSize,
      name: filename,
    });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    const storageCheck = await checkStorageLimit(user.id, fileSize, user);
    if (!storageCheck.allowed) {
      return { success: false, error: "Storage limit exceeded" };
    }
    const mediaId = randomUUID();
    const fileExtension = safeFileExtension(filename);
    const s3Key = `media/${mediaId}/original.${fileExtension}`;
    const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
    const uploadId = await createMultipartUpload(s3Key, fileType);
    try {
      await rememberMultipartSession(s3Key, uploadId, user.id, eventId);
    } catch (error) {
      await abortMultipartUpload(s3Key, uploadId).catch(() => {});
      throw error;
    }
    const thumbnailUploadUrl = await getSignedUploadUrl(
      thumbnailS3Key,
      "image/jpeg",
    );
    return {
      success: true,
      mediaId,
      uploadId,
      s3Key,
      thumbnailS3Key,
      thumbnailUploadUrl,
    };
  } catch (error) {
    logger.error("Error initiating multipart upload:", error);
    return { success: false, error: "Failed to initiate upload" };
  }
}
export async function getMultipartPresignedUrls(
  s3Key: string,
  uploadId: string,
  partNumbers: number[],
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) return { success: false, error: "Unauthorized" };
    if (!getMediaIdFromKey(s3Key)) {
      return { success: false, error: "Invalid upload key" };
    }
    const uploadSession = await getMultipartSession(s3Key, uploadId, user.id);
    if (!uploadSession) {
      return { success: false, error: "Invalid upload session" };
    }
    if (!(await can(user, "upload", "event", uploadSession.eventId))) {
      return { success: false, error: "Forbidden" };
    }
    if (
      partNumbers.length === 0 ||
      partNumbers.length > 100 ||
      partNumbers.some(
        (partNumber) =>
          !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000,
      )
    ) {
      return { success: false, error: "Invalid upload parts" };
    }
    const urls = await Promise.all(
      partNumbers.map((partNumber) =>
        getSignedPartUrl(s3Key, uploadId, partNumber),
      ),
    );
    return { success: true, urls };
  } catch (error) {
    logger.error("Error generating part URLs:", error);
    return { success: false, error: "Failed to generate part URLs" };
  }
}
export async function completeMultipart(
  s3Key: string,
  uploadId: string,
  parts: {
    ETag: string;
    PartNumber: number;
  }[],
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) return { success: false, error: "Unauthorized" };
    if (!getMediaIdFromKey(s3Key) || parts.length === 0) {
      return { success: false, error: "Invalid upload key" };
    }
    const uploadSession = await getMultipartSession(s3Key, uploadId, user.id);
    if (!uploadSession) {
      return { success: false, error: "Invalid upload session" };
    }
    if (!(await can(user, "upload", "event", uploadSession.eventId))) {
      return { success: false, error: "Forbidden" };
    }
    if (uploadSession.completedAt) return { success: true };
    try {
      await completeMultipartUpload(s3Key, uploadId, parts);
    } catch (error) {
      if (!(await objectExists(s3Key))) throw error;
    }
    await markMultipartSessionCompleted(s3Key, uploadId);
    return { success: true };
  } catch (error) {
    logger.error("Error completing multipart upload:", error);
    return { success: false, error: "Failed to complete upload" };
  }
}
export async function abortMultipart(s3Key: string, uploadId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) return { success: false, error: "Unauthorized" };
    if (!getMediaIdFromKey(s3Key)) {
      return { success: false, error: "Invalid upload key" };
    }
    const uploadSession = await getMultipartSession(s3Key, uploadId, user.id);
    if (!uploadSession) {
      return { success: false, error: "Invalid upload session" };
    }
    await abortMultipartUpload(s3Key, uploadId);
    await forgetMultipartSession(s3Key, uploadId);
    return { success: true };
  } catch (error) {
    logger.error("Error aborting multipart upload:", error);
    return { success: false, error: "Failed to abort upload" };
  }
}
export async function finalizeUpload(
  mediaId: string,
  eventId: string,
  data: {
    filename: string;
    fileSize: number;
    mimeType: string;
    width: number | null;
    height: number | null;
    takenAt: string | null;
    exifData: ExifData | null;
    s3Key: string;
    thumbnailS3Key: string | null;
    thumbnailFailed?: boolean;
    thumbnailError?: string | null;
  },
  skipRevalidation = false,
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!UUID_PATTERN.test(eventId) || !UUID_PATTERN.test(mediaId)) {
      return { success: false, error: "Invalid upload identity" };
    }
    if (!(await can(user, "upload", "event", eventId))) {
      return { success: false, error: "Forbidden" };
    }
    const validation = validateMediaFile({
      type: data.mimeType,
      size: data.fileSize,
      name: data.filename,
    });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    if (getMediaIdFromKey(data.s3Key) !== mediaId) {
      return { success: false, error: "Invalid upload key" };
    }
    if (
      data.thumbnailS3Key &&
      getMediaIdFromKey(data.thumbnailS3Key) !== mediaId
    ) {
      return { success: false, error: "Invalid thumbnail key" };
    }
    if (data.thumbnailFailed) {
      logger.warn(
        {
          mediaId,
          eventId,
          reason: data.thumbnailError,
          mimeType: data.mimeType,
        },
        "Client thumbnail generation failed; falling back to server processing",
      );
    }
    let realFileSize = data.fileSize;
    let serverExifData: Record<string, unknown> | null = null;
    let thumbnailS3Key = data.thumbnailS3Key;
    const canonicalThumbnailS3Key = getThumbnailS3Key(mediaId);
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: data.s3Key,
      });
      const s3Metadata = await s3Client.send(headCommand);
      if (s3Metadata.ContentLength) {
        realFileSize = s3Metadata.ContentLength;
      }
      if (await storedObjectHasUnsupportedImageFormat(data.s3Key)) {
        await deleteFromS3(data.s3Key).catch((deleteError) => {
          logger.error("Failed to delete rejected image upload:", deleteError);
        });
        for (const thumbnailKey of new Set(
          [data.thumbnailS3Key, canonicalThumbnailS3Key].filter(
            (key): key is string => Boolean(key),
          ),
        )) {
          await deleteFromS3(thumbnailKey).catch(() => {});
        }
        return {
          success: false,
          error:
            "Unsupported image format. Convert the file to JPEG before uploading.",
        };
      }
      if (realFileSize > data.fileSize + 1024 * 1024) {
        return { success: false, error: "Uploaded file size mismatch" };
      }
      const storageCheck = await checkStorageLimit(user.id, realFileSize, user);
      if (!storageCheck.allowed) {
        await deleteFromS3(data.s3Key).catch((deleteError) => {
          logger.error("Failed to delete over-quota upload:", deleteError);
        });
        if (data.thumbnailS3Key) {
          await deleteFromS3(data.thumbnailS3Key).catch((deleteError) => {
            logger.error("Failed to delete over-quota thumbnail:", deleteError);
          });
        }
        return { success: false, error: "Storage limit exceeded" };
      }
      if (data.thumbnailS3Key && !(await objectExists(data.thumbnailS3Key))) {
        thumbnailS3Key = null;
      }
      if (!thumbnailS3Key && (await objectExists(canonicalThumbnailS3Key))) {
        thumbnailS3Key = canonicalThumbnailS3Key;
      }
      if (data.mimeType.startsWith("image/")) {
        await withMediaBufferingSlot(async () => {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: S3_BUCKET_NAME,
              Key: data.s3Key,
            });
            const s3Object = await s3Client.send(getCommand);
            if (s3Object.Body) {
              const originalBuffer = await streamToBuffer(
                s3Object.Body as Readable,
              );
              const originalExif = await extractExifData(
                originalBuffer,
                data.mimeType,
              );
              serverExifData = mergeExifData(originalExif, data.exifData);
              if (originalExif) {
                serverExifData = mergeExifData(
                  {
                    ...serverExifData,
                    width: originalExif.width,
                    height: originalExif.height,
                  },
                  null,
                );
              }
              if (!serverExifData) {
                serverExifData = mergeExifData(data.exifData, null);
              }
              if (!thumbnailS3Key) {
                const imageResult = await processImageUpload(
                  originalBuffer,
                  mediaId,
                  user.id,
                  eventId,
                  data.mimeType,
                );
                if (imageResult.thumbnailS3Key) {
                  thumbnailS3Key = imageResult.thumbnailS3Key;
                }
                serverExifData = mergeExifData(
                  {
                    ...serverExifData,
                    width: imageResult.width || serverExifData?.width,
                    height: imageResult.height || serverExifData?.height,
                  },
                  data.exifData,
                );
              }
            }
          } catch (e) {
            logger.error("Failed to process image server-side:", e);
          }
        });
      } else if (data.mimeType.startsWith("video/")) {
        try {
          await withVideoStagingSlot(async () => {
            const videoMetadata = await extractVideoMetadataFromS3Key(
              data.s3Key,
            );
            if (videoMetadata) {
              serverExifData = {
                width: videoMetadata.width ?? undefined,
                height: videoMetadata.height ?? undefined,
                dateTimeOriginal: videoMetadata.creationTime,
                duration: videoMetadata.duration,
                make: videoMetadata.make,
                model: videoMetadata.model,
                gpsLatitude: videoMetadata.latitude,
                gpsLongitude: videoMetadata.longitude,
                codecName: videoMetadata.codecName,
                codecLongName: videoMetadata.codecLongName,
                pixelFormat: videoMetadata.pixelFormat,
                rotation: videoMetadata.rotation,
                frameRate: videoMetadata.frameRate,
                formatName: videoMetadata.formatName,
                formatLongName: videoMetadata.formatLongName,
                ...(videoMetadata.formatTags
                  ? { formatTags: videoMetadata.formatTags }
                  : {}),
                ...(videoMetadata.streamTags
                  ? { streamTags: videoMetadata.streamTags }
                  : {}),
              };
            }
          });
        } catch (e) {
          logger.error("Failed to process video server-side:", e);
        }
      }
    } catch (error) {
      logger.error("Failed to verify S3 object:", error);
      return {
        success: false,
        error: "Upload verification failed: File not found in storage",
      };
    }
    const finalExifData = mergeExifData(serverExifData, data.exifData);
    const dateValue =
      (finalExifData?.dateTimeOriginal as string | undefined) ?? data.takenAt;
    // Trust the exif capture date only if it's plausible (>= 2015),
    // otherwise fall back to the upload time.
    const takenAt = resolveTrustedDate(dateValue, new Date());
    const latitude = (finalExifData?.gpsLatitude as number | undefined) ?? null;
    const longitude =
      (finalExifData?.gpsLongitude as number | undefined) ?? null;
    const [insertedMedia] = await db
      .insert(media)
      .values({
        id: mediaId,
        eventId,
        uploadedById: user.id,
        s3Key: data.s3Key,
        s3Url: data.s3Key,
        thumbnailS3Key: thumbnailS3Key,
        filename: data.filename,
        mimeType: data.mimeType,
        fileSize: realFileSize,
        exifData: finalExifData,
        width: (finalExifData?.width as number | undefined) || data.width,
        height: (finalExifData?.height as number | undefined) || data.height,
        duration: (finalExifData?.duration as number | undefined) ?? null,
        latitude,
        longitude,
        takenAt: takenAt,
      })
      .returning();
    await auditLog(user.id, "upload", "media", insertedMedia.id, {
      eventId,
      filename: data.filename,
    });
    await queueMediaForFaceIndexing(insertedMedia.id).catch((error) => {
      logger.error("Failed to queue face indexing:", error);
    });
    try {
      const { broadcastNewPhoto } = await import("@/app/api/feed/stream/route");
      broadcastNewPhoto(insertedMedia.id).catch((error) => {
        logger.error("Failed to broadcast new photo:", error);
      });
    } catch (error) {
      logger.error("Failed to broadcast new photo:", error);
    }
    try {
      const { notifyUploadForFeed } = await import("@/lib/slack-notifications");
      notifyUploadForFeed(insertedMedia.id).catch((error) => {
        logger.error("Failed to enqueue Slack feed notification:", error);
      });
    } catch (error) {
      logger.error("Failed to load Slack feed notification:", error);
    }
    if (!skipRevalidation) {
      try {
        const { revalidatePath } = await import("next/cache");
        revalidatePath(`/events/${eventId}`);
      } catch (e) {
        logger.error("Revalidation failed", e);
      }
    }
    return { success: true, media: publicMedia(insertedMedia) };
  } catch (error) {
    logger.error("Error finalizing upload:", error);
    return { success: false, error: "Failed to finalize upload" };
  }
}
