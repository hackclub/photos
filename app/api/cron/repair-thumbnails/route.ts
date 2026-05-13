import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { eq, gt } from "drizzle-orm";
import ffmpeg from "fluent-ffmpeg";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { logger, recordException, serializeError } from "@/lib/logger";
import { s3Client, uploadToS3 } from "@/lib/media/s3";
import { generateAndUploadThumbnail } from "@/lib/media/thumbnail";

const BATCH_SIZE = 500;
const REPAIR_CONCURRENCY = 8;

async function objectExists(key: string) {
  try {
    await s3Client.send(
      new HeadObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }),
    );
    return true;
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

async function getObjectBuffer(keys: string[]) {
  let lastError: unknown;
  for (const key of keys) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }),
      );
      if (!response.Body) throw new Error("S3 object had no body");
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
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
      sharp(buffer, { failOn: "none", animated: true, limitInputPixels: false })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize(400, 400, { fit: "cover", position: "attention" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer(),
    () =>
      sharp(buffer, { failOn: "none", limitInputPixels: false })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize(400, 400, { fit: "cover", position: "center" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer(),
    () =>
      sharp(buffer, { failOn: "none", limitInputPixels: false })
        .resize(400, 400, { fit: "cover", position: "center" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer(),
    () =>
      sharp(buffer, { failOn: "none", limitInputPixels: false })
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
  const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
  await uploadToS3(output, thumbnailS3Key, "image/jpeg", undefined, tags);
  return thumbnailS3Key;
}

async function fallbackVideoThumbnail(
  buffer: Buffer,
  mediaId: string,
  tags: Record<string, string>,
) {
  const tempDir = path.join(os.tmpdir(), "repair-thumbnails");
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, `${mediaId}-source`);
  const outputPath = path.join(tempDir, `${mediaId}-thumb.jpg`);
  await writeFile(inputPath, buffer);
  const timestamps = ["00:00:01.000", "00:00:00.000", "00:00:02.000", "10%"];
  try {
    for (const timestamp of timestamps) {
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(inputPath)
            .outputOptions(["-frames:v 1", "-q:v 3"])
            .screenshots({
              count: 1,
              folder: tempDir,
              filename: `${mediaId}-thumb.jpg`,
              timestamps: [timestamp],
            })
            .on("end", () => resolve())
            .on("error", reject);
        });
        if (existsSync(outputPath)) break;
      } catch {
        if (existsSync(outputPath)) break;
      }
    }
    if (!existsSync(outputPath))
      throw new Error("No video thumbnail extracted");
    const thumbnailBuffer = await sharp(await readFile(outputPath), {
      failOn: "none",
    })
      .resize(400, 400, { fit: "cover", position: "center" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const thumbnailS3Key = `media/${mediaId}/thumbnail.jpg`;
    await uploadToS3(
      thumbnailBuffer,
      thumbnailS3Key,
      "image/jpeg",
      undefined,
      tags,
    );
    return thumbnailS3Key;
  } finally {
    await unlink(inputPath).catch(() => {});
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cursor = request.nextUrl.searchParams.get("cursor") || undefined;
  logger.info({ cursor }, "thumbnail repair started");
  const rows = await db.query.media.findMany({
    where: cursor ? gt(media.id, cursor) : undefined,
    orderBy: (m, { asc }) => [asc(m.id)],
    limit: BATCH_SIZE,
  });
  const results = await mapLimit(rows, REPAIR_CONCURRENCY, async (item) => {
    const hasThumbnail = item.thumbnailS3Key
      ? await objectExists(item.thumbnailS3Key)
      : false;
    if (hasThumbnail) return { repaired: 0, failed: 0 };
    try {
      const sourceKeys = [
        item.s3Key,
        item.blurredS3Key,
        item.originalS3Key,
      ].filter((key): key is string => Boolean(key));
      const buffer = await getObjectBuffer(sourceKeys);
      const tags = { uploadedBy: item.uploadedById, eventId: item.eventId };
      let thumbnailS3Key = await generateAndUploadThumbnail(
        buffer,
        item.mimeType,
        item.id,
        undefined,
        tags,
      );
      if (!thumbnailS3Key && item.mimeType.startsWith("image/")) {
        thumbnailS3Key = await fallbackImageThumbnail(buffer, item.id, tags);
      }
      if (!thumbnailS3Key && item.mimeType.startsWith("video/")) {
        thumbnailS3Key = await fallbackVideoThumbnail(buffer, item.id, tags);
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
  return NextResponse.json({
    checked: rows.length,
    repaired,
    failed,
    nextCursor,
    completed: !nextCursor,
  });
}
