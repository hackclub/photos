import type { Readable } from "node:stream";
import { logger } from "@/lib/logger";
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
      return null;
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

export async function deleteMediaAndThumbnail(
  s3Key: string,
  thumbnailS3Key: string | null,
  relatedS3Keys: (string | null | undefined)[] = [],
): Promise<void> {
  await deleteFromS3(s3Key);
  for (const key of new Set(
    [thumbnailS3Key, ...relatedS3Keys].filter(
      (value): value is string => Boolean(value) && value !== s3Key,
    ),
  )) {
    try {
      await deleteFromS3(key);
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
    originalS3Key?: string | null;
    originalThumbnailS3Key?: string | null;
    blurredS3Key?: string | null;
    blurredThumbnailS3Key?: string | null;
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
    for (const key of [
      item.thumbnailS3Key,
      item.originalS3Key,
      item.originalThumbnailS3Key,
      item.blurredS3Key,
      item.blurredThumbnailS3Key,
    ]) {
      if (key && key !== item.s3Key) keysToDelete.push(key);
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
