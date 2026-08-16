import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import ffmpeg from "fluent-ffmpeg";
import type { Sharp } from "sharp";
import { logger } from "@/lib/logger";
import { runFfmpegCommand } from "@/lib/media/ffmpeg";
import sharp, {
  createSharp,
  MAX_BUFFERED_IMAGE_BYTES,
  withImageProcessingSlot,
} from "@/lib/media/image-processing";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validation";
import { deleteFromS3, deleteFromS3Batch, uploadToS3 } from "./s3";

export function getThumbnailS3Key(mediaId: string) {
  return `media/${mediaId}/thumbnail.jpg`;
}

function isUnsupportedImageMimeType(mimeType?: string | null) {
  const normalized = mimeType?.split(";")[0]?.toLowerCase() ?? "";
  return (
    normalized.startsWith("image/") && !ALLOWED_IMAGE_TYPES.includes(normalized)
  );
}

export async function processImageUpload(
  input: Readable | Buffer,
  mediaId: string,
  uploadedBy: string,
  eventId: string,
  mimeType?: string,
) {
  return await withImageProcessingSlot(() =>
    processImageUploadInternal(input, mediaId, uploadedBy, eventId, mimeType),
  );
}

async function encodeJpegThumbnail(image: Sharp) {
  return await image
    .rotate()
    .resize(400, 400, {
      fit: "cover",
      position: "attention",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .flatten({ background: "#111111" })
    .normalise()
    .jpeg({ quality: 76, mozjpeg: true, progressive: true })
    .toBuffer();
}

async function buildRobustImageThumbnail(buffer: Buffer) {
  const attempts = [
    () =>
      createSharp(buffer, { failOn: "none" })
        .rotate()
        .flatten({ background: "#111111" })
        .resize(400, 400, {
          fit: "cover",
          position: "attention",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .normalise()
        .jpeg({ quality: 76, mozjpeg: true, progressive: true })
        .toBuffer(),
    () =>
      createSharp(buffer, { failOn: "none" })
        .rotate()
        .flatten({ background: "#111111" })
        .resize(400, 400, {
          fit: "cover",
          position: "center",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .normalise()
        .jpeg({ quality: 76, mozjpeg: true, progressive: true })
        .toBuffer(),
    () =>
      createSharp(buffer, { failOn: "none" })
        .flatten({ background: "#111111" })
        .resize(400, 400, {
          fit: "cover",
          position: "center",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .jpeg({ quality: 76, mozjpeg: true, progressive: true })
        .toBuffer(),
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not generate image thumbnail");
}

async function uploadThumbnail(
  thumbnailBuffer: Buffer,
  mediaId: string,
  tags?: Record<string, string>,
  signal?: AbortSignal,
) {
  const thumbnailS3Key = getThumbnailS3Key(mediaId);
  await uploadToS3(thumbnailBuffer, thumbnailS3Key, "image/jpeg", signal, tags);
  return thumbnailS3Key;
}

async function generateImageThumbnailBuffer(
  buffer: Buffer,
  mimeType?: string,
): Promise<{
  thumbnailBuffer: Buffer;
  width?: number;
  height?: number;
  exifBuffer?: Buffer;
}> {
  if (isUnsupportedImageMimeType(mimeType)) {
    throw new Error("Unsupported image format");
  }
  const image = createSharp(buffer, { failOn: "none" });
  const metadata = await image.metadata();
  const thumbnailBuffer = await buildRobustImageThumbnail(buffer);
  return {
    thumbnailBuffer,
    width: metadata.width,
    height: metadata.height,
    exifBuffer: metadata.exif,
  };
}

async function processImageUploadInternal(
  input: Readable | Buffer,
  mediaId: string,
  uploadedBy: string,
  eventId: string,
  mimeType?: string,
) {
  if (isUnsupportedImageMimeType(mimeType)) {
    throw new Error("Unsupported image format");
  }
  const buffer = Buffer.isBuffer(input) ? input : await streamToBuffer(input);
  if (buffer.length > MAX_BUFFERED_IMAGE_BYTES) {
    throw new Error("Image source exceeds the server processing limit");
  }
  const { thumbnailBuffer, width, height, exifBuffer } =
    await generateImageThumbnailBuffer(buffer, mimeType);
  const thumbnailS3Key = await uploadThumbnail(thumbnailBuffer, mediaId, {
    uploadedBy,
    eventId,
  });
  return { thumbnailS3Key, width, height, exifBuffer };
}
const thumbnailGlobal = globalThis as typeof globalThis & {
  __photosPendingThumbnailGenerations?: Map<string, Promise<string | null>>;
};
const pendingThumbnailGenerations =
  thumbnailGlobal.__photosPendingThumbnailGenerations ?? new Map();
thumbnailGlobal.__photosPendingThumbnailGenerations =
  pendingThumbnailGenerations;

async function generateAndUploadThumbnailInternal(
  input: Buffer | string,
  mimeType: string,
  mediaId: string,
  signal?: AbortSignal,
  tags?: Record<string, string>,
  duration?: number,
): Promise<string | null> {
  const isVideo = mimeType.startsWith("video/");
  if (isUnsupportedImageMimeType(mimeType)) {
    logger.warn({ mediaId, mimeType }, "Rejected unsupported thumbnail format");
    return null;
  }
  try {
    if (signal?.aborted) {
      return null;
    }
    if (isVideo) {
      return await withImageProcessingSlot(
        () => generateVideoThumbnail(input, mediaId, signal, tags, duration),
        signal,
      );
    }
    if (typeof input === "string") {
      logger.error("Image thumbnail generation requires a Buffer input");
      return null;
    }
    return await withImageProcessingSlot(async () => {
      const { thumbnailBuffer } = await generateImageThumbnailBuffer(
        input,
        mimeType,
      );
      if (signal?.aborted) return null;
      return await uploadThumbnail(thumbnailBuffer, mediaId, tags, signal);
    }, signal);
  } catch (error) {
    logger.error("Image thumbnail generation error:", error);
    return null;
  }
}

export async function generateAndUploadThumbnail(
  input: Buffer | string,
  mimeType: string,
  mediaId: string,
  signal?: AbortSignal,
  tags?: Record<string, string>,
  duration?: number,
): Promise<string | null> {
  const existing = pendingThumbnailGenerations.get(mediaId);
  if (existing) return await existing;

  const generation = generateAndUploadThumbnailInternal(
    input,
    mimeType,
    mediaId,
    signal,
    tags,
    duration,
  );
  pendingThumbnailGenerations.set(mediaId, generation);
  try {
    return await generation;
  } finally {
    if (pendingThumbnailGenerations.get(mediaId) === generation) {
      pendingThumbnailGenerations.delete(mediaId);
    }
  }
}

async function generateVideoThumbnail(
  input: Buffer | string,
  mediaId: string,
  signal?: AbortSignal,
  tags?: Record<string, string>,
  knownDuration?: number,
): Promise<string | null> {
  if (signal?.aborted) return null;
  const tempDir = path.join(os.tmpdir(), "video-thumbnails");
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }
  const tempVideoPath = path.join(tempDir, `${mediaId}-input.tmp`);
  const tempThumbnailPath = path.join(tempDir, `${mediaId}-thumb.jpg`);
  let inputPath = tempVideoPath;
  try {
    if (Buffer.isBuffer(input)) {
      await writeFile(tempVideoPath, input);
    } else {
      inputPath = input;
    }
    if (signal?.aborted) return null;
    let screenshotTimestamp = "00:00:01.000";
    const duration = knownDuration;
    if (duration !== undefined && duration < 1) {
      screenshotTimestamp = "00:00:00.000";
    }
    if (signal?.aborted) return null;
    const extractFrame = (timestamp: string) => {
      const command = ffmpeg(inputPath);
      return runFfmpegCommand(
        command,
        () => {
          command.screenshots({
            count: 1,
            folder: tempDir,
            filename: `${mediaId}-thumb.jpg`,
            timestamps: [timestamp],
          });
        },
        { signal },
      );
    };
    try {
      await extractFrame(screenshotTimestamp);
    } catch (error) {
      if (screenshotTimestamp !== "00:00:00.000") {
        await extractFrame("00:00:00.000");
      } else {
        throw error;
      }
    }
    if (signal?.aborted) return null;
    const { readFile } = await import("node:fs/promises");
    const thumbnailBuffer = await readFile(tempThumbnailPath);
    const processedThumbnail = await encodeJpegThumbnail(
      createSharp(thumbnailBuffer),
    );
    if (signal?.aborted) return null;
    const thumbnailS3Key = getThumbnailS3Key(mediaId);
    await uploadToS3(
      processedThumbnail,
      thumbnailS3Key,
      "image/jpeg",
      signal,
      tags,
    );
    return thumbnailS3Key;
  } catch (error) {
    logger.error("Video thumbnail generation error:", error);
    return null;
  } finally {
    try {
      if (Buffer.isBuffer(input) && existsSync(tempVideoPath)) {
        await unlink(tempVideoPath);
      }
      if (existsSync(tempThumbnailPath)) {
        await unlink(tempThumbnailPath);
      }
    } catch (cleanupError) {
      logger.error("Error cleaning up temp files:", cleanupError);
    }
  }
}
export async function deleteMediaAndThumbnail(
  s3Key: string,
  thumbnailS3Key: string | null,
): Promise<void> {
  await deleteFromS3(s3Key);
  if (thumbnailS3Key && thumbnailS3Key !== s3Key) {
    try {
      await deleteFromS3(thumbnailS3Key);
    } catch (_error) {}
  }
}
export async function processBanner(input: Buffer): Promise<Buffer> {
  if (input.length > MAX_BUFFERED_IMAGE_BYTES) {
    throw new Error("Banner source exceeds the server processing limit");
  }
  return await withImageProcessingSlot(() =>
    createSharp(input)
      .rotate()
      .resize(2000, null, {
        withoutEnlargement: true,
      })
      .toFormat("jpeg", { quality: 80, mozjpeg: true })
      .toBuffer(),
  );
}
export async function deleteBatchMedia(
  mediaItems: {
    id: string;
    s3Key: string;
    thumbnailS3Key: string | null;
  }[],
): Promise<{
  successfulIds: string[];
  hasErrors: boolean;
}> {
  if (mediaItems.length === 0) {
    return { successfulIds: [], hasErrors: false };
  }
  const keysToDelete: string[] = [];
  const ids: string[] = [];
  for (const item of mediaItems) {
    keysToDelete.push(item.s3Key);
    if (item.thumbnailS3Key && item.thumbnailS3Key !== item.s3Key) {
      keysToDelete.push(item.thumbnailS3Key);
    }
    ids.push(item.id);
  }
  try {
    await deleteFromS3Batch(keysToDelete);
    return { successfulIds: ids, hasErrors: false };
  } catch (error) {
    logger.error("Batch delete failed:", error);
    return { successfulIds: [], hasErrors: true };
  }
}
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BUFFERED_IMAGE_BYTES) {
      stream.destroy(
        new Error("Image source exceeds the server processing limit"),
      );
      throw new Error("Image source exceeds the server processing limit");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
