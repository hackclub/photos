import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq, gt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { logger, serializeError } from "@/lib/logger";
import {
  createSharp,
  MAX_BUFFERED_IMAGE_BYTES,
} from "@/lib/media/image-processing";
import { s3Client, uploadToS3 } from "@/lib/media/s3";
import {
  generateAndUploadThumbnail,
  getThumbnailS3Key,
} from "@/lib/media/thumbnail";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validation";

const BATCH_SIZE = 500;
const REPAIR_CONCURRENCY = 2;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_MS = 10 * 60 * 1000;
export const maxDuration = 800;
const repairState = globalThis as typeof globalThis & {
  __thumbnailRepairRunning?: boolean;
};

async function thumbnailIsValid(key: string) {
  try {
    const buffer = await getObjectBuffer([key], MAX_THUMBNAIL_BYTES);
    if (buffer.length < 32) return false;
    const metadata = await createSharp(buffer, { failOn: "none" }).metadata();
    return Boolean(metadata.width && metadata.height && metadata.format);
  } catch {
    return false;
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  shouldContinue?: () => boolean,
) {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length && (shouldContinue?.() ?? true)) {
      const current = items[index++];
      results.push(await fn(current));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

async function getObjectBuffer(keys: string[], maxBytes: number) {
  let lastError: unknown;
  for (const key of keys) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }),
      );
      if (!response.Body) throw new Error("S3 object had no body");
      const chunks: Uint8Array[] = [];
      let size = 0;
      const body = response.Body as AsyncIterable<Uint8Array> & {
        destroy?: (error?: Error) => void;
      };
      for await (const chunk of body) {
        size += chunk.length;
        if (size > maxBytes) {
          body.destroy?.(new Error("S3 object exceeds processing limit"));
          throw new Error("S3 object exceeds processing limit");
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, size);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No source object found");
}

async function fallbackImageThumbnail(
  buffer: Buffer,
  mediaId: string,
  tags: Record<string, string>,
) {
  const attempts = [
    () =>
      createSharp(buffer, { failOn: "none" })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize(400, 400, { fit: "cover", position: "attention" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer(),
    () =>
      createSharp(buffer, { failOn: "none" })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize(400, 400, { fit: "cover", position: "center" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer(),
    () =>
      createSharp(buffer, { failOn: "none" })
        .resize(400, 400, { fit: "cover", position: "center" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer(),
    () =>
      createSharp(buffer, { failOn: "none" })
        .resize(400, 400, { fit: "contain", background: "#ffffff" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer(),
  ];
  let output: Buffer | null = null;
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      output = await attempt();
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!output) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not extract real image thumbnail");
  }
  const thumbnailS3Key = getThumbnailS3Key(mediaId);
  await uploadToS3(output, thumbnailS3Key, "image/jpeg", undefined, tags);
  return thumbnailS3Key;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (repairState.__thumbnailRepairRunning) {
    return NextResponse.json(
      { error: "Thumbnail repair is already running" },
      { status: 409 },
    );
  }
  repairState.__thumbnailRepairRunning = true;
  try {
    const cursor = request.nextUrl.searchParams.get("cursor") || undefined;
    logger.info({ cursor }, "thumbnail repair started");
    const rows = await db.query.media.findMany({
      where: cursor ? gt(media.id, cursor) : undefined,
      orderBy: (m, { asc }) => [asc(m.id)],
      limit: BATCH_SIZE,
    });
    const results = await mapLimit(
      rows,
      REPAIR_CONCURRENCY,
      async (item) => {
        if (
          (item.mimeType.startsWith("image/") &&
            !ALLOWED_IMAGE_TYPES.includes(item.mimeType)) ||
          item.mimeType.startsWith("video/")
        ) {
          return { repaired: 0, failed: 0 };
        }
        const hasThumbnail = item.thumbnailS3Key
          ? await thumbnailIsValid(item.thumbnailS3Key)
          : false;
        if (hasThumbnail) return { repaired: 0, failed: 0 };
        try {
          const canonicalThumbnailS3Key = getThumbnailS3Key(item.id);
          if (
            item.thumbnailS3Key !== canonicalThumbnailS3Key &&
            (await thumbnailIsValid(canonicalThumbnailS3Key))
          ) {
            await db
              .update(media)
              .set({ thumbnailS3Key: canonicalThumbnailS3Key })
              .where(eq(media.id, item.id));
            return { repaired: 1, failed: 0 };
          }
          const buffer = await getObjectBuffer(
            [item.s3Key, item.blurredS3Key, item.originalS3Key].filter(
              (key): key is string => Boolean(key),
            ),
            MAX_BUFFERED_IMAGE_BYTES,
          );
          const tags = { uploadedBy: item.uploadedById, eventId: item.eventId };
          let thumbnailS3Key = await generateAndUploadThumbnail(
            buffer,
            item.mimeType,
            item.id,
            undefined,
            tags,
          );
          if (!thumbnailS3Key) {
            thumbnailS3Key = await fallbackImageThumbnail(
              buffer,
              item.id,
              tags,
            );
          }
          if (!thumbnailS3Key)
            throw new Error("Thumbnail generation returned null");
          await db
            .update(media)
            .set({ thumbnailS3Key })
            .where(eq(media.id, item.id));
          return { repaired: 1, failed: 0 };
        } catch (error) {
          logger.error(
            { mediaId: item.id, error: serializeError(error) },
            "thumbnail repair failed",
          );
          return { repaired: 0, failed: 1 };
        }
      },
      () => Date.now() - startedAt < MAX_DURATION_MS,
    );
    const repaired = results.reduce((sum, result) => sum + result.repaired, 0);
    const failed = results.reduce((sum, result) => sum + result.failed, 0);
    const nextCursor =
      rows.length === BATCH_SIZE ? rows[rows.length - 1]?.id : undefined;
    logger.info(
      {
        checked: rows.length,
        repaired,
        failed,
        nextCursor,
        completed: !nextCursor,
        durationMs: Date.now() - startedAt,
      },
      "thumbnail repair finished",
    );
    return NextResponse.json({
      checked: rows.length,
      repaired,
      failed,
      nextCursor,
      completed: !nextCursor,
    });
  } catch (error) {
    logger.error({ error: serializeError(error) }, "thumbnail repair failed");
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  } finally {
    repairState.__thumbnailRepairRunning = false;
  }
}
