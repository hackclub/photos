import {
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { type NextRequest, NextResponse } from "next/server";
import { getSharedMedia } from "@/app/actions/sharing";
import { logger } from "@/lib/logger";
import { s3Client } from "@/lib/media/s3";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validation";
import { contentDispositionFilename } from "@/lib/safe-filename";
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      token: string;
    }>;
  },
) {
  const { token } = await params;
  const result = await getSharedMedia(token);
  if (!result.success || !result.link || !result.link.media) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const { media } = result.link;
  if (
    media.mimeType.startsWith("image/") &&
    !ALLOWED_IMAGE_TYPES.includes(media.mimeType)
  ) {
    return new NextResponse("Unsupported image format", {
      status: 415,
    });
  }
  try {
    const key = media.s3Key;
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });
    let s3Response: GetObjectCommandOutput;
    try {
      s3Response = await s3Client.send(command, {
        abortSignal: request.signal,
      });
    } catch (error) {
      logger.error(`Failed to fetch from S3:`, error);
      return new NextResponse("Failed to fetch media", { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", s3Response.ContentType || media.mimeType);
    if (s3Response.ContentLength) {
      headers.set("Content-Length", String(s3Response.ContentLength));
    }
    if (s3Response.ETag) {
      headers.set("ETag", s3Response.ETag);
    }
    if (s3Response.LastModified) {
      headers.set("Last-Modified", s3Response.LastModified.toUTCString());
    }
    headers.set(
      "Cache-Control",
      "public, max-age=86400, stale-while-revalidate=604800",
    );
    headers.set(
      "CDN-Cache-Control",
      "public, max-age=31536000, stale-while-revalidate=604800",
    );
    headers.set(
      "Cloudflare-CDN-Cache-Control",
      "public, max-age=31536000, stale-while-revalidate=604800",
    );
    headers.set(
      "Content-Disposition",
      `inline; filename="${contentDispositionFilename(media.filename)}"`,
    );
    return new NextResponse(s3Response.Body as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    logger.error("Error generating download URL:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
