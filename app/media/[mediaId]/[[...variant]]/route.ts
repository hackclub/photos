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
import {
  createSharp,
  MAX_BUFFERED_IMAGE_BYTES,
  withMediaBufferingSlot,
} from "@/lib/media/image-processing";
import { getSignedUploadUrl, S3_BUCKET_NAME, s3Client } from "@/lib/media/s3";
import {
  generateAndUploadThumbnail,
  getThumbnailS3Key,
} from "@/lib/media/thumbnail";
import { ALLOWED_IMAGE_TYPES } from "@/lib/media/validation";
import { can } from "@/lib/policy";
import { contentDispositionFilename } from "@/lib/safe-filename";

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const mediaRouteGlobal = globalThis as typeof globalThis & {
  __photosPendingMissingThumbnails?: Map<string, Promise<string | null>>;
  __photosFailedThumbnailUntil?: Map<string, number>;
};
const pendingMissingThumbnails =
  mediaRouteGlobal.__photosPendingMissingThumbnails ?? new Map();
const failedThumbnailUntil =
  mediaRouteGlobal.__photosFailedThumbnailUntil ?? new Map();
mediaRouteGlobal.__photosPendingMissingThumbnails = pendingMissingThumbnails;
mediaRouteGlobal.__photosFailedThumbnailUntil = failedThumbnailUntil;
const THUMBNAIL_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_FAILURE_COOLDOWNS = 1_000;

function rememberThumbnailFailure(mediaId: string) {
  const now = Date.now();
  for (const [id, expiresAt] of failedThumbnailUntil) {
    if (expiresAt <= now) failedThumbnailUntil.delete(id);
  }
  while (failedThumbnailUntil.size >= MAX_FAILURE_COOLDOWNS) {
    const oldestId = failedThumbnailUntil.keys().next().value;
    if (!oldestId) break;
    failedThumbnailUntil.delete(oldestId);
  }
  failedThumbnailUntil.set(mediaId, now + THUMBNAIL_FAILURE_COOLDOWN_MS);
}

async function streamToBuffer(
  stream: AsyncIterable<Uint8Array> & { destroy?: (error?: Error) => void },
  maxBytes: number,
) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maxBytes) {
      stream.destroy?.(new Error("Media object exceeds processing limit"));
      throw new Error("Media object exceeds processing limit");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function isValidThumbnailBuffer(buffer: Buffer) {
  if (buffer.length < 32) return false;
  try {
    const metadata = await createSharp(buffer, { failOn: "none" }).metadata();
    return Boolean(metadata.width && metadata.height && metadata.format);
  } catch {
    return false;
  }
}

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

async function fetchValidThumbnail(
  key: string,
  request: NextRequest,
): Promise<{ response: GetObjectCommandOutput; buffer: Buffer } | null> {
  const response = await fetchMediaObject(key, request);
  if (!response.Body) return null;
  const buffer = await streamToBuffer(
    response.Body as AsyncIterable<Uint8Array> & {
      destroy?: (error?: Error) => void;
    },
    MAX_THUMBNAIL_BYTES,
  );
  if (!(await isValidThumbnailBuffer(buffer))) return null;
  return { response, buffer };
}

async function generateMissingImageThumbnailInternal(
  mediaItem: typeof media.$inferSelect,
) {
  if (!mediaItem.mimeType.startsWith("image/")) return null;
  try {
    const source = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: mediaItem.s3Key,
      }),
    );
    if (!source.Body) throw new Error("S3 object had no body");
    const buffer = await streamToBuffer(
      source.Body as AsyncIterable<Uint8Array> & {
        destroy?: (error?: Error) => void;
      },
      MAX_BUFFERED_IMAGE_BYTES,
    );
    const thumbnailS3Key = await generateAndUploadThumbnail(
      buffer,
      mediaItem.mimeType,
      mediaItem.id,
      undefined,
      { uploadedBy: mediaItem.uploadedById, eventId: mediaItem.eventId },
    );
    if (!thumbnailS3Key) return null;
    if (thumbnailS3Key !== mediaItem.thumbnailS3Key) {
      await db
        .update(media)
        .set({ thumbnailS3Key })
        .where(eq(media.id, mediaItem.id));
    }
    return thumbnailS3Key;
  } catch (error) {
    logger.error(
      { mediaId: mediaItem.id, error },
      "thumbnail generation failed",
    );
    return null;
  }
}

