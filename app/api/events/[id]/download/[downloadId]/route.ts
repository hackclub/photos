import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";
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
    const { downloadId } = await params;
    const tempPath = join(tmpdir(), `hackclub-photos-${downloadId}.zip`);
    try {
      await stat(tempPath);
    } catch (_error) {
      return NextResponse.json(
        { error: "Download not found or expired" },
        { status: 404 },
      );
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
          unlink(tempPath).catch(console.error);
        });
        fileStream.on("error", (error) => {
          controller.error(error);
          unlink(tempPath).catch(console.error);
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
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 },
    );
  }
}
