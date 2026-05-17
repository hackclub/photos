import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import ffmpeg from "fluent-ffmpeg";
import decode from "heic-decode";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import {
  durationMs,
  imageProcessingDuration,
  thumbnailGenerationDuration,
  traceAsync,
} from "@/lib/telemetry";
import { deleteFromS3, deleteFromS3Batch, uploadToS3 } from "./s3";
export async function processImageUpload(
  input: Readable | Buffer,
  mediaId: string,
  uploadedBy: string,
  eventId: string,
  mimeType?: string,
) {
  return await traceAsync(
    "media.image.process",
    { "media.mime_type": mimeType },
    async () => {
      const startedAt = Date.now();
      try {
        const result = await processImageUploadInternal(
          input,
          mediaId,
          uploadedBy,
          eventId,
          mimeType,
        );
        imageProcessingDuration.record(durationMs(startedAt), {
          status: "success",
          source: mimeType?.startsWith("image/") ? "image" : "unknown",
        });
        return result;
      } catch (error) {
        imageProcessingDuration.record(durationMs(startedAt), {
          status: "error",
          source: mimeType?.startsWith("image/") ? "image" : "unknown",
        });
        throw error;
      }
    },
  );
}

async function encodeJpegThumbnail(image: sharp.Sharp) {
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
      sharp(buffer, { failOn: "none", animated: true, limitInputPixels: false })
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
      sharp(buffer, { failOn: "none", limitInputPixels: false })
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
      sharp(buffer, { failOn: "none", limitInputPixels: false })
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
  const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
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
  const isHeic =
    mimeType?.toLowerCase() === "image/heic" ||
    mimeType?.toLowerCase() === "image/heif";
  if (isHeic) {
    let decoder: any = decode;
    if (
      typeof decoder !== "function" &&
      typeof decoder?.default === "function"
    ) {
      decoder = decoder.default;
    }
    const { width, height, data } = await decoder({
      buffer: new Uint8Array(buffer).buffer,
    });
    const thumbnailBuffer = await encodeJpegThumbnail(
      sharp(Buffer.from(data), { raw: { width, height, channels: 4 } }),
    );
    return { thumbnailBuffer, width, height, exifBuffer: buffer };
  }
  const image = sharp(buffer, { failOn: "none", limitInputPixels: false });
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
  const buffer = Buffer.isBuffer(input) ? input : await streamToBuffer(input);
  try {
    const { thumbnailBuffer, width, height, exifBuffer } =
      await generateImageThumbnailBuffer(buffer, mimeType);
    const thumbnailS3Key = await uploadThumbnail(thumbnailBuffer, mediaId, {
      uploadedBy,
      eventId,
    });
    return {
      thumbnailS3Key,
      width,
      height,
      exifBuffer,
    };
  } catch (error: any) {
    if (mimeType?.toLowerCase() !== "image/heic") {
      logger.info(
        "Sharp failed with unsupported format, attempting HEIC fallback...",
      );
      try {
        const { thumbnailBuffer, width, height, exifBuffer } =
          await generateImageThumbnailBuffer(buffer, "image/heic");
        const thumbnailS3Key = await uploadThumbnail(thumbnailBuffer, mediaId, {
          uploadedBy,
          eventId,
        });
        return { thumbnailS3Key, width, height, exifBuffer };
      } catch (heicError) {
        logger.error("HEIC fallback failed:", heicError);
      }
    }
    throw error;
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
  const startedAt = Date.now();
  const isVideo = mimeType.startsWith("video/");
  try {
    const result = await traceAsync(
      "media.thumbnail.generate",
      {
        "media.source": isVideo ? "video" : "image",
        "media.mime_type": mimeType,
      },
      async () => {
        if (signal?.aborted) {
          return null;
        }
        if (isVideo) {
          return await generateVideoThumbnail(
            input,
            mediaId,
            signal,
            tags,
            duration,
          );
        }
        if (typeof input === "string") {
          logger.error("Image thumbnail generation requires a Buffer input");
          return null;
        }
        const { thumbnailBuffer } = await generateImageThumbnailBuffer(
          input,
          mimeType,
        );
        if (signal?.aborted) {
          return null;
        }
        return await uploadThumbnail(thumbnailBuffer, mediaId, tags, signal);
      },
    );
    thumbnailGenerationDuration.record(durationMs(startedAt), {
      status: result ? "success" : "skipped",
      source: isVideo ? "video" : "image",
    });
    return result;
  } catch (error) {
    thumbnailGenerationDuration.record(durationMs(startedAt), {
      status: "error",
      source: isVideo ? "video" : "image",
    });
    logger.error("Image thumbnail generation error:", error);
    return null;
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
    const extractFrame = (timestamp: string) =>
      new Promise<void>((resolve, reject) => {
        const command = ffmpeg(inputPath);
        if (signal) {
          signal.addEventListener(
            "abort",
            () => {
              command.kill("SIGKILL");
              reject(new Error("Aborted"));
            },
            { once: true },
          );
        }
        command
          .screenshots({
            count: 1,
            folder: tempDir,
            filename: `${mediaId}-thumb.jpg`,
            timestamps: [timestamp],
          })
          .on("end", () => resolve())
          .on("error", (err) => {
            if (!signal?.aborted) reject(err);
          });
      });
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
      sharp(thumbnailBuffer),
    );
    if (signal?.aborted) return null;
    const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
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
  return await sharp(input)
    .rotate()
    .resize(2000, null, {
      withoutEnlargement: true,
    })
    .toFormat("jpeg", { quality: 80, mozjpeg: true })
    .toBuffer();
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
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
