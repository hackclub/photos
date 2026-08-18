import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ZipArchive } from "archiver";
import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClientIpFromHeaders } from "@/lib/auth-api";
import { withArchiveSlot } from "@/lib/concurrency";
import { db } from "@/lib/db";
import { events, media } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { s3Client } from "@/lib/media/s3";
import { can, getUserContext } from "@/lib/policy";
import { rateLimit } from "@/lib/rate-limit";
import { safeFilename } from "@/lib/safe-filename";
export const runtime = "nodejs";
export const maxDuration = 600;
export const dynamic = "force-dynamic";
const MAX_FILES_PER_DOWNLOAD = 10000;
const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
async function cleanupOldZipFiles() {
  const TMP_DIR = tmpdir();
  const MAX_AGE_MS = 60 * 60 * 1000;
  try {
    const files = await readdir(TMP_DIR);
    const now = Date.now();
    for (const file of files) {
      if (!file.startsWith("hackclub-photos-") || !file.endsWith(".zip")) {
        continue;
      }
      const filePath = join(TMP_DIR, file);
      try {
        const stats = await stat(filePath);
        if (now - stats.mtimeMs > MAX_AGE_MS) {
          await unlink(filePath);
        }
      } catch (_e) {}
    }
  } catch (error) {
    logger.error("Failed to cleanup old ZIP files:", error);
  }
}
async function handlePost(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  let cleanupTempPath: string | undefined;
  let cleanupMetadataPath: string | undefined;
  let activeOutput: ReturnType<typeof createWriteStream> | undefined;
  let activeArchive: ZipArchive | undefined;
  try {
    await cleanupOldZipFiles().catch((error) => {
      logger.error("Failed to cleanup old zip files:", error);
    });
    const session = await getSession();
    const { id: eventId } = await params;
    if (!UUID_PATTERN.test(eventId)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const body = await req.json();
    const { mediaIds } = body;
    if (
      mediaIds !== undefined &&
      (!Array.isArray(mediaIds) ||
        mediaIds.length > MAX_FILES_PER_DOWNLOAD ||
        mediaIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id)))
    ) {
      return NextResponse.json({ error: "Invalid media IDs" }, { status: 400 });
    }
    const identifier =
      session?.id ?? getClientIpFromHeaders(req.headers, "anonymous");
    const rateLimitResult = await rateLimit(`download:${identifier}`, {
      limit: 3,
      window: 3600,
      failOpen: false,
    });
    if (!rateLimitResult.success) {
      const resetIn = Math.ceil(
        (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
      );
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again in ${resetIn} minutes.` },
        { status: 429 },
      );
    }
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const ctx = await getUserContext(session?.id);
    const hasAccess = await can(ctx, "view", "event", event);
    if (!hasAccess) {
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const mediaToDownload = (
      await db.query.media.findMany({
        where:
          mediaIds && mediaIds.length > 0
            ? and(eq(media.eventId, eventId), inArray(media.id, mediaIds))
            : eq(media.eventId, eventId),
        orderBy: (media, { desc }) => [desc(media.uploadedAt)],
        limit: MAX_FILES_PER_DOWNLOAD,
      })
    ).filter((item) => item.blurStatus !== "pending");
    if (mediaToDownload.length === 0) {
      return NextResponse.json(
        { error: "No media to download" },
        { status: 404 },
      );
    }
    const downloadId = randomBytes(16).toString("hex");
    const tempPath = join(tmpdir(), `hackclub-photos-${downloadId}.zip`);
    const metadataPath = join(tmpdir(), `hackclub-photos-${downloadId}.json`);
    const output = createWriteStream(tempPath);
    const archive = new ZipArchive({ zlib: { level: 1 } });
    cleanupTempPath = tempPath;
    cleanupMetadataPath = metadataPath;
    activeOutput = output;
    activeArchive = archive;
    archive.pipe(output);
    const outputCompleted = new Promise<void>((resolve, reject) => {
      output.once("close", resolve);
      output.once("error", reject);
      archive.once("error", reject);
    }).then(
      () => null,
      (error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
    );
    let fileCount = 0;
    let totalSize = 0;
    for (const mediaItem of mediaToDownload) {
      if (req.signal.aborted) {
        archive.abort();
        output.destroy();
        await unlink(tempPath).catch((error) => {
          logger.error("Failed to remove aborted download zip:", error);
        });
        return NextResponse.json({ error: "Aborted" }, { status: 499 });
      }
      try {
        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: mediaItem.s3Key,
        });
        const s3Response = await s3Client.send(command, {
          abortSignal: req.signal,
        });
        if (!s3Response.Body) {
          logger.error(`No body for ${mediaItem.filename}`);
          continue;
        }
        const contentLength = s3Response.ContentLength || 0;
        totalSize += contentLength;
        const folder = mediaItem.mimeType.startsWith("image/")
          ? "photos"
          : "videos";
        const zipPath = `${folder}/${safeFilename(mediaItem.filename)}`;
        const source = s3Response.Body as Readable;
        const abortSource = () => source.destroy(new Error("Download aborted"));
        req.signal.addEventListener("abort", abortSource, { once: true });
        archive.append(source, {
          name: zipPath,
          date:
            mediaItem.uploadedAt instanceof Date
              ? mediaItem.uploadedAt
              : new Date(mediaItem.uploadedAt),
        });
        try {
          await finished(source, { cleanup: true });
        } finally {
          req.signal.removeEventListener("abort", abortSource);
        }
        fileCount++;
      } catch (error) {
        logger.error(`Error adding ${mediaItem.filename}:`, error);
      }
    }
    await archive.finalize();
    const outputError = await outputCompleted;
    if (outputError) throw outputError;
    setTimeout(
      () => {
        unlink(tempPath).catch(() => {});
        unlink(metadataPath).catch(() => {});
      },
      60 * 60 * 1000,
    );
    await writeFile(
      metadataPath,
      JSON.stringify({
        eventId,
        userId: session?.id ?? null,
        createdAt: Date.now(),
      }),
    );
    return NextResponse.json({
      success: true,
      downloadId,
      fileCount,
      totalSize,
    });
  } catch (error) {
    activeArchive?.abort();
    activeOutput?.destroy();
    if (cleanupTempPath) await unlink(cleanupTempPath).catch(() => {});
    if (cleanupMetadataPath) await unlink(cleanupMetadataPath).catch(() => {});
    logger.error("Prepare download error:", error);
    return NextResponse.json(
      { error: "Failed to prepare download" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await withArchiveSlot(() => handlePost(req, context), req.signal);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download rejected" },
      { status: req.signal.aborted ? 499 : 503 },
    );
  }
}
