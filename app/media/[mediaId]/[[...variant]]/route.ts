import {
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { convertHeicToJpeg } from "@/lib/media/heic";
import { S3_BUCKET_NAME, s3Client } from "@/lib/media/s3";
import { can } from "@/lib/policy";

const getCachedMedia = unstable_cache(
  async (mediaId: string) => {
    return await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: {
        event: true,
      },
    });
  },
  ["media-lookup"],
  { revalidate: 3600, tags: ["media"] },
);

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
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) {
    return new NextResponse("Media not found", { status: 404 });
  }
  const variant = variantPath?.[0];
  if (variant && !["thumbnail", "display", "original"].includes(variant)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const searchParams = request.nextUrl.searchParams;
  const download = searchParams.get("download") === "true";
  const requestRange = request.headers.get("range") ?? undefined;
  if (requestRange && !/^bytes=\d*-\d*(,\d*-\d*)?$/.test(requestRange)) {
    return new NextResponse("Invalid range", { status: 416 });
  }
  const mediaItem = await getCachedMedia(mediaId);
  if (!mediaItem) {
    return new NextResponse("Media not found", { status: 404 });
  }
  if (mediaItem.blurStatus === "pending") {
    return new NextResponse(
      "This photo is currently under review. Come back later.",
      { status: 423 },
    );
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
      logger.error("HEIC conversion failed:", error);
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
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
    Range: requestRange,
    IfNoneMatch: request.headers.get("if-none-match") ?? undefined,
    IfModifiedSince: request.headers.get("if-modified-since")
      ? new Date(request.headers.get("if-modified-since") as string)
      : undefined,
  });
  let s3Response: GetObjectCommandOutput;
  try {
    s3Response = await s3Client.send(command);
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 304) {
      return new NextResponse(null, { status: 304 });
    }
    logger.error(`Failed to fetch from S3:`, error);
    return new NextResponse("Failed to fetch media", { status: 502 });
  }
  const headers = new Headers();
  headers.set("Content-Type", s3Response.ContentType || mediaItem.mimeType);
  headers.set("X-Content-Type-Options", "nosniff");
  if (s3Response.ContentLength) {
    headers.set("Content-Length", String(s3Response.ContentLength));
  }
  if (s3Response.ETag) {
    headers.set("ETag", s3Response.ETag);
  }
  if (s3Response.LastModified) {
    headers.set("Last-Modified", s3Response.LastModified.toUTCString());
  }
  if (s3Response.AcceptRanges) {
    headers.set("Accept-Ranges", s3Response.AcceptRanges);
  }
  if (s3Response.ContentRange) {
    headers.set("Content-Range", s3Response.ContentRange);
  }
  if (variant === "original") {
    return new NextResponse("Not found", { status: 404 });
  }
  if (mediaItem.blurStatus === "approved") {
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("CDN-Cache-Control", "no-store");
    headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  } else if (mediaItem.event.visibility === "public") {
    const browserCache =
      variant === "thumbnail"
        ? "public, max-age=31536000, immutable"
        : "public, max-age=86400, stale-while-revalidate=604800";
    const cdnCache =
      variant === "thumbnail"
        ? "public, max-age=31536000, immutable"
        : "public, max-age=31536000, stale-while-revalidate=604800";
    headers.set("Cache-Control", browserCache);
    headers.set("CDN-Cache-Control", cdnCache);
    headers.set("Cloudflare-CDN-Cache-Control", cdnCache);
  } else {
    headers.set("Cache-Control", "private, max-age=3600");
  }
  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  } else {
    headers.set("Content-Disposition", `inline; filename="${filename}"`);
  }
  return new NextResponse(s3Response.Body as ReadableStream, {
    status: s3Response.ContentRange ? 206 : 200,
    headers,
  });
}
