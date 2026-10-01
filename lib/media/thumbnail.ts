import type { Readable } from "node:stream";
import { logger } from "@/lib/logger";
import sharp, {
  createSharp,
  MAX_BUFFERED_IMAGE_BYTES,
  withImageProcessingSlot,
} from "@/lib/media/image-processing";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validation";
import { deleteFromS3, deleteFromS3Batch, uploadToS3 } from "./s3";

export const THUMBNAIL_SIZE = 400;
export const THUMBNAIL_SM_SIZE = 320;
export const DISPLAY_LG_SIZE = 1600;

export function getThumbnailS3Key(mediaId: string) {
  return `media/${mediaId}/thumbnail.jpg`;
}

export type ThumbnailDerivativeKind = "thumb-sm" | "display";
export type ThumbnailDerivativeFormat = "jpg" | "avif";

const DERIVATIVE_SOURCE_TAGS = ["none", "pending", "approved", "rejected"];

export function getDerivativeSourceTag(blurStatus?: string | null) {
  const tag = (blurStatus ?? "none").toLowerCase().replace(/[^a-z0-9]/g, "");
  return tag || "none";
}

export function getThumbnailDerivativeS3Key(
  mediaId: string,
  kind: ThumbnailDerivativeKind,
  sourceTag: string,
  format: ThumbnailDerivativeFormat = "jpg",
) {
  return `media/${mediaId}/${kind}-${sourceTag}.${format}`;
}

export function getThumbnailDerivativeS3Keys(mediaId: string) {
  const keys: string[] = [];
  for (const tag of DERIVATIVE_SOURCE_TAGS) {
    keys.push(getThumbnailDerivativeS3Key(mediaId, "thumb-sm", tag));
    keys.push(getThumbnailDerivativeS3Key(mediaId, "thumb-sm", tag, "avif"));
    keys.push(getThumbnailDerivativeS3Key(mediaId, "display", tag));
    keys.push(getThumbnailDerivativeS3Key(mediaId, "display", tag, "avif"));
  }
  return keys;
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

async function buildRobustImageThumbnail(
  buffer: Buffer,
  size = THUMBNAIL_SIZE,
  quality = 76,
) {
  const attempts = [
    () =>
      createSharp(buffer, { failOn: "none" })
        .rotate()
        .flatten({ background: "#111111" })
        .resize(size, size, {
          fit: "cover",
          position: "attention",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .normalise()
        .jpeg({ quality, mozjpeg: true, progressive: true })
        .toBuffer(),
    () =>
      createSharp(buffer, { failOn: "none" })
        .rotate()
        .flatten({ background: "#111111" })
        .resize(size, size, {
          fit: "cover",
          position: "center",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .normalise()
        .jpeg({ quality, mozjpeg: true, progressive: true })
        .toBuffer(),
    () =>
      createSharp(buffer, { failOn: "none" })
        .flatten({ background: "#111111" })
        .resize(size, size, {
          fit: "cover",
          position: "center",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .jpeg({ quality, mozjpeg: true, progressive: true })
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

export async function buildDisplayImage(buffer: Buffer): Promise<Buffer> {
  return await createSharp(buffer, { failOn: "none" })
    .rotate()
    .resize(DISPLAY_LG_SIZE, DISPLAY_LG_SIZE, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .jpeg({ quality: 80, mozjpeg: true, progressive: true })
    .toBuffer();
}

export async function buildThumbnailAvif(buffer: Buffer): Promise<Buffer> {
  return await createSharp(buffer, { failOn: "none" })
    .rotate()
    .flatten({ background: "#111111" })
    .resize(THUMBNAIL_SM_SIZE, THUMBNAIL_SM_SIZE, {
      fit: "cover",
      position: "attention",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .avif({ quality: 55, effort: 4 })
    .toBuffer();
}

export async function buildDisplayAvif(buffer: Buffer): Promise<Buffer> {
  return await createSharp(buffer, { failOn: "none" })
    .rotate()
    .resize(DISPLAY_LG_SIZE, DISPLAY_LG_SIZE, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .avif({ quality: 60, effort: 4 })
    .toBuffer();
}

async function buildThumbnailDerivativeInternal(options: {
  mediaId: string;
  kind: ThumbnailDerivativeKind;
  sourceTag: string;
  sourceBuffer: Buffer;
  tags?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<string | null> {
  const { mediaId, kind, sourceTag, sourceBuffer, tags, signal } = options;
  const outputs: { key: string; buffer: Buffer; contentType: string }[] = [];
  if (kind === "display") {
    outputs.push({
      key: getThumbnailDerivativeS3Key(mediaId, "display", sourceTag),
      buffer: await buildDisplayImage(sourceBuffer),
      contentType: "image/jpeg",
    });
    if (signal?.aborted) return null;
    outputs.push({
      key: getThumbnailDerivativeS3Key(mediaId, "display", sourceTag, "avif"),
      buffer: await buildDisplayAvif(sourceBuffer),
      contentType: "image/avif",
    });
  } else {
    outputs.push({
      key: getThumbnailDerivativeS3Key(mediaId, "thumb-sm", sourceTag),
      buffer: await buildRobustImageThumbnail(
        sourceBuffer,
        THUMBNAIL_SM_SIZE,
        72,
      ),
      contentType: "image/jpeg",
    });
    if (signal?.aborted) return null;
    outputs.push({
      key: getThumbnailDerivativeS3Key(mediaId, "thumb-sm", sourceTag, "avif"),
      buffer: await buildThumbnailAvif(sourceBuffer),
      contentType: "image/avif",
    });
  }
  if (signal?.aborted) return null;
  for (const output of outputs) {
    await uploadToS3(
      output.buffer,
      output.key,
      output.contentType,
      signal,
      tags,
    );
  }
  return outputs[0].key;
}

export async function generateThumbnailDerivative(options: {
  mediaId: string;
  kind: ThumbnailDerivativeKind;
  sourceTag: string;
  sourceBuffer: Buffer;
  tags?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<string | null> {
  const { mediaId, kind, sourceTag, signal } = options;
  const derivativeKey = getThumbnailDerivativeS3Key(mediaId, kind, sourceTag);
  const existing = pendingThumbnailGenerations.get(derivativeKey);
  if (existing) return await existing;
  const generation = (async () => {
    try {
      return await withImageProcessingSlot(
        () => buildThumbnailDerivativeInternal(options),
        signal,
      );
    } catch (error) {
      logger.warn({ mediaId, derivativeKey }, "Derivative generation failed");
      logger.error(error);
      return null;
    }
  })();
  pendingThumbnailGenerations.set(derivativeKey, generation);
  try {
    return await generation;
  } finally {
    if (pendingThumbnailGenerations.get(derivativeKey) === generation) {
      pendingThumbnailGenerations.delete(derivativeKey);
    }
  }
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
  await buildThumbnailDerivativeInternal({
    mediaId,
    kind: "thumb-sm",
    sourceTag: "none",
    sourceBuffer: thumbnailBuffer,
    tags: { uploadedBy, eventId },
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
  const keyParts = s3Key.split("/");
  const mediaId =
    keyParts.length >= 3 && keyParts[0] === "media" ? keyParts[1] : null;
  const derivativeKeys =
    mediaId && /^[0-9a-f-]{36}$/i.test(mediaId)
      ? getThumbnailDerivativeS3Keys(mediaId)
      : [];
  for (const key of new Set(
    [thumbnailS3Key, ...relatedS3Keys, ...derivativeKeys].filter(
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
      ...getThumbnailDerivativeS3Keys(item.id),
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
