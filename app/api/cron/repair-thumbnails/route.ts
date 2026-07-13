import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq, gt } from "drizzle-orm";
import ffmpeg from "fluent-ffmpeg";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { logger, recordException, serializeError } from "@/lib/logger";
import { runFfmpegCommand } from "@/lib/media/ffmpeg";
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
import { recordCronJob } from "@/lib/telemetry";

const BATCH_SIZE = 500;
const REPAIR_CONCURRENCY = 2;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
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
) {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
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

async function downloadObjectToFile(keys: string[], outputPath: string) {
  let lastError: unknown;
  for (const key of keys) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }),
      );
      if (!response.Body) throw new Error("S3 object had no body");
      await pipeline(
        response.Body as Readable,
        createWriteStream(outputPath, { flags: "w" }),
      );
      return;
    } catch (error) {
      lastError = error;
      await unlink(outputPath).catch(() => {});
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

async function fallbackVideoThumbnail(
  inputPath: string,
  mediaId: string,
  tags: Record<string, string>,
) {
  const tempDir = path.join(os.tmpdir(), "repair-thumbnails");
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, `${mediaId}-thumb.jpg`);
  const timestamps = ["00:00:01.000", "00:00:00.000", "00:00:02.000", "10%"];
  try {
    for (const timestamp of timestamps) {
      try {
        const command = ffmpeg(inputPath).outputOptions([
          "-frames:v 1",
          "-q:v 3",
        ]);
        await runFfmpegCommand(command, () => {
          command.screenshots({
            count: 1,
            folder: tempDir,
            filename: `${mediaId}-thumb.jpg`,
            timestamps: [timestamp],
          });
        });
        if (existsSync(outputPath)) break;
      } catch {
        if (existsSync(outputPath)) break;
      }
    }
    if (!existsSync(outputPath))
      throw new Error("No video thumbnail extracted");
    const thumbnailBuffer = await createSharp(await readFile(outputPath), {
      failOn: "none",
    })
      .resize(400, 400, { fit: "cover", position: "center" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const thumbnailS3Key = getThumbnailS3Key(mediaId);
    await uploadToS3(
      thumbnailBuffer,
      thumbnailS3Key,
      "image/jpeg",
      undefined,
      tags,
    );
    return thumbnailS3Key;
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    recordCronJob("repair_thumbnails", "unauthorized", startedAt);
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
    const results = await mapLimit(rows, REPAIR_CONCURRENCY, async (item) => {
      if (
        item.mimeType.startsWith("image/") &&
        !ALLOWED_IMAGE_TYPES.includes(item.mimeType)
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
        const sourceKeys = [
          item.s3Key,
          item.blurredS3Key,
          item.originalS3Key,
        ].filter((key): key is string => Boolean(key));
        const tags = { uploadedBy: item.uploadedById, eventId: item.eventId };
        let thumbnailS3Key: string | null = null;
        if (item.mimeType.startsWith("video/")) {
          const tempDir = path.join(os.tmpdir(), "repair-thumbnails");
          await mkdir(tempDir, { recursive: true });
          const sourcePath = path.join(tempDir, `${item.id}-source`);
          try {
            await downloadObjectToFile(sourceKeys, sourcePath);
            thumbnailS3Key = await generateAndUploadThumbnail(
              sourcePath,
              item.mimeType,
              item.id,
              undefined,
              tags,
            );
            if (!thumbnailS3Key) {
              thumbnailS3Key = await fallbackVideoThumbnail(
                sourcePath,
                item.id,
                tags,
              );
            }
          } finally {
            await unlink(sourcePath).catch(() => {});
          }
        } else {
          const buffer = await getObjectBuffer(
            sourceKeys,
            MAX_BUFFERED_IMAGE_BYTES,
          );
          thumbnailS3Key = await generateAndUploadThumbnail(
            buffer,
            item.mimeType,
            item.id,
            undefined,
            tags,
          );
          if (!thumbnailS3Key && item.mimeType.startsWith("image/")) {
            thumbnailS3Key = await fallbackImageThumbnail(
              buffer,
              item.id,
              tags,
            );
          }
        }
        if (!thumbnailS3Key)
          throw new Error("Thumbnail generation returned null");
        await db
          .update(media)
          .set({ thumbnailS3Key })
          .where(eq(media.id, item.id));
        return { repaired: 1, failed: 0 };
      } catch (error) {
        await recordException(error);
        logger.error(
          { mediaId: item.id, error: serializeError(error) },
          "thumbnail repair failed",
        );
        return { repaired: 0, failed: 1 };
      }
    });
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
    recordCronJob(
      "repair_thumbnails",
      failed > 0 ? "error" : "success",
      startedAt,
    );
    return NextResponse.json({
      checked: rows.length,
      repaired,
      failed,
      nextCursor,
      completed: !nextCursor,
    });
  } catch (error) {
    await recordException(error);
    recordCronJob("repair_thumbnails", "error", startedAt);
    logger.error({ error: serializeError(error) }, "thumbnail repair failed");
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  } finally {
    repairState.__thumbnailRepairRunning = false;
  }
}
