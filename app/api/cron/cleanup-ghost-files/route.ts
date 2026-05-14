import {
  type _Object,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dataExports, events, media, series } from "@/lib/db/schema";
import { logger, recordException, serializeError } from "@/lib/logger";
import { deleteFromS3Batch, s3Client } from "@/lib/media/s3";
import { recordCronJob } from "@/lib/telemetry";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    recordCronJob("cleanup_ghost_files", "unauthorized", startedAt);
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  const cursor = searchParams.get("cursor") || undefined;

  try {
    logger.info({ cursor, force }, "ghost file cleanup started");
    let continuationToken: string | undefined = cursor;
    let totalChecked = 0;
    let totalDeleted = 0;
    const deletedKeys: string[] = [];
    const safetyThreshold = force
      ? new Date(Date.now())
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const startTime = Date.now();
    const TIME_LIMIT = 15 * 1000; // 15 seconds

    do {
      if (Date.now() - startTime > TIME_LIMIT) {
        logger.info(
          { checked: totalChecked, deleted: totalDeleted },
          "ghost file cleanup time limit reached",
        );
        break;
      }

      const command: ListObjectsV2Command = new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET_NAME!,
        ContinuationToken: continuationToken,
      });
      const response = (await s3Client.send(
        command,
      )) as ListObjectsV2CommandOutput;
      const contents = response.Contents || [];
      if (contents.length === 0) {
        break;
      }
      const candidates = contents.filter(
        (obj: _Object) =>
          obj.Key && obj.LastModified && obj.LastModified < safetyThreshold,
      );
      if (candidates.length > 0) {
        const candidateKeys = candidates.map((c: _Object) => c.Key!);
        const foundKeys = new Set<string>();
        const mediaS3Keys = await db
          .select({ key: media.s3Key })
          .from(media)
          .where(inArray(media.s3Key, candidateKeys));
        for (const k of mediaS3Keys) {
          foundKeys.add(k.key);
        }
        const mediaThumbKeys = await db
          .select({ key: media.thumbnailS3Key })
          .from(media)
          .where(inArray(media.thumbnailS3Key, candidateKeys));
        for (const k of mediaThumbKeys) {
          if (k.key) foundKeys.add(k.key);
        }
        const eventBannerKeys = await db
          .select({ key: events.bannerS3Key })
          .from(events)
          .where(inArray(events.bannerS3Key, candidateKeys));
        for (const k of eventBannerKeys) {
          if (k.key) foundKeys.add(k.key);
        }
        const seriesBannerKeys = await db
          .select({ key: series.bannerS3Key })
          .from(series)
          .where(inArray(series.bannerS3Key, candidateKeys));
        for (const k of seriesBannerKeys) {
          if (k.key) foundKeys.add(k.key);
        }
        const exportKeys = await db
          .select({ key: dataExports.s3Key })
          .from(dataExports)
          .where(inArray(dataExports.s3Key, candidateKeys));
        for (const k of exportKeys) {
          if (k.key) foundKeys.add(k.key);
        }
        const ghosts = candidateKeys.filter(
          (key: string) => !foundKeys.has(key),
        );
        if (ghosts.length > 0) {
          await deleteFromS3Batch(ghosts);
          totalDeleted += ghosts.length;
          logger.info(
            { deleted: ghosts.length, checked: contents.length },
            "ghost files deleted",
          );
          if (deletedKeys.length < 100) {
            deletedKeys.push(...ghosts.slice(0, 100 - deletedKeys.length));
          }
        }
      }
      totalChecked += contents.length;
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    logger.info(
      {
        checked: totalChecked,
        deleted: totalDeleted,
        completed: !continuationToken,
        nextCursor: continuationToken,
      },
      "ghost file cleanup finished",
    );
    recordCronJob("cleanup_ghost_files", "success", startedAt);
    return NextResponse.json({
      success: true,
      checked: totalChecked,
      deleted: totalDeleted,
      sampleDeletedKeys: deletedKeys,
      completed: !continuationToken,
      nextCursor: continuationToken,
    });
  } catch (error) {
    await recordException(error);
    recordCronJob("cleanup_ghost_files", "error", startedAt);
    logger.error(
      { cursor, force, error: serializeError(error) },
      "ghost file cleanup failed",
    );
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
