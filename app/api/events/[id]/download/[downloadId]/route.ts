import { createReadStream } from "node:fs";
import { readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { can, getUserContext } from "@/lib/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      downloadId: string;
    }>;
  },
) {
  try {
    const { id: eventId, downloadId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
      return NextResponse.json(
        { error: "Download not found" },
        { status: 404 },
      );
    }
    if (!/^[a-f0-9]{32}$/i.test(downloadId)) {
      return NextResponse.json(
        { error: "Download not found" },
        { status: 404 },
      );
    }
    const tempPath = join(tmpdir(), `hackclub-photos-${downloadId}.zip`);
    const metadataPath = join(tmpdir(), `hackclub-photos-${downloadId}.json`);
    try {
      await stat(tempPath);
    } catch (_error) {
      return NextResponse.json(
        { error: "Download not found or expired" },
        { status: 404 },
      );
    }
    let metadata: { eventId: string; userId: string | null; createdAt: number };
    try {
      metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    } catch (_error) {
      return NextResponse.json(
        { error: "Download not found or expired" },
        { status: 404 },
      );
    }
    if (
      metadata.eventId !== eventId ||
      Date.now() - metadata.createdAt > 60 * 60 * 1000
    ) {
      return NextResponse.json(
        { error: "Download not found" },
        { status: 404 },
      );
    }
    const session = await getSession();
    if (metadata.userId && session?.id !== metadata.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });
    const user = await getUserContext(session?.id);
    if (!event || !(await can(user, "view", "event", event))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const fileStream = createReadStream(tempPath);
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk: string | Buffer) => {
          controller.enqueue(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
          );
        });
        fileStream.on("end", () => {
          controller.close();
          unlink(tempPath).catch((error) => {
            logger.error("Failed to remove downloaded zip:", error);
          });
          unlink(metadataPath).catch(() => {});
        });
        fileStream.on("error", (error) => {
          controller.error(error);
          unlink(tempPath).catch((unlinkError) => {
            logger.error("Failed to remove errored download zip:", unlinkError);
          });
          unlink(metadataPath).catch(() => {});
        });
      },
    });
    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="hackclub-photos.zip"',
      },
    });
  } catch (error) {
    logger.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 },
    );
  }
}
