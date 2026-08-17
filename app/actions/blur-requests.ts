"use server";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  blurRequests,
  eventFaceIndexes,
  faceBlurSubscriptions,
  faceScans,
  media,
  mediaFaceDetections,
} from "@/lib/db/schema";
import {
  rebuildEventFaceIndex,
  searchFaceScanInEvent,
} from "@/lib/face-indexing";
import { logger } from "@/lib/logger";
import {
  createSharp,
  MAX_BUFFERED_IMAGE_BYTES,
  withImageProcessingSlot,
} from "@/lib/media/image-processing";
import { getSignedDownloadUrl, uploadToS3 } from "@/lib/media/s3";
import {
  ALLOWED_IMAGE_TYPES,
  isUnsupportedImageBuffer,
} from "@/lib/media/validation";
import { can, getUserContext, type UserContext } from "@/lib/policy";

type BlurRegion = { x: number; y: number; width: number; height: number };
type BlurSubmission = {
  mediaId: string;
  regions: BlurRegion[];
  previewDataUrl?: string;
  source?: "manual" | "face" | "automatic_face";
  faceScanId?: string;
  faceDetectionId?: string;
};

const MAX_BLUR_SUBMISSIONS = 200;
const MAX_BLUR_REGIONS = 100;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_PREVIEW_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BLUR_AREA_RATIO = 2;

