import {
  GetObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { media, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getSignedUploadUrl, S3_BUCKET_NAME, s3Client } from "@/lib/media/s3";
import { getThumbnailS3Key } from "@/lib/media/thumbnail";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validation";
import { can } from "@/lib/policy";
import { contentDispositionFilename } from "@/lib/safe-filename";

async function fetchMediaObject(
  key: string,
  request: NextRequest,
  range?: string,
) {
  return await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Range: range,
      IfNoneMatch: request.headers.get("if-none-match") ?? undefined,
      IfModifiedSince: request.headers.get("if-modified-since")
        ? new Date(request.headers.get("if-modified-since") as string)
        : undefined,
    }),
    { abortSignal: request.signal },
  );
}

async function isAllowedToViewMedia(
  mediaItem: {
    id: string;
    eventId?: string | null;
    event?: { visibility: string };
  },
  request: NextRequest,
) {
  if (mediaItem.event?.visibility === "public") {
    return true;
  }
  let { user } = await getUserContext();
  if (!user) {
    const mobileToken = request.nextUrl.searchParams.get("mobileToken");
    const sessionUser = mobileToken
      ? await verifySessionToken(mobileToken)
      : null;
    if (sessionUser) {
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, sessionUser.id),
        columns: {
          id: true,
          slackId: true,
          isGlobalAdmin: true,
          isBanned: true,
        },
        with: {
          seriesAdminRoles: { columns: { seriesId: true } },
          eventAdminRoles: { columns: { eventId: true } },
        },
      });
      if (dbUser && !dbUser.isBanned) {
        user = {
          id: dbUser.id,
          slackId: dbUser.slackId,
          isGlobalAdmin: dbUser.isGlobalAdmin,
          isBanned: dbUser.isBanned || false,
          seriesAdmins: dbUser.seriesAdminRoles,
          eventAdmins: dbUser.eventAdminRoles,
        };
      }
    }
  }
  if (user) {
    return await can(user, "view", "media", mediaItem);
  }
  return false;
}

const videoThumbnailUploadGlobal = globalThis as typeof globalThis & {
  __photosPendingVideoThumbnailUploads?: Map<string, Promise<string>>;
};
const pendingVideoThumbnailUploads =
  videoThumbnailUploadGlobal.__photosPendingVideoThumbnailUploads ?? new Map();
videoThumbnailUploadGlobal.__photosPendingVideoThumbnailUploads =
  pendingVideoThumbnailUploads;

