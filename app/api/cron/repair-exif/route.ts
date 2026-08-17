import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, lt, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { logger, serializeError } from "@/lib/logger";
import { extractExifData } from "@/lib/media/exif";
import { createSharp } from "@/lib/media/image-processing";
import { S3_BUCKET_NAME, s3Client } from "@/lib/media/s3";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validation";
import { extractVideoMetadataFromS3Key } from "@/lib/media/video-metadata";

const BATCH_SIZE = 200;
const REPAIR_CONCURRENCY = 8;
const MAX_DURATION_MS = 10 * 60 * 1000;
const PER_MEDIA_TIMEOUT_MS = 45_000;
const IMAGE_RANGE_STEPS = [2 * 1024 * 1024, 8 * 1024 * 1024];
export const maxDuration = 800;
const repairState = globalThis as typeof globalThis & {
  __exifRepairRunning?: boolean;
};

type MediaRow = typeof media.$inferSelect;

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

async function getObjectBuffer(keys: string[], rangeBytes?: number) {
  let lastError: unknown;
  for (const key of keys) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: key,
          Range: rangeBytes ? `bytes=0-${rangeBytes - 1}` : undefined,
        }),
      );
      if (!response.Body) throw new Error("S3 object had no body");
      const chunks: Uint8Array[] = [];
      const maxBytes = rangeBytes ?? IMAGE_RANGE_STEPS.at(-1)!;
      let size = 0;
      const body = response.Body as AsyncIterable<Uint8Array> & {
        destroy?: (error?: Error) => void;
      };
      for await (const chunk of body) {
        size += chunk.length;
        if (size > maxBytes) {
          body.destroy?.(new Error("Metadata source exceeds processing limit"));
          throw new Error("Metadata source exceeds processing limit");
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

async function extractVideoMetadataFromKeys(keys: string[]) {
  let lastError: unknown;
  for (const key of keys) {
    try {
      const metadata = await extractVideoMetadataFromS3Key(key, {
        timeoutMs: PER_MEDIA_TIMEOUT_MS,
      });
      if (metadata) return metadata;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No source object found");
}

async function extractImageMetadataFromKeys(keys: string[], mimeType: string) {
  let bestExif: Record<string, unknown> | null = null;
  for (const rangeBytes of IMAGE_RANGE_STEPS) {
    const rangeBuffer = await getObjectBuffer(keys, rangeBytes);
    const [exifResult, imageMetadata] = await Promise.all([
      extractExifData(rangeBuffer, mimeType),
      createSharp(rangeBuffer, { failOn: "none" })
        .metadata()
        .catch(() => null),
    ]);
    bestExif = exifResult
      ? mergeExifData(
          {
            ...exifResult,
            width: exifResult.width ?? imageMetadata?.width,
            height: exifResult.height ?? imageMetadata?.height,
          },
          bestExif,
        )
      : mergeExifData(
          imageMetadata
            ? { width: imageMetadata.width, height: imageMetadata.height }
            : null,
          bestExif,
        );
    if (
      bestExif &&
      (hasValue(bestExif.dateTimeOriginal) ||
        hasValue(bestExif.Make) ||
        hasValue(bestExif.Model) ||
        hasValue(bestExif.make) ||
        hasValue(bestExif.model) ||
        hasValue(bestExif.gpsLatitude) ||
        hasValue(bestExif.gpsLongitude)) &&
      hasValue(bestExif.width) &&
      hasValue(bestExif.height)
    ) {
      return bestExif;
    }
  }
  return bestExif;
}

function validDate(value: unknown) {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function encodeCursor(cutoff: Date, item: MediaRow) {
  return `${cutoff.toISOString()}|${item.uploadedAt.toISOString()}|${item.id}`;
}

function parseCursor(cursor?: string) {
  if (!cursor) return null;
  const [cutoffValue, uploadedAtValue, id] = cursor.split("|");
  if (!cutoffValue || !uploadedAtValue || !id) return null;
  const cutoff = new Date(cutoffValue);
  const uploadedAt = new Date(uploadedAtValue);
  if (Number.isNaN(cutoff.getTime()) || Number.isNaN(uploadedAt.getTime())) {
    return null;
  }
  return { cutoff, uploadedAt, id };
}

async function repairExifForMedia(item: MediaRow) {
  if (
    item.mimeType.startsWith("image/") &&
    !ALLOWED_IMAGE_TYPES.includes(item.mimeType)
  ) {
    return { scanned: 0, skipped: 1, repaired: 0, failed: 0 };
  }
  if (
    !item.mimeType.startsWith("image/") &&
    !item.mimeType.startsWith("video/")
  ) {
    return { scanned: 0, skipped: 1, repaired: 0, failed: 0 };
  }
  try {
    const sourceKeys = [
      item.s3Key,
      item.originalS3Key,
      item.blurredS3Key,
    ].filter((key): key is string => Boolean(key));
    if (sourceKeys.length === 0) {
      return { scanned: 1, skipped: 0, repaired: 0, failed: 1 };
    }
    let extractedExif: Record<string, unknown> | null = null;
    if (item.mimeType.startsWith("image/")) {
      extractedExif = await extractImageMetadataFromKeys(
        sourceKeys,
        item.mimeType,
      );
    } else {
      const videoMetadata = await extractVideoMetadataFromKeys(sourceKeys);
      extractedExif = mergeExifData(
        {
          ...videoMetadata,
          dateTimeOriginal: videoMetadata.creationTime,
          gpsLatitude: videoMetadata.latitude,
          gpsLongitude: videoMetadata.longitude,
        },
        null,
      );
    }
    const finalExif = mergeExifData(extractedExif, getExifObject(item));
    const dateValue =
      (finalExif?.dateTimeOriginal as string | undefined) ?? undefined;
    const takenAt = validDate(dateValue) ?? item.takenAt;
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
        duration: (finalExif?.duration as number | undefined) ?? item.duration,
      })
      .where(eq(media.id, item.id));
    return { scanned: 1, skipped: 0, repaired: 1, failed: 0 };
  } catch (error) {
    logger.error(
      { mediaId: item.id, error: serializeError(error) },
      "media metadata repair failed",
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (repairState.__exifRepairRunning) {
    return NextResponse.json(
      { error: "EXIF repair is already running" },
      { status: 409 },
    );
  }
  repairState.__exifRepairRunning = true;
  try {
    const cursor = parseCursor(
      request.nextUrl.searchParams.get("cursor") || undefined,
    );
    const cutoff = cursor?.cutoff ?? new Date();
    logger.info(
      { cutoff: cutoff.toISOString(), cursor },
      "media metadata repair started",
    );
    const rows = await db.query.media.findMany({
      where: cursor
        ? and(
            lt(media.uploadedAt, cutoff),
            or(
              lt(media.uploadedAt, cursor.uploadedAt),
              and(
                eq(media.uploadedAt, cursor.uploadedAt),
                lt(media.id, cursor.id),
              ),
            ),
          )
        : lt(media.uploadedAt, cutoff),
      orderBy: (m, { desc }) => [desc(m.uploadedAt), desc(m.id)],
      limit: BATCH_SIZE,
    });
    const results = await mapLimit(
      rows,
      REPAIR_CONCURRENCY,
      (item) => repairExifForMedia(item),
      () => Date.now() - startedAt < MAX_DURATION_MS,
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
    const processedRows = results.length;
    const nextCursor =
      processedRows > 0 &&
      (rows.length === BATCH_SIZE || processedRows < rows.length)
        ? encodeCursor(cutoff, rows[processedRows - 1])
        : undefined;
    logger.info(
      {
        checked: processedRows,
        ...totals,
        nextCursor,
        completed: !nextCursor,
        durationMs: Date.now() - startedAt,
      },
      "media metadata repair finished",
    );
    return NextResponse.json({
      checked: processedRows,
      ...totals,
      nextCursor,
      completed: !nextCursor,
    });
  } catch (error) {
    logger.error({ error: serializeError(error) }, "EXIF repair failed");
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  } finally {
    repairState.__exifRepairRunning = false;
  }
}