function blurRegionArea(region: BlurRegion) {
  const left = Math.max(
    0,
    Math.min(1, Math.min(region.x, region.x + region.width)),
  );
  const right = Math.max(
    0,
    Math.min(1, Math.max(region.x, region.x + region.width)),
  );
  const top = Math.max(
    0,
    Math.min(1, Math.min(region.y, region.y + region.height)),
  );
  const bottom = Math.max(
    0,
    Math.min(1, Math.max(region.y, region.y + region.height)),
  );
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function estimatedDataUrlBytes(dataUrl?: string) {
  if (!dataUrl) return 0;
  const separator = dataUrl.indexOf(",");
  if (separator === -1) return Number.POSITIVE_INFINITY;
  return Math.floor(((dataUrl.length - separator - 1) * 3) / 4);
}

async function createBlurThumbnail(buffer: Buffer) {
  return await withImageProcessingSlot(() =>
    createSharp(buffer)
      .resize(400, 400, { fit: "cover", position: "center" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer(),
  );
}

async function readResponseBuffer(response: Response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_BUFFERED_IMAGE_BYTES) {
    throw new Error("Source photo exceeds the server processing limit");
  }
  if (!response.body) throw new Error("Source photo had no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BUFFERED_IMAGE_BYTES) {
        await reader.cancel("Source photo exceeds processing limit");
        throw new Error("Source photo exceeds the server processing limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

async function renderBlurredPhotoInternal(
  sourceKey: string,
  regions: BlurRegion[],
  intensity = 12,
  mimeType = "image/jpeg",
) {
  const sourceUrl = await getSignedDownloadUrl(sourceKey);
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error("Failed to fetch source photo");
  const input = await readResponseBuffer(response);
  const base = await createSharp(input).rotate().withMetadata({}).toBuffer();
  const metadata = await createSharp(base).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("Invalid source photo");
  const overlays: { input: Buffer; left: number; top: number }[] = [];
  for (const region of regions) {
    const x = Number.isFinite(region.x) ? region.x : 0;
    const y = Number.isFinite(region.y) ? region.y : 0;
    const regionWidth = Number.isFinite(region.width) ? region.width : 0;
    const regionHeight = Number.isFinite(region.height) ? region.height : 0;
    const rawLeft = Math.floor(Math.min(x, x + regionWidth) * width);
    const rawTop = Math.floor(Math.min(y, y + regionHeight) * height);
    const rawRight = Math.ceil(Math.max(x, x + regionWidth) * width);
    const rawBottom = Math.ceil(Math.max(y, y + regionHeight) * height);
    const left = Math.max(0, Math.min(width - 1, rawLeft));
    const top = Math.max(0, Math.min(height - 1, rawTop));
    const right = Math.max(0, Math.min(width, rawRight));
    const bottom = Math.max(0, Math.min(height, rawBottom));
    if (right <= left || bottom <= top) continue;
    const boxWidth = right - left;
    const boxHeight = bottom - top;
    if (left + boxWidth > width || top + boxHeight > height) continue;
    const pixelWidth = Math.max(1, Math.floor(boxWidth / 64));
    const pixelHeight = Math.max(1, Math.floor(boxHeight / 64));
    const inputBuffer = await createSharp(base)
      .extract({
        left,
        top,
        width: boxWidth,
        height: boxHeight,
      })
      .resize(pixelWidth, pixelHeight, { kernel: "nearest" })
      .resize(boxWidth, boxHeight, { kernel: "nearest" })
      .blur(Math.max(40, intensity * 6))
      .toBuffer();
    overlays.push({ input: inputBuffer, left, top });
  }
  const composited = overlays.length
    ? await createSharp(base).composite(overlays).keepMetadata().toBuffer()
    : base;
  const output = createSharp(composited).keepMetadata();
  if (mimeType === "image/png") {
    return { buffer: await output.png().toBuffer(), mimeType: "image/png" };
  }
  if (mimeType === "image/webp") {
    return {
      buffer: await output.webp({ quality: 90 }).toBuffer(),
      mimeType: "image/webp",
    };
  }
  return {
    buffer: await output.jpeg({ quality: 95, mozjpeg: true }).toBuffer(),
    mimeType: "image/jpeg",
  };
}

async function renderBlurredPhoto(
  sourceKey: string,
  regions: BlurRegion[],
  intensity = 12,
  mimeType = "image/jpeg",
) {
  return await withImageProcessingSlot(() =>
    renderBlurredPhotoInternal(sourceKey, regions, intensity, mimeType),
  );
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("Invalid preview image");
  const estimatedBytes = Math.floor((match[2].length * 3) / 4);
  if (estimatedBytes > MAX_PREVIEW_BYTES) throw new Error("Preview too large");
  const buffer = Buffer.from(match[2], "base64");
  if (isUnsupportedImageBuffer(buffer)) {
    throw new Error("Unsupported image format");
  }
  return { mimeType: match[1], buffer };
}

async function submitBlurRequestsForUser(
  user: UserContext,
  submissions: BlurSubmission[],
) {
  if (submissions.length === 0) {
    return { success: false, error: "No blur requests selected" };
  }
  if (submissions.length > MAX_BLUR_SUBMISSIONS) {
    return { success: false, error: "Too many blur requests" };
  }
  if (submissions.some((item) => item.regions.length > MAX_BLUR_REGIONS)) {
    return { success: false, error: "Too many blur regions" };
  }
  if (
    submissions.some(
      (item) =>
        item.regions.reduce((sum, region) => sum + blurRegionArea(region), 0) >
        MAX_TOTAL_BLUR_AREA_RATIO,
    )
  ) {
    return { success: false, error: "Blur regions cover too much image area" };
  }
  if (
    submissions.reduce(
      (sum, item) => sum + estimatedDataUrlBytes(item.previewDataUrl),
      0,
    ) > MAX_TOTAL_PREVIEW_BYTES
  ) {
    return { success: false, error: "Blur previews are too large" };
  }
  try {
    const mediaIds = submissions.map((item) => item.mediaId);
    const items = await db.query.media.findMany({
      where: inArray(media.id, mediaIds),
      with: { event: true },
    });
    const mediaById = new Map(items.map((item) => [item.id, item]));
    for (const submission of submissions) {
      const item = mediaById.get(submission.mediaId);
      if (!item) return { success: false, error: "Media not found" };
      if (!(await can(user, "view", "media", item))) {
        return { success: false, error: "Forbidden" };
      }
      if (!item.mimeType.startsWith("image/")) {
        return { success: false, error: "Blur requests only support photos" };
      }
      if (!ALLOWED_IMAGE_TYPES.includes(item.mimeType)) {
        return {
          success: false,
          error: "Unsupported image format",
        };
      }
    }

    for (const submission of submissions) {
      const item = mediaById.get(submission.mediaId)!;
      const rendered = submission.previewDataUrl
        ? decodeDataUrl(submission.previewDataUrl)
        : {
            ...(await renderBlurredPhoto(
              item.s3Key,
              submission.regions,
              12,
              item.mimeType,
            )),
          };
      const { mimeType, buffer } = rendered;
      const requestId = randomUUID();
      const ext =
        mimeType === "image/png"
          ? "png"
          : mimeType === "image/webp"
            ? "webp"
            : "jpg";
      const blurredS3Key = `media/${item.id}/blur-requests/${requestId}.${ext}`;
      const thumbnailS3Key = `media/${item.id}/blur-requests/${requestId}-thumb.jpg`;
      const thumbnail = await createBlurThumbnail(buffer);
      await uploadToS3(buffer, blurredS3Key, mimeType, undefined, {
        uploadedBy: user.id,
        mediaId: item.id,
      });
      await uploadToS3(thumbnail, thumbnailS3Key, "image/jpeg", undefined, {
        uploadedBy: user.id,
        mediaId: item.id,
      });
      await db.insert(blurRequests).values({
        id: requestId,
        mediaId: item.id,
        requesterId: user.id,
        source: submission.source ?? "manual",
        faceScanId: submission.faceScanId,
        faceDetectionId: submission.faceDetectionId,
        regions: submission.regions,
        blurredS3Key,
        blurredThumbnailS3Key: thumbnailS3Key,
      });
      await auditLog(user.id, "create", "blur_request", requestId, {
        mediaId: item.id,
      });
      revalidatePath(`/events/${item.event.slug}`);
    }
    revalidateTag("media", "default");
    revalidatePath("/admin/blur-requests");
    revalidatePath("/users/[username]", "page");
    return { success: true };
  } catch (error) {
    logger.error("Error submitting blur requests:", error);
    return { success: false, error: "Failed to submit blur requests" };
  }
}

export async function submitBlurRequests(submissions: BlurSubmission[]) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  return submitBlurRequestsForUser(user, submissions);
}

export async function submitFaceBlurRequests(input: {
  eventId: string;
  scanId: string;
  detectionIds: string[];
}) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (input.detectionIds.length === 0 || input.detectionIds.length > 200) {
    return { success: false, error: "Select between 1 and 200 photos" };
  }
  const [scan, eventIndex] = await Promise.all([
    db.query.faceScans.findFirst({
      where: and(
        eq(faceScans.id, input.scanId),
        eq(faceScans.userId, user.id),
        eq(faceScans.status, "ready"),
      ),
    }),
    db.query.eventFaceIndexes.findFirst({
      where: eq(eventFaceIndexes.eventId, input.eventId),
    }),
  ]);
  if (
    !scan?.highQuality ||
    Date.now() - scan.createdAt.getTime() > 30 * 24 * 60 * 60 * 1000
  ) {
    return {
      success: false,
      error: "A high-quality face scan from the last 30 days is required",
    };
  }
  if (!eventIndex) return { success: false, error: "Event is not indexed" };
  const matches = await searchFaceScanInEvent({
    userId: user.id,
    scanId: scan.id,
    eventId: input.eventId,
    minSimilarity: eventIndex.blurThreshold,
    persistSuggestions: false,
  });
  const selectedIds = new Set(input.detectionIds);
  const validMatches = matches.filter(
    (match) =>
      selectedIds.has(match.detectionId) &&
      match.similarity >= eventIndex.blurThreshold,
  );
  if (validMatches.length !== selectedIds.size) {
    return { success: false, error: "Some face matches are no longer valid" };
  }
  const detections = await db.query.mediaFaceDetections.findMany({
    where: inArray(
      mediaFaceDetections.id,
      validMatches.map((match) => match.detectionId),
    ),
    with: { media: true },
  });
  const valid = detections.filter(
    (detection) => detection.media.eventId === input.eventId,
  );
  if (valid.length !== selectedIds.size) {
    return { success: false, error: "Some face matches are no longer valid" };
  }
  const existingRequests = await db.query.blurRequests.findMany({
    where: and(
      eq(blurRequests.requesterId, user.id),
      inArray(
        blurRequests.mediaId,
        valid.map((detection) => detection.mediaId),
      ),
      inArray(blurRequests.status, ["pending", "approved"]),
    ),
    columns: { mediaId: true },
  });
  const existingMediaIds = new Set(
    existingRequests.map((item) => item.mediaId),
  );
  const newRequests = valid.filter(
    (detection) => !existingMediaIds.has(detection.mediaId),
  );
  if (newRequests.length === 0) {
    return { success: false, error: "These photos already have blur requests" };
  }
  const result = await submitBlurRequestsForUser(
    user,
    newRequests.map((detection) => ({
      mediaId: detection.mediaId,
      regions: [expandFaceRegion(detection)],
      source: "face" as const,
      faceScanId: scan.id,
      faceDetectionId: detection.id,
    })),
  );
  if (result.success) {
    await db
      .insert(faceBlurSubscriptions)
      .values({ eventId: input.eventId, userId: user.id, faceScanId: scan.id })
      .onConflictDoUpdate({
        target: [faceBlurSubscriptions.eventId, faceBlurSubscriptions.userId],
        set: { faceScanId: scan.id, active: true, updatedAt: new Date() },
      });
    await auditLog(user.id, "create", "face_blur_subscription", input.eventId, {
      matches: newRequests.length,
    });
  }
  return result;
}

function expandFaceRegion(detection: {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
}): BlurRegion {
  const margin = detection.boxWidth < 0.08 ? 0.38 : 0.24;
  const left = Math.max(0, detection.boxX - detection.boxWidth * margin);
  const top = Math.max(
    0,
    detection.boxY - detection.boxHeight * (margin + 0.12),
  );
  const right = Math.min(1, detection.boxX + detection.boxWidth * (1 + margin));
  const bottom = Math.min(
    1,
    detection.boxY + detection.boxHeight * (1 + margin + 0.08),
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export async function getBlurRequests() {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (!(await can(user, "manage", "report", null))) {
    return { success: false, error: "Forbidden" };
  }
  const requests = await db.query.blurRequests.findMany({
    limit: 500,
    with: {
      media: {
        with: {
          event: true,
          uploadedBy: {
            columns: {
              id: true,
              name: true,
              handle: true,
              preferredName: true,
              slackId: true,
            },
          },
        },
      },
      requester: {
        columns: {
          id: true,
          name: true,
          handle: true,
          preferredName: true,
          slackId: true,
        },
      },
    },
    orderBy: [desc(blurRequests.createdAt)],
  });
  return { success: true, requests };
}

export async function getBlurRequestUrls(requestId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (!(await can(user, "manage", "report", null))) {
    return { success: false, error: "Forbidden" };
  }
  const request = await db.query.blurRequests.findFirst({
    where: eq(blurRequests.id, requestId),
    with: { media: true },
  });
  if (!request) return { success: false, error: "Request not found" };
  if (request.status !== "pending") {
    return { success: false, error: "This request was already resolved" };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(request.media.mimeType)) {
    return { success: false, error: "Unsupported image format" };
  }
  return {
    success: true,
    originalUrl: await getSignedDownloadUrl(request.media.s3Key),
    blurredUrl: await getSignedDownloadUrl(request.blurredS3Key),
  };
}

export async function getUserBlurRequests() {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  const requests = await db.query.blurRequests.findMany({
    where: eq(blurRequests.requesterId, user.id),
    limit: 200,
    with: { media: true },
    orderBy: [desc(blurRequests.createdAt)],
  });
  return { success: true, requests };
}

export async function resolveBlurRequest(
  requestId: string,
  status: "approved" | "rejected",
  replacementDataUrl?: string,
  regions?: BlurRegion[],
  intensity = 12,
) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (!(await can(user, "manage", "report", null))) {
    return { success: false, error: "Forbidden" };
  }
  const request = await db.query.blurRequests.findFirst({
    where: eq(blurRequests.id, requestId),
    with: { media: { with: { event: true } } },
  });
  if (!request) return { success: false, error: "Request not found" };
  let blurredS3Key = request.blurredS3Key;
  let thumbnailS3Key = request.blurredThumbnailS3Key;
  const finalRegions = regions ?? (request.regions as BlurRegion[]);
  if (status === "approved" && replacementDataUrl) {
    const { mimeType, buffer } = decodeDataUrl(replacementDataUrl);
    const ext =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";
    blurredS3Key = `media/${request.mediaId}/blur-requests/${request.id}-admin.${ext}`;
    thumbnailS3Key = `media/${request.mediaId}/blur-requests/${request.id}-admin-thumb.jpg`;
    const thumbnail = await createBlurThumbnail(buffer);
    await uploadToS3(buffer, blurredS3Key, mimeType, undefined, {
      uploadedBy: user.id,
      mediaId: request.mediaId,
    });
    await uploadToS3(thumbnail, thumbnailS3Key, "image/jpeg", undefined, {
      uploadedBy: user.id,
      mediaId: request.mediaId,
    });
  } else if (status === "approved") {
    const rendered = await renderBlurredPhoto(
      request.media.s3Key,
      finalRegions,
      intensity,
      request.media.mimeType,
    );
    const buffer = rendered.buffer;
    const finalMimeType = rendered.mimeType;
    const ext =
      finalMimeType === "image/png"
        ? "png"
        : finalMimeType === "image/webp"
          ? "webp"
          : "jpg";
    blurredS3Key = `media/${request.mediaId}/blur-requests/${request.id}-server.${ext}`;
    thumbnailS3Key = `media/${request.mediaId}/blur-requests/${request.id}-approved-thumb.jpg`;
    const thumbnail = await createBlurThumbnail(buffer);
    await uploadToS3(thumbnail, thumbnailS3Key, "image/jpeg", undefined, {
      uploadedBy: user.id,
      mediaId: request.mediaId,
    });
    await uploadToS3(buffer, blurredS3Key, finalMimeType, undefined, {
      uploadedBy: user.id,
      mediaId: request.mediaId,
    });
  }
  const resolved = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(blurRequests)
      .set({
        status,
        regions: finalRegions,
        blurredS3Key,
        blurredThumbnailS3Key: thumbnailS3Key,
        resolvedAt: new Date(),
        resolvedById: user.id,
        updatedAt: new Date(),
      })
      .where(
        and(eq(blurRequests.id, requestId), eq(blurRequests.status, "pending")),
      )
      .returning({ id: blurRequests.id });
    if (!claimed) return false;
    if (status === "approved") {
      const [updatedMedia] = await tx
        .update(media)
        .set({
          s3Key: blurredS3Key,
          thumbnailS3Key,
          originalS3Key: request.media.originalS3Key ?? request.media.s3Key,
          originalThumbnailS3Key:
            request.media.originalThumbnailS3Key ??
            request.media.thumbnailS3Key,
          blurredS3Key,
          blurredThumbnailS3Key: thumbnailS3Key,
          blurStatus: "approved",
        })
        .where(
          and(
            eq(media.id, request.mediaId),
            eq(media.s3Key, request.media.s3Key),
          ),
        )
        .returning({ id: media.id });
      if (!updatedMedia) {
        throw new Error(
          "The photo changed while this request was open. Try again.",
        );
      }
    }
    return true;
  });
  if (!resolved) {
    return { success: false, error: "This request was already resolved" };
  }
  await auditLog(user.id, "update", "blur_request", requestId, { status });
  if (status === "approved") {
    await rebuildEventFaceIndex(request.media.eventId).catch((error) =>
      logger.error("Failed to rebuild face index after blur approval", error),
    );
  }
  revalidateTag("media", "default");
  revalidatePath(`/events/${request.media.event.slug}`);
  revalidatePath("/admin/blur-requests");
  return { success: true };
}
