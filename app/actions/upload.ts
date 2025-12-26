"use server";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { type ExifData, extractExifData } from "@/lib/media/exif";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  getSignedPartUrl,
  getSignedUploadUrl,
  s3Client,
} from "@/lib/media/s3";
import {
  generateAndUploadThumbnail,
  processImageUpload,
} from "@/lib/media/thumbnail";
import { validateMediaFile } from "@/lib/media/validation";
import { extractVideoMetadata } from "@/lib/media/video-metadata";
import { can, getUserContext } from "@/lib/policy";
import { checkStorageLimit } from "@/lib/storage";
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
    if (!(await can(user, "upload", "event", eventId))) {
      return {
        success: false,
        error: "Forbidden: You must be a participant or admin to upload",
      };
    }
    const validation = validateMediaFile({
      type: fileType,
      size: fileSize,
    } as File);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    const storageCheck = await checkStorageLimit(user.id, fileSize);
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
    const fileExtension = filename.split(".").pop() || "bin";
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
    console.error("Error generating presigned URL:", error);
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
    if (!(await can(user, "upload", "event", eventId))) {
      return { success: false, error: "Forbidden" };
    }
    const storageCheck = await checkStorageLimit(user.id, fileSize);
    if (!storageCheck.allowed) {
      return { success: false, error: "Storage limit exceeded" };
    }
    const mediaId = randomUUID();
    const fileExtension = filename.split(".").pop() || "bin";
    const s3Key = `media/${mediaId}/original.${fileExtension}`;
    const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
    const uploadId = await createMultipartUpload(s3Key, fileType);
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
    console.error("Error initiating multipart upload:", error);
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
    const urls = await Promise.all(
      partNumbers.map((partNumber) =>
        getSignedPartUrl(s3Key, uploadId, partNumber),
      ),
    );
    return { success: true, urls };
  } catch (error) {
    console.error("Error generating part URLs:", error);
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
    await completeMultipartUpload(s3Key, uploadId, parts);
    return { success: true };
  } catch (error) {
    console.error("Error completing multipart upload:", error);
    return { success: false, error: "Failed to complete upload" };
  }
}
export async function abortMultipart(s3Key: string, uploadId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) return { success: false, error: "Unauthorized" };
    await abortMultipartUpload(s3Key, uploadId);
    return { success: true };
  } catch (error) {
    console.error("Error aborting multipart upload:", error);
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
  },
  skipRevalidation = false,
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!(await can(user, "upload", "event", eventId))) {
      return { success: false, error: "Forbidden" };
    }
    let realFileSize = data.fileSize;
    let serverExifData = null;
    let thumbnailS3Key = data.thumbnailS3Key;
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: data.s3Key,
      });
      const s3Metadata = await s3Client.send(headCommand);
      if (s3Metadata.ContentLength) {
        realFileSize = s3Metadata.ContentLength;
      }
      if (data.mimeType.startsWith("image/")) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: data.s3Key,
          });
          const s3Object = await s3Client.send(getCommand);
          if (s3Object.Body) {
            const {
              thumbnailS3Key: generatedKey,
              width,
              height,
              exifBuffer,
            } = await processImageUpload(
              s3Object.Body as Readable,
              mediaId,
              user.id,
              eventId,
              data.mimeType,
            );
            if (generatedKey) {
              thumbnailS3Key = generatedKey;
            }
            let exifResult = null;
            if (exifBuffer) {
              exifResult = await extractExifData(exifBuffer, data.mimeType);
            }
            serverExifData = {
              ...(exifResult || {}),
              width: width || exifResult?.width,
              height: height || exifResult?.height,
            };
          }
        } catch (e) {
          console.error("Failed to process image server-side:", e);
        }
      } else if (data.mimeType.startsWith("video/")) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: data.s3Key,
          });
          const s3Object = await s3Client.send(getCommand);
          if (s3Object.Body) {
            const { writeFile, unlink } = await import("node:fs/promises");
            const { join } = await import("node:path");
            const { tmpdir } = await import("node:os");
            const { Readable: _Readable } = await import("node:stream");
            const tempFilePath = join(tmpdir(), `video-${mediaId}.tmp`);
            const stream = s3Object.Body as NodeJS.ReadableStream;
            await writeFile(tempFilePath, stream);
            try {
              const metadataPromise = extractVideoMetadata(tempFilePath);
              const thumbnailPromise = generateAndUploadThumbnail(
                tempFilePath,
                data.mimeType,
                mediaId,
                undefined,
                { uploadedBy: user.id, eventId },
                undefined,
              );
              const [videoMetadata, generatedThumbnailKey] = await Promise.all([
                metadataPromise,
                thumbnailPromise,
              ]);
              if (videoMetadata) {
                serverExifData = {
                  width: videoMetadata.width,
                  height: videoMetadata.height,
                  dateTimeOriginal: videoMetadata.creationTime,
                  duration: videoMetadata.duration,
                  make: videoMetadata.make,
                  model: videoMetadata.model,
                  gpsLatitude: videoMetadata.latitude,
                  gpsLongitude: videoMetadata.longitude,
                };
              }
              if (generatedThumbnailKey) {
                thumbnailS3Key = generatedThumbnailKey;
              }
            } finally {
              await unlink(tempFilePath).catch(() => {});
            }
          }
        } catch (e) {
          console.error("Failed to process video server-side:", e);
        }
      }
    } catch (error) {
      console.error("Failed to verify S3 object:", error);
      return {
        success: false,
        error: "Upload verification failed: File not found in storage",
      };
    }
    const finalExifData = serverExifData || data.exifData;
    const takenAt = serverExifData?.dateTimeOriginal
      ? new Date(serverExifData.dateTimeOriginal)
      : data.takenAt
        ? new Date(data.takenAt)
        : null;
    const latitude = finalExifData?.gpsLatitude ?? null;
    const longitude = finalExifData?.gpsLongitude ?? null;
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
        exifData: finalExifData ? JSON.stringify(finalExifData) : null,
        width: serverExifData?.width || data.width,
        height: serverExifData?.height || data.height,
        latitude,
        longitude,
        takenAt: takenAt,
      })
      .returning();
    await auditLog(user.id, "upload", "media", insertedMedia.id, {
      eventId,
      filename: data.filename,
    });
    try {
      const { broadcastNewPhoto } = await import("@/app/api/feed/stream/route");
      broadcastNewPhoto(insertedMedia.id).catch(console.error);
    } catch (error) {
      console.error("Failed to broadcast new photo:", error);
    }
    if (!skipRevalidation) {
      try {
        const { revalidatePath } = await import("next/cache");
        revalidatePath(`/events/${eventId}`);
      } catch (e) {
        console.error("Revalidation failed", e);
      }
    }
    return { success: true, media: insertedMedia };
  } catch (error) {
    console.error("Error finalizing upload:", error);
    return { success: false, error: "Failed to finalize upload" };
  }
}
