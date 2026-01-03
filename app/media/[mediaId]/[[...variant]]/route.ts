import {
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { convertHeicToJpeg } from "@/lib/media/heic";
import { s3Client } from "@/lib/media/s3";
import { can } from "@/lib/policy";
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      mediaId: string;
      variant?: string[];
    }>;
  },
) {
  const { mediaId, variant: variantPath } = await params;
  const variant = variantPath?.[0];
  const searchParams = request.nextUrl.searchParams;
  const download = searchParams.get("download") === "true";
  const mediaItem = await db.query.media.findFirst({
    where: eq(media.id, mediaId),
    with: {
      event: true,
    },
  });
  if (!mediaItem) {
    return new NextResponse("Media not found", { status: 404 });
  }
  let isAllowed = false;
  if (mediaItem.event.visibility === "public") {
    isAllowed = true;
  } else {
    const { user } = await getUserContext();
    if (user) {
      isAllowed = await can(user, "view", "media", mediaItem);
    }
  }
  if (!isAllowed) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (
    variant === "display" &&
    (mediaItem.mimeType === "image/heic" || mediaItem.mimeType === "image/heif")
  ) {
    try {
      const jpegBuffer = await convertHeicToJpeg(mediaItem.s3Key);
      const headers = new Headers();
      headers.set("Content-Type", "image/jpeg");
      headers.set("Content-Length", String(jpegBuffer.length));
      if (mediaItem.event.visibility === "public") {
        headers.set("Cache-Control", "public, max-age=3600, s-maxage=31536000");
      } else {
        headers.set("Cache-Control", "private, max-age=3600");
      }
      const jpgFilename = mediaItem.filename.replace(/\.(heic|heif)$/i, ".jpg");
      headers.set("Content-Disposition", `inline; filename="${jpgFilename}"`);
      return new NextResponse(jpegBuffer as unknown as BodyInit, {
        status: 200,
        headers,
      });
    } catch (error) {
      console.error("HEIC conversion failed:", error);
    }
  }
  let s3Key = mediaItem.s3Key;
  let filename = mediaItem.filename;
  if (variant === "thumbnail") {
    if (mediaItem.thumbnailS3Key) {
      s3Key = mediaItem.thumbnailS3Key;
      const baseName =
        filename.substring(0, filename.lastIndexOf(".")) || filename;
      filename = `thumbnail_${baseName}.jpg`;
    } else {
      s3Key = mediaItem.s3Key;
    }
  }
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
  });
  let s3Response: GetObjectCommandOutput;
  try {
    console.log(`[Media Debug] Fetching ${s3Key} (variant: ${variant})`);
    s3Response = await s3Client.send(command);
    console.log(`[Media Debug] S3 Response: ${s3Response.ContentType} ${s3Response.ContentLength} bytes`);
  } catch (error) {
    console.error(`Failed to fetch from S3:`, error);
    return new NextResponse("Failed to fetch media", { status: 502 });
  }
  const headers = new Headers();
  headers.set("Content-Type", s3Response.ContentType || mediaItem.mimeType);
  if (s3Response.ContentLength) {
    headers.set("Content-Length", String(s3Response.ContentLength));
  }
  if (mediaItem.event.visibility === "public") {
    headers.set("Cache-Control", "public, max-age=3600, s-maxage=31536000");
  } else {
    headers.set("Cache-Control", "private, max-age=3600");
  }
  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  } else {
    headers.set("Content-Disposition", `inline; filename="${filename}"`);
  }
  console.log(`[Media Debug] Returning response with headers:`, [...headers.entries()]);
  return new NextResponse(s3Response.Body as ReadableStream, {
    status: 200,
    headers,
  });
}
