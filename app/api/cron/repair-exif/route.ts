import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq, gt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { logger, recordException, serializeError } from "@/lib/logger";
import { extractExifData } from "@/lib/media/exif";
import { S3_BUCKET_NAME, s3Client } from "@/lib/media/s3";
import { recordCronJob } from "@/lib/telemetry";

const BATCH_SIZE = 300;
const REPAIR_CONCURRENCY = 6;

type MediaRow = typeof media.$inferSelect;

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

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function getExifObject(item: MediaRow) {
  return item.exifData &&
    typeof item.exifData === "object" &&
    !Array.isArray(item.exifData)
    ? (item.exifData as Record<string, unknown>)
    : null;
}

function mergeExifData(
  primary: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> | null | undefined,
) {
  const merged: Record<string, unknown> = {};
  if (fallback) {
    for (const [key, value] of Object.entries(fallback)) {
      if (hasValue(value)) merged[key] = value;
    }
  }
  if (primary) {
    for (const [key, value] of Object.entries(primary)) {
      if (hasValue(value)) merged[key] = value;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

async function getObjectBuffer(keys: string[]) {
  let lastError: unknown;
  for (const key of keys) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }),
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

async function repairExifForMedia(item: MediaRow) {
  if (!item.mimeType.startsWith("image/")) {
    return { scanned: 0, skipped: 1, repaired: 0, failed: 0 };
  }
  try {
    const sourceKeys = [
      item.s3Key,
      item.originalS3Key,
      item.blurredS3Key,
    ].filter((key): key is string => Boolean(key));
    const buffer = await getObjectBuffer(sourceKeys);
    const [exifResult, imageMetadata] = await Promise.all([
      extractExifData(buffer, item.mimeType),
      sharp(buffer, { failOn: "none", limitInputPixels: false })
        .metadata()
        .catch(() => null),
    ]);
    const extractedExif = exifResult
      ? mergeExifData(
          {
            ...exifResult,
            width: exifResult.width ?? imageMetadata?.width,
            height: exifResult.height ?? imageMetadata?.height,
          },
          null,
        )
      : mergeExifData(
          imageMetadata
            ? { width: imageMetadata.width, height: imageMetadata.height }
            : null,
          null,
        );
    const finalExif = mergeExifData(extractedExif, getExifObject(item));
    const dateValue =
      (finalExif?.dateTimeOriginal as string | undefined) ?? undefined;
    const takenAt = dateValue ? new Date(dateValue) : item.takenAt;
    const latitude =
      (finalExif?.gpsLatitude as number | undefined) ?? item.latitude;
    const longitude =
      (finalExif?.gpsLongitude as number | undefined) ?? item.longitude;
    const width = (finalExif?.width as number | undefined) ?? item.width;
    const height = (finalExif?.height as number | undefined) ?? item.height;
    const hasRepair = Boolean(
      finalExif || takenAt || hasValue(latitude) || hasValue(longitude),
    );
    if (!hasRepair) return { scanned: 1, skipped: 0, repaired: 0, failed: 0 };
    await db
      .update(media)
      .set({
        exifData: finalExif,
        takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
        latitude,
        longitude,
        width,
        height,
      })
      .where(eq(media.id, item.id));
    return { scanned: 1, skipped: 0, repaired: 1, failed: 0 };
  } catch (error) {
    await recordException(error);
    logger.error(
      { mediaId: item.id, error: serializeError(error) },
      "EXIF repair failed",
    );
    return { scanned: 1, skipped: 0, repaired: 0, failed: 1 };
  }
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    recordCronJob("repair_exif", "unauthorized", startedAt);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const cursor = request.nextUrl.searchParams.get("cursor") || undefined;
    logger.info({ cursor }, "EXIF repair started");
    const rows = await db.query.media.findMany({
      where: cursor ? gt(media.id, cursor) : undefined,
      orderBy: (m, { asc }) => [asc(m.id)],
      limit: BATCH_SIZE,
    });
    const results = await mapLimit(
      rows,
      REPAIR_CONCURRENCY,
      repairExifForMedia,
    );
    const totals = results.reduce(
      (acc, result) => ({
        scanned: acc.scanned + result.scanned,
        skipped: acc.skipped + result.skipped,
        repaired: acc.repaired + result.repaired,
        failed: acc.failed + result.failed,
      }),
      { scanned: 0, skipped: 0, repaired: 0, failed: 0 },
    );
    const nextCursor =
      rows.length === BATCH_SIZE ? rows[rows.length - 1]?.id : undefined;
    logger.info(
      {
        checked: rows.length,
        ...totals,
        nextCursor,
        completed: !nextCursor,
        durationMs: Date.now() - startedAt,
      },
      "EXIF repair finished",
    );
    recordCronJob(
      "repair_exif",
      totals.failed > 0 ? "error" : "success",
      startedAt,
    );
    return NextResponse.json({
      checked: rows.length,
      ...totals,
      nextCursor,
      completed: !nextCursor,
    });
  } catch (error) {
    await recordException(error);
    recordCronJob("repair_exif", "error", startedAt);
    logger.error({ error: serializeError(error) }, "EXIF repair failed");
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
