import {
  abortMultipart,
  completeMultipart,
  getMultipartPresignedUrls,
  initiateMultipartUpload,
} from "@/app/actions/upload";
import { logger } from "@/lib/logger";
import type { ExifData } from "./exif";
export interface UploadFile {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "uploading" | "processing" | "success" | "error";
  progress: number;
  error?: string;
  abortController?: AbortController;
  eventId: string;
}
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
];
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
];
export const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
export const MAX_CONCURRENT_UPLOADS = 6;
export const MAX_CONCURRENT_PROCESSING = 8;

const MAX_UPLOAD_ATTEMPTS = 4;
const THUMBNAIL_SIZE = 400;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Upload cancelled");
  }
}

function getConnectionProfile() {
  const nav = navigator as Navigator & {
    connection?: {
      downlink?: number;
    };
    deviceMemory?: number;
  };
  const connection = nav.connection;
  const lowEndDevice =
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 3) ||
    (navigator.hardwareConcurrency || 4) <= 4;
  const fastNetwork = (connection?.downlink ?? 0) >= 40;
  const cores = navigator.hardwareConcurrency || 4;
  return { lowEndDevice, fastNetwork, cores };
}

export function getAdaptiveUploadLimits() {
  const { lowEndDevice, fastNetwork, cores } = getConnectionProfile();
  if (lowEndDevice) {
    return { maxUploads: 3, maxProcessing: 3 };
  }
  if (fastNetwork && cores >= 8) {
    return { maxUploads: 8, maxProcessing: 8 };
  }
  if (cores >= 6) {
    return { maxUploads: 6, maxProcessing: 6 };
  }
  return { maxUploads: 4, maxProcessing: 4 };
}

function getAdaptiveMultipartSettings(fileSize: number) {
  const { lowEndDevice, fastNetwork, cores } = getConnectionProfile();
  if (lowEndDevice) {
    return { partSize: 16 * 1024 * 1024, concurrentParts: 3 };
  }
  if (fastNetwork && cores >= 8) {
    return {
      partSize:
        fileSize > 1024 * 1024 * 1024 ? 64 * 1024 * 1024 : 32 * 1024 * 1024,
      concurrentParts: 8,
    };
  }
  return {
    partSize:
      fileSize > 1024 * 1024 * 1024 ? 32 * 1024 * 1024 : 16 * 1024 * 1024,
    concurrentParts: Math.min(6, Math.max(3, cores)),
  };
}

