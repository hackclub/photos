import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import ffmpeg from "fluent-ffmpeg";
import decode from "heic-decode";
import sharp from "sharp";
import { deleteFromS3, deleteFromS3Batch, uploadToS3 } from "./s3";
export async function processImageUpload(
  input: Readable | Buffer,
  mediaId: string,
  uploadedBy: string,
  eventId: string,
  mimeType?: string,
) {
  const buffer = Buffer.isBuffer(input) ? input : await streamToBuffer(input);
  const isHeic =
    mimeType?.toLowerCase() === "image/heic" ||
    mimeType?.toLowerCase() === "image/heif";
  const processHeic = async () => {
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
    const thumbnailBuffer = await sharp(Buffer.from(data), {
      raw: { width, height, channels: 4 },
    })
      .resize(400, 400, {
        fit: "cover",
        position: "center",
      })
      .toFormat("jpeg", { quality: 80, mozjpeg: true })
      .toBuffer();
    const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
    await uploadToS3(thumbnailBuffer, thumbnailS3Key, "image/jpeg", undefined, {
      uploadedBy,
      eventId,
    });
    return {
      thumbnailS3Key,
      width,
      height,
      exifBuffer: buffer,
    };
  };
  if (isHeic) {
    try {
      return await processHeic();
    } catch (error) {
      console.error("Error processing HEIC image:", error);
    }
  }
  try {
    const pipeline = sharp(buffer);
    const metadataPromise = pipeline.metadata();
    const thumbnailPromise = pipeline
      .clone()
      .resize(400, 400, {
        fit: "cover",
        position: "center",
      })
      .toFormat("jpeg", { quality: 80, mozjpeg: true })
      .toBuffer()
      .then(async (buf) => {
        const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
        await uploadToS3(buf, thumbnailS3Key, "image/jpeg", undefined, {
          uploadedBy,
          eventId,
        });
        return thumbnailS3Key;
      });
    const [metadata, thumbnailS3Key] = await Promise.all([
      metadataPromise,
      thumbnailPromise,
    ]);
    return {
      thumbnailS3Key,
      width: metadata.width,
      height: metadata.height,
      exifBuffer: metadata.exif,
    };
  } catch (error: any) {
    if (
      !isHeic &&
      (error.message?.includes("unsupported image format") ||
        error.message?.includes(
          "Input buffer contains unsupported image format",
        ))
    ) {
      console.log(
        "Sharp failed with unsupported format, attempting HEIC fallback...",
      );
      try {
        return await processHeic();
      } catch (heicError) {
        console.error("HEIC fallback failed:", heicError);
        throw error;
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
  const isVideo = mimeType.startsWith("video/");
  if (signal?.aborted) {
    return null;
  }
  if (isVideo) {
    return await generateVideoThumbnail(input, mediaId, signal, tags, duration);
  }
  if (typeof input === "string") {
    console.error("Image thumbnail generation requires a Buffer input");
    return null;
  }
  try {
    let thumbnailBuffer: Buffer;
    const isHeic =
      mimeType.toLowerCase() === "image/heic" ||
      mimeType.toLowerCase() === "image/heif";
    if (isHeic) {
      let decoder: any = decode;
      if (
        typeof decoder !== "function" &&
        typeof decoder?.default === "function"
      ) {
        decoder = decoder.default;
      }
      const { width, height, data } = await decoder({
        buffer: new Uint8Array(input).buffer,
      });
      thumbnailBuffer = await sharp(Buffer.from(data), {
        raw: { width, height, channels: 4 },
      })
        .resize(400, 400, {
          fit: "cover",
          position: "center",
        })
        .toFormat("jpeg", { quality: 80, mozjpeg: true })
        .toBuffer();
    } else {
      thumbnailBuffer = await sharp(input)
        .resize(400, 400, {
          fit: "cover",
          position: "center",
        })
        .toFormat("jpeg", { quality: 80, mozjpeg: true })
        .toBuffer();
    }
    if (signal?.aborted) {
      return null;
    }
    const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
    await uploadToS3(
      thumbnailBuffer,
      thumbnailS3Key,
      "image/jpeg",
      signal,
      tags,
    );
    return thumbnailS3Key;
  } catch (error) {
    console.error("Image thumbnail generation error:", error);
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
    const processedThumbnail = await sharp(thumbnailBuffer)
      .resize(400, 400, {
        fit: "cover",
        position: "center",
      })
      .toFormat("jpeg", { quality: 80, mozjpeg: true })
      .toBuffer();
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
    console.error("Video thumbnail generation error:", error);
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
      console.error("Error cleaning up temp files:", cleanupError);
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
    console.error("Batch delete failed:", error);
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