async function generateMissingImageThumbnail(
  mediaItem: typeof media.$inferSelect,
) {
  const failureExpiresAt = failedThumbnailUntil.get(mediaItem.id);
  if (failureExpiresAt && failureExpiresAt > Date.now()) return null;
  if (failureExpiresAt) failedThumbnailUntil.delete(mediaItem.id);
  const existing = pendingMissingThumbnails.get(mediaItem.id);
  if (existing) return await existing;

  const generation = withMediaBufferingSlot(() =>
    generateMissingImageThumbnailInternal(mediaItem),
  );
  pendingMissingThumbnails.set(mediaItem.id, generation);
  try {
    const thumbnailS3Key = await generation;
    if (thumbnailS3Key) {
      failedThumbnailUntil.delete(mediaItem.id);
    } else {
      rememberThumbnailFailure(mediaItem.id);
    }
    return thumbnailS3Key;
  } finally {
    if (pendingMissingThumbnails.get(mediaItem.id) === generation) {
      pendingMissingThumbnails.delete(mediaItem.id);
    }
  }
}

async function regenerateAndFetchValidThumbnail(
  mediaItem: typeof media.$inferSelect,
  request: NextRequest,
) {
  const regeneratedThumbnailKey =
    await generateMissingImageThumbnail(mediaItem);
  if (!regeneratedThumbnailKey) return null;
  return await fetchValidThumbnail(regeneratedThumbnailKey, request);
}

async function isAllowedToViewMedia(
  mediaItem: typeof media.$inferSelect & {
    event: {
      visibility: string;
    };
  },
  request: NextRequest,
) {
  if (mediaItem.event.visibility === "public") {
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
    with: {
      event: true,
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
    with: {
      event: true,
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
  let responseBodyLength: number | undefined;
  const shouldValidateThumbnail =
    variant === "thumbnail" && mediaItem.mimeType.startsWith("image/");
  try {
    if (shouldValidateThumbnail) {
      const validThumbnail = await fetchValidThumbnail(s3Key, request);
      if (validThumbnail) {
        s3Response = validThumbnail.response;
        responseBody = validThumbnail.buffer as unknown as BodyInit;
        responseBodyLength = validThumbnail.buffer.length;
        if (
          !mediaItem.thumbnailS3Key &&
          s3Key === getThumbnailS3Key(mediaItem.id)
        ) {
          await db
            .update(media)
            .set({ thumbnailS3Key: s3Key })
            .where(eq(media.id, mediaItem.id));
        }
      } else {
        const regeneratedThumbnail = await regenerateAndFetchValidThumbnail(
          mediaItem,
          request,
        );
        if (!regeneratedThumbnail) {
          return new NextResponse("Failed to generate thumbnail", {
            status: 502,
          });
        }
        s3Response = regeneratedThumbnail.response;
        responseBody = regeneratedThumbnail.buffer as unknown as BodyInit;
        responseBodyLength = regeneratedThumbnail.buffer.length;
      }
    } else {
      s3Response = await fetchMediaObject(s3Key, request, requestRange);
      responseBody = s3Response.Body as ReadableStream;
    }
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 304) {
      return new NextResponse(null, { status: 304 });
    }
    if (shouldValidateThumbnail) {
      try {
        const regeneratedThumbnail = await regenerateAndFetchValidThumbnail(
          mediaItem,
          request,
        );
        if (regeneratedThumbnail) {
          s3Response = regeneratedThumbnail.response;
          responseBody = regeneratedThumbnail.buffer as unknown as BodyInit;
          responseBodyLength = regeneratedThumbnail.buffer.length;
        } else {
          logger.error(`Failed to fetch or regenerate thumbnail:`, error);
          return new NextResponse("Failed to generate thumbnail", {
            status: 502,
          });
        }
      } catch (retryError: any) {
        if (retryError?.$metadata?.httpStatusCode === 304) {
          return new NextResponse(null, { status: 304 });
        }
        logger.error(
          "Failed to fetch regenerated thumbnail from S3:",
          retryError,
        );
        return new NextResponse("Failed to fetch media", { status: 502 });
      }
    } else {
      logger.error(`Failed to fetch from S3:`, error);
      return new NextResponse("Failed to fetch media", { status: 502 });
    }
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    s3Response.ContentType ||
      (variant === "thumbnail" ? "image/jpeg" : mediaItem.mimeType),
  );
  headers.set("X-Content-Type-Options", "nosniff");
  if (responseBodyLength) {
    headers.set("Content-Length", String(responseBodyLength));
  } else if (s3Response.ContentLength) {
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
    const browserCache = "public, max-age=3600, stale-while-revalidate=86400";
    const cdnCache = "public, max-age=3600, stale-while-revalidate=86400";
    headers.set("Cache-Control", browserCache);
    headers.set("CDN-Cache-Control", cdnCache);
    headers.set("Cloudflare-CDN-Cache-Control", cdnCache);
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