export function uploadToPresignedUrl(
  url: string,
  file: File | Blob,
  contentType: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  attempt = 1,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abortUpload);
    };
    const fail = async (error: Error, retryable: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (retryable && attempt < MAX_UPLOAD_ATTEMPTS && !signal?.aborted) {
        const delay = Math.min(5000, 300 * 2 ** (attempt - 1));
        await sleep(delay + Math.random() * 250);
        try {
          const etag = await uploadToPresignedUrl(
            url,
            file,
            contentType,
            onProgress,
            signal,
            attempt + 1,
          );
          resolve(etag);
        } catch (retryError) {
          reject(retryError);
        }
        return;
      }
      reject(error);
    };
    const abortUpload = () => {
      xhr.abort();
      void fail(new Error("Upload cancelled"), false);
    };
    xhr.open("PUT", url);
    xhr.timeout = 120000;
    xhr.setRequestHeader("Content-Type", contentType);
    signal?.addEventListener("abort", abortUpload, { once: true });
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        onProgress(percent);
      }
    };
    xhr.onload = () => {
      if (settled) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        settled = true;
        cleanup();
        const etag = xhr.getResponseHeader("ETag");
        resolve(etag ? etag.replace(/"/g, "") : null);
      } else {
        void fail(
          new Error(`Upload failed with status ${xhr.status}`),
          isRetryableStatus(xhr.status),
        );
      }
    };
    xhr.onerror = () => void fail(new Error("Upload failed"), true);
    xhr.ontimeout = () => void fail(new Error("Upload timed out"), true);
    xhr.send(file);
  });
}
export async function uploadMultipartToS3(
  file: File,
  eventId: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{
  s3Key: string;
  thumbnailS3Key: string;
  thumbnailUploadUrl: string;
  mediaId: string;
}> {
  const init = await initiateMultipartUpload(
    eventId,
    file.name,
    file.type,
    file.size,
  );
  if (init.error || !init.success || !init.uploadId) {
    throw new Error(init.error || "Failed to initiate multipart upload");
  }
  const { uploadId, s3Key, thumbnailS3Key, thumbnailUploadUrl, mediaId } = init;
  try {
    const { partSize: PART_SIZE, concurrentParts: CONCURRENT_PARTS } =
      getAdaptiveMultipartSettings(file.size);
    const totalParts = Math.ceil(file.size / PART_SIZE);
    const parts: {
      ETag: string;
      PartNumber: number;
    }[] = [];
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
    const URL_BATCH_SIZE = 100;
    const partUrls: string[] = [];
    for (let i = 0; i < partNumbers.length; i += URL_BATCH_SIZE) {
      if (signal?.aborted) throw new Error("Upload cancelled");
      const batch = partNumbers.slice(i, i + URL_BATCH_SIZE);
      const result = await getMultipartPresignedUrls(s3Key, uploadId, batch);
      if (result.error || !result.urls) {
        throw new Error(result.error || "Failed to get part URLs");
      }
      partUrls.push(...result.urls);
    }
    let uploadedBytes = 0;
    const uploadPart = async (index: number) => {
      if (signal?.aborted) throw new Error("Upload cancelled");
      const partNumber = index + 1;
      const start = index * PART_SIZE;
      const end = Math.min(start + PART_SIZE, file.size);
      const chunk = file.slice(start, end);
      const url = partUrls[index];
      const etag = await uploadToPresignedUrl(
        url,
        chunk,
        file.type,
        (percent) => {},
        signal,
      );
      if (!etag) throw new Error(`Failed to get ETag for part ${partNumber}`);
      parts.push({ ETag: etag, PartNumber: partNumber });
      uploadedBytes += chunk.size;
      onProgress((uploadedBytes / file.size) * 100);
    };
    const queue = partNumbers.map((_, i) => i);
    const activeUploads = new Set<Promise<void>>();
    for (const index of queue) {
      if (signal?.aborted) throw new Error("Upload cancelled");
      const promise = uploadPart(index).then(() => {
        activeUploads.delete(promise);
      });
      activeUploads.add(promise);
      if (activeUploads.size >= CONCURRENT_PARTS) {
        await Promise.race(activeUploads);
      }
    }
    await Promise.all(activeUploads);
    parts.sort((a, b) => a.PartNumber - b.PartNumber);
    const complete = await completeMultipart(s3Key, uploadId, parts);
    if (complete.error) {
      throw new Error(complete.error || "Failed to complete multipart upload");
    }
    return { s3Key, thumbnailS3Key, thumbnailUploadUrl, mediaId };
  } catch (error) {
    try {
      await abortMultipart(s3Key, uploadId);
    } catch (e) {
      logger.error("Failed to abort multipart upload:", e);
    }
    throw error;
  }
}
export async function generateThumbnail(file: File): Promise<Blob | null> {
  try {
    const { lowEndDevice } = getConnectionProfile();
    if (lowEndDevice && file.type.startsWith("video/")) {
      return null;
    }
    if (file.type.startsWith("image/")) {
      return await generateImageThumbnail(file);
    }
    if (file.type.startsWith("video/")) {
      return await generateVideoThumbnail(file);
    }
  } catch (error) {
    logger.warn("Client thumbnail generation failed:", error);
  }
  return null;
}

async function generateImageThumbnail(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file, {
    colorSpaceConversion: "default",
    imageOrientation: "from-image",
  });
  try {
    return await drawThumbnail(bitmap.width, bitmap.height, (ctx, size) => {
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    });
  } finally {
    bitmap.close();
  }
}

async function generateVideoThumbnail(file: File): Promise<Blob | null> {
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  try {
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unable to read video metadata"));
    });
    const seekTo = Number.isFinite(video.duration)
      ? Math.min(1, Math.max(0, video.duration / 10))
      : 0;
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Unable to seek video"));
      video.currentTime = seekTo;
    });
    return await drawThumbnail(
      video.videoWidth,
      video.videoHeight,
      (ctx, size) => {
        ctx.drawImage(video, 0, 0, size.width, size.height);
      },
    );
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function drawThumbnail(
  sourceWidth: number,
  sourceHeight: number,
  draw: (
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
  ) => void,
): Promise<Blob | null> {
  if (!sourceWidth || !sourceHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  const scale = Math.max(
    THUMBNAIL_SIZE / sourceWidth,
    THUMBNAIL_SIZE / sourceHeight,
  );
  const width = Math.ceil(sourceWidth * scale);
  const height = Math.ceil(sourceHeight * scale);
  ctx.save();
  ctx.translate((THUMBNAIL_SIZE - width) / 2, (THUMBNAIL_SIZE - height) / 2);
  draw(ctx, { width, height });
  ctx.restore();
  return await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.76);
  });
}
export async function extractMetadata(file: File): Promise<{
  exifData: ExifData | null;
  width: number | null;
  height: number | null;
  takenAt: Date | null;
  duration?: number;
}> {
  return {
    exifData: null,
    width: null,
    height: null,
    takenAt: new Date(file.lastModified),
  };
}