export async function POST(
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
  const { mediaId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) {
    return new NextResponse("Media not found", { status: 404 });
  }
  const mediaItem = await db.query.media.findFirst({
    where: eq(media.id, mediaId),
    columns: {
      id: true,
      mimeType: true,
      thumbnailS3Key: true,
      blurStatus: true,
    },
    with: {
      event: {
        columns: {
          visibility: true,
        },
      },
    },
  });
  if (!mediaItem) {
    return new NextResponse("Media not found", { status: 404 });
  }
  if (!mediaItem.mimeType.startsWith("video/")) {
    return NextResponse.json(
      { error: "Video thumbnails are generated client-side" },
      { status: 415 },
    );
  }
  if (mediaItem.blurStatus === "pending") {
    return NextResponse.json(
      { error: "This media is currently under review" },
      { status: 423 },
    );
  }
  if (!(await isAllowedToViewMedia(mediaItem, request))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const canonicalThumbnailS3Key = getThumbnailS3Key(mediaItem.id);
  if (mediaItem.thumbnailS3Key) {
    return NextResponse.json({ uploadUrl: null, exists: true });
  }
  const existing = pendingVideoThumbnailUploads.get(mediaItem.id);
  if (existing) {
    try {
      return NextResponse.json({ uploadUrl: await existing, exists: false });
    } catch {
      return NextResponse.json(
        { error: "Thumbnail upload URL generation failed" },
        { status: 500 },
      );
    }
  }
  const generation = getSignedUploadUrl(
    canonicalThumbnailS3Key,
    "image/jpeg",
    5 * 60,
  );
  pendingVideoThumbnailUploads.set(mediaItem.id, generation);
  try {
    const uploadUrl = await generation;
    return NextResponse.json({ uploadUrl, exists: false });
  } catch (error) {
    logger.error("Failed to generate video thumbnail upload URL:", error);
    return NextResponse.json(
      { error: "Thumbnail upload URL generation failed" },
      { status: 500 },
    );
  } finally {
    if (pendingVideoThumbnailUploads.get(mediaItem.id) === generation) {
      pendingVideoThumbnailUploads.delete(mediaItem.id);
    }
  }
}

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
  if (variant && !["thumbnail", "original"].includes(variant)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const searchParams = request.nextUrl.searchParams;
  const download = searchParams.get("download") === "true";
  const requestRange = request.headers.get("range") ?? undefined;
  if (requestRange && !/^bytes=\d*-\d*(,\d*-\d*)?$/.test(requestRange)) {
    return new NextResponse("Invalid range", { status: 416 });
  }
  const mediaItem = await db.query.media.findFirst({
    where: eq(media.id, mediaId),
    columns: {
      id: true,
      mimeType: true,
      thumbnailS3Key: true,
      blurStatus: true,
      s3Key: true,
      filename: true,
      uploadedById: true,
      eventId: true,
    },
    with: {
      event: {
        columns: {
          visibility: true,
        },
      },
    },
  });
  if (!mediaItem) {
    return new NextResponse("Media not found", { status: 404 });
  }
  if (mediaItem.blurStatus === "pending") {
    return new NextResponse(
      "This photo is currently under review. Come back later.",
      { status: 423 },
    );
  }
  const isAllowed = await isAllowedToViewMedia(mediaItem, request);
  if (!isAllowed) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (
    mediaItem.mimeType.startsWith("image/") &&
    !ALLOWED_IMAGE_TYPES.includes(mediaItem.mimeType)
  ) {
    return new NextResponse("Unsupported image format", {
      status: 415,
    });
  }
  if (
    variant === "thumbnail" &&
    mediaItem.mimeType.startsWith("video/") &&
    !mediaItem.thumbnailS3Key
  ) {
    return new NextResponse("Thumbnail not available", { status: 404 });
  }
  let s3Key = mediaItem.s3Key;
  let filename = contentDispositionFilename(mediaItem.filename);
  if (variant === "thumbnail") {
    const baseName =
      filename.substring(0, filename.lastIndexOf(".")) || filename;
    filename = `thumbnail_${baseName}.jpg`;
    if (mediaItem.thumbnailS3Key) {
      s3Key = mediaItem.thumbnailS3Key;
    } else if (mediaItem.mimeType.startsWith("image/")) {
      s3Key = getThumbnailS3Key(mediaItem.id);
    }
  }
  let s3Response: GetObjectCommandOutput;
  let responseBody: BodyInit | ReadableStream;
  try {
    if (!mediaItem.thumbnailS3Key && variant === "thumbnail") {
      await db
        .update(media)
        .set({ thumbnailS3Key: s3Key })
        .where(eq(media.id, mediaItem.id));
    }
    s3Response = await fetchMediaObject(s3Key, request, requestRange);
    responseBody = s3Response.Body as ReadableStream;
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 304) {
      return new NextResponse(null, { status: 304 });
    }
    logger.error(`Failed to fetch from S3:`, error);
    return new NextResponse("Failed to fetch media", { status: 502 });
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    s3Response.ContentType ||
      (variant === "thumbnail" ? "image/jpeg" : mediaItem.mimeType),
  );
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
  const isPartialContent = Boolean(s3Response.ContentRange);
  if (isPartialContent) {
    headers.set("Cache-Control", "private, no-store");
    headers.set("CDN-Cache-Control", "no-store");
  } else if (mediaItem.blurStatus === "approved") {
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("CDN-Cache-Control", "no-store");
  } else if (mediaItem.event.visibility === "public") {
    const browserCache = "public, max-age=3600, stale-while-revalidate=86400";
    const cdnCache = "public, max-age=3600, stale-while-revalidate=86400";
    headers.set("Cache-Control", browserCache);
    headers.set("CDN-Cache-Control", cdnCache);
  } else {
    headers.set("Cache-Control", "private, no-store");
  }
  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  } else {
    headers.set("Content-Disposition", `inline; filename="${filename}"`);
  }
  return new NextResponse(responseBody, {
    status: s3Response.ContentRange ? 206 : 200,
    headers,
  });
}
