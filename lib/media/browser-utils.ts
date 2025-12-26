import {
  abortMultipart,
  completeMultipart,
  getMultipartPresignedUrls,
  initiateMultipartUpload,
} from "@/app/actions/upload";
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
export const MAX_CONCURRENT_UPLOADS = 20;
export const MAX_CONCURRENT_PROCESSING = 50;
export function uploadToPresignedUrl(
  url: string,
  file: File | Blob,
  contentType: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    if (signal) {
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Upload cancelled"));
      });
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        onProgress(percent);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        resolve(etag ? etag.replace(/"/g, "") : null);
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
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
    const PART_SIZE = 10 * 1024 * 1024;
    const totalParts = Math.ceil(file.size / PART_SIZE);
    const parts: {
      ETag: string;
      PartNumber: number;
    }[] = [];
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
    const URL_BATCH_SIZE = 50;
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
    const CONCURRENT_PARTS = 4;
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
      console.error("Failed to abort multipart upload:", e);
    }
    throw error;
  }
}
export async function generateThumbnail(file: File): Promise<Blob | null> {
  return null;
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
