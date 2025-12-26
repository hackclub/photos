import {
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dataExports } from "@/lib/db/schema";
import { s3Client } from "@/lib/media/s3";
import { getUserContext } from "@/lib/policy";
export async function GET(
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
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.isBanned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const exportRecord = await db.query.dataExports.findFirst({
      where: eq(dataExports.id, id),
    });
    if (!exportRecord) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }
    if (exportRecord.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (exportRecord.status !== "completed" || !exportRecord.s3Key) {
      return NextResponse.json(
        { error: "Export not ready or failed" },
        { status: 400 },
      );
    }
    const expirationTime =
      new Date(exportRecord.completedAt!).getTime() + 48 * 60 * 60 * 1000;
    if (Date.now() > expirationTime) {
      return NextResponse.json({ error: "Export expired" }, { status: 410 });
    }
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: exportRecord.s3Key,
    });
    let s3Response: GetObjectCommandOutput;
    try {
      s3Response = await s3Client.send(command);
    } catch (error) {
      console.error("Failed to fetch export file from S3:", error);
      return NextResponse.json(
        { error: "Failed to fetch export file" },
        { status: 502 },
      );
    }
    const headers = new Headers();
    headers.set("Cache-Control", "private, no-cache");
    if (s3Response.ContentType) {
      headers.set("Content-Type", s3Response.ContentType);
    }
    if (s3Response.ContentLength) {
      headers.set("Content-Length", String(s3Response.ContentLength));
    }
    headers.set(
      "Content-Disposition",
      `attachment; filename="export-${id}.zip"`,
    );
    return new NextResponse(s3Response.Body as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error downloading export:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
