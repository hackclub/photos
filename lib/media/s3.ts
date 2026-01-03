import type { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Config: S3ClientConfig = {
  region: process.env.S3_REGION || "auto",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
};
if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
}
if (process.env.S3_FORCE_PATH_STYLE === "true") {
  s3Config.forcePathStyle = true;
}
const s3Client = new S3Client(s3Config);
export { s3Client };
export async function uploadToS3(
  file: Buffer | Readable | Blob | Uint8Array,
  key: string,
  contentType: string,
  signal?: AbortSignal,
  tags?: Record<string, string>,
): Promise<void> {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: contentType,
    CacheControl: "max-age=31536000, immutable",
    Tagging: tags ? new URLSearchParams(tags).toString() : undefined,
  };
  try {
    const command = new PutObjectCommand(params);
    if (signal?.aborted) {
      throw new Error("Upload aborted");
    }
    await s3Client.send(command, { abortSignal: signal });
  } catch (error: unknown) {
    const isNotImplemented =
      error instanceof Error &&
      (error.name === "NotImplemented" ||
        (
          error as {
            Code?: string;
          }
        ).Code === "NotImplemented");
    if (tags && isNotImplemented) {
      console.warn(
        `S3 Provider does not support tagging. Retrying upload for ${key} without tags.`,
      );
      const { Tagging: _Tagging, ...paramsWithoutTags } = params;
      const retryCommand = new PutObjectCommand(paramsWithoutTags);
      if (signal?.aborted) {
        throw new Error("Upload aborted");
      }
      await s3Client.send(retryCommand, { abortSignal: signal });
      return;
    }
    throw error;
  }
}
export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
  });
  await s3Client.send(command);
}
export async function deleteFromS3Batch(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const batchSize = 1000;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const command = new DeleteObjectsCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Delete: {
        Objects: batch.map((Key) => ({ Key })),
        Quiet: true,
      },
    });
    await s3Client.send(command);
  }
}
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
  });
  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function createMultipartUpload(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new CreateMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
    CacheControl: "max-age=31536000, immutable",
  });
  const response = await s3Client.send(command);
  return response.UploadId!;
}
export async function getSignedPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600,
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return await getSignedUrl(s3Client, command, { expiresIn });
}
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: {
    ETag: string;
    PartNumber: number;
  }[],
): Promise<void> {
  const command = new CompleteMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts,
    },
  });
  await s3Client.send(command);
}
export async function abortMultipartUpload(
  key: string,
  uploadId: string,
): Promise<void> {
  const command = new AbortMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    UploadId: uploadId,
  });
  await s3Client.send(command);
}
export async function getStorageStats(): Promise<{
  totalSize: number;
  totalFiles: number;
}> {
  let totalSize = 0;
  let totalFiles = 0;
  let continuationToken: string | undefined;
  do {
    const command: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME!,
      ContinuationToken: continuationToken,
    });
    const response = await s3Client.send(command);
    if (response.Contents) {
      for (const object of response.Contents) {
        totalSize += object.Size || 0;
        totalFiles++;
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  return { totalSize, totalFiles };
}
export async function getDetailedStorageStats(): Promise<{
  totalSize: number;
  totalFiles: number;
  breakdown: {
    events: {
      size: number;
      count: number;
    };
    thumbnails: {
      size: number;
      count: number;
    };
    avatars: {
      size: number;
      count: number;
    };
    exports: {
      size: number;
      count: number;
    };
    banners: {
      size: number;
      count: number;
    };
    other: {
      size: number;
      count: number;
    };
  };
  eventBreakdown: Record<
    string,
    {
      size: number;
      count: number;
    }
  >;
  userBreakdown: Record<
    string,
    {
      size: number;
      count: number;
    }
  >;
}> {
  let totalSize = 0;
  let totalFiles = 0;
  const breakdown = {
    events: { size: 0, count: 0 },
    thumbnails: { size: 0, count: 0 },
    avatars: { size: 0, count: 0 },
    exports: { size: 0, count: 0 },
    banners: { size: 0, count: 0 },
    other: { size: 0, count: 0 },
  };
  const eventBreakdown: Record<
    string,
    {
      size: number;
      count: number;
    }
  > = {};
  const userBreakdown: Record<
    string,
    {
      size: number;
      count: number;
    }
  > = {};
  let continuationToken: string | undefined;
  do {
    const command: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME!,
      ContinuationToken: continuationToken,
    });
    const response = await s3Client.send(command);
    if (response.Contents) {
      for (const object of response.Contents) {
        const size = object.Size || 0;
        const key = object.Key || "";
        totalSize += size;
        totalFiles++;
        if (key.startsWith("media/")) {
          const parts = key.split("/");
          if (parts.length >= 3) {
            const type = parts[2];
            if (type.startsWith("thumbnail")) {
              breakdown.thumbnails.size += size;
              breakdown.thumbnails.count++;
            } else {
              breakdown.events.size += size;
              breakdown.events.count++;
            }
          }
        } else if (key.startsWith("events/")) {
          breakdown.events.size += size;
          breakdown.events.count++;
          const parts = key.split("/");
          if (parts.length >= 2) {
            const eventId = parts[1];
            if (!eventBreakdown[eventId]) {
              eventBreakdown[eventId] = { size: 0, count: 0 };
            }
            eventBreakdown[eventId].size += size;
            eventBreakdown[eventId].count++;
            if (parts.length >= 3) {
              const userId = parts[2];
              const isUuid =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  userId,
                );
              if (isUuid) {
                if (!userBreakdown[userId]) {
                  userBreakdown[userId] = { size: 0, count: 0 };
                }
                userBreakdown[userId].size += size;
                userBreakdown[userId].count++;
              }
            }
          }
        } else if (key.startsWith("thumbnails/")) {
          breakdown.thumbnails.size += size;
          breakdown.thumbnails.count++;
        } else if (key.startsWith("users/") || key.startsWith("avatars/")) {
          breakdown.avatars.size += size;
          breakdown.avatars.count++;
          const parts = key.split("/");
          if (parts.length >= 2) {
            const userId = parts[1];
            const isUuid =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                userId,
              );
            if (isUuid) {
              if (!userBreakdown[userId]) {
                userBreakdown[userId] = { size: 0, count: 0 };
              }
              userBreakdown[userId].size += size;
              userBreakdown[userId].count++;
            }
          }
        } else if (key.startsWith("series/")) {
          breakdown.banners.size += size;
          breakdown.banners.count++;
        } else if (key.startsWith("exports/")) {
          breakdown.exports.size += size;
          breakdown.exports.count++;
        } else if (key.startsWith("banners/")) {
          breakdown.banners.size += size;
          breakdown.banners.count++;
        } else {
          breakdown.other.size += size;
          breakdown.other.count++;
        }
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  return { totalSize, totalFiles, breakdown, eventBreakdown, userBreakdown };
}
export function getMediaProxyUrl(
  mediaId: string,
  variant: "original" | "thumbnail" | "display" = "original",
): string {
  if (variant === "thumbnail") {
    return `/media/${mediaId}/thumbnail`;
  }
  if (variant === "display") {
    return `/media/${mediaId}/display`;
  }
  return `/media/${mediaId}`;
}
export function getAssetProxyUrl(
  type: "avatar" | "event-banner" | "series-banner",
  id: string,
) {
  return `/assets/${type}/${id}`;
}
