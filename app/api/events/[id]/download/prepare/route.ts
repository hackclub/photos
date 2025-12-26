import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import * as yazl from "yazl";
import { getSession } from "@/lib/auth";
import { getClientIpFromHeaders } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { s3Client } from "@/lib/media/s3";
import { can, getUserContext } from "@/lib/policy";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const maxDuration = 600;
export const dynamic = "force-dynamic";
const MAX_FILES_PER_DOWNLOAD = 10000;
async function cleanupOldZipFiles() {
  const TMP_DIR = tmpdir();
  const MAX_AGE_MS = 60 * 60 * 1000;
  try {
    const files = await readdir(TMP_DIR);
    const now = Date.now();
    const cleanupPromises = files
      .filter(
        (file) => file.startsWith("hackclub-photos-") && file.endsWith(".zip"),
      )
      .map(async (file) => {
        const filePath = join(TMP_DIR, file);
        try {
          const stats = await stat(filePath);
          if (now - stats.mtimeMs > MAX_AGE_MS) {
            await unlink(filePath);
          }
        } catch (_e) {}
      });
    await Promise.allSettled(cleanupPromises);
  } catch (error) {
    console.error("Failed to cleanup old ZIP files:", error);
  }
}
export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    await cleanupOldZipFiles().catch(console.error);
    const session = await getSession();
    const { id: eventId } = await params;
    const body = await req.json();
    const { mediaIds } = body;
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
      with: {
        media: {
          orderBy: (media, { desc }) => [desc(media.uploadedAt)],
        },
      },
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
    if (!event.media || event.media.length === 0) {
      return NextResponse.json(
        { error: "No media to download" },
        { status: 404 },
      );
    }
    let mediaToDownload = event.media;
    if (mediaIds && mediaIds.length > 0) {
      mediaToDownload = event.media.filter((m) => mediaIds.includes(m.id));
    }
    mediaToDownload = mediaToDownload.slice(0, MAX_FILES_PER_DOWNLOAD);
    const downloadId = randomBytes(16).toString("hex");
    const tempPath = join(tmpdir(), `hackclub-photos-${downloadId}.zip`);
    const zipFile = new yazl.ZipFile();
    const output = createWriteStream(tempPath);
    let fileCount = 0;
    let totalSize = 0;
    let hasError = false;
    output.on("error", (err) => {
      console.error("Output stream error:", err);
      hasError = true;
    });
    zipFile.outputStream.pipe(output);
    for (const mediaItem of mediaToDownload) {
      if (req.signal.aborted) {
        output.destroy();
        await unlink(tempPath).catch(console.error);
        return NextResponse.json({ error: "Aborted" }, { status: 499 });
      }
      if (hasError) break;
      try {
        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: mediaItem.s3Key,
        });
        const s3Response = await s3Client.send(command);
        if (!s3Response.Body) {
          console.error(`No body for ${mediaItem.filename}`);
          continue;
        }
        const contentLength = s3Response.ContentLength || 0;
        totalSize += contentLength;
        const folder = mediaItem.mimeType.startsWith("image/")
          ? "photos"
          : "videos";
        const zipPath = `${folder}/${mediaItem.filename}`;
        zipFile.addReadStream(s3Response.Body as Readable, zipPath, {
          mtime: mediaItem.uploadedAt,
          mode: 0o644,
        });
        fileCount++;
      } catch (error) {
        console.error(`Error adding ${mediaItem.filename}:`, error);
      }
    }
    if (hasError) {
      throw new Error("Error occurred during ZIP creation");
    }
    zipFile.end();
    await new Promise<void>((resolve, reject) => {
      output.on("finish", () => {
        resolve();
      });
      output.on("error", reject);
    });
    setTimeout(
      () => {
        unlink(tempPath).catch(() => {});
      },
      60 * 60 * 1000,
    );
    return NextResponse.json({
      success: true,
      downloadId,
      fileCount,
      totalSize,
    });
  } catch (error) {
    console.error("Prepare download error:", error);
    return NextResponse.json(
      { error: "Failed to prepare download" },
      { status: 500 },
    );
  }
}
