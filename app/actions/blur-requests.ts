"use server";
import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import sharp from "sharp";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { blurRequests, media } from "@/lib/db/schema";
import { getSignedDownloadUrl, uploadToS3 } from "@/lib/media/s3";
import { can, getUserContext } from "@/lib/policy";

type BlurRegion = { x: number; y: number; width: number; height: number };
type BlurSubmission = {
  mediaId: string;
  regions: BlurRegion[];
  previewDataUrl?: string;
};

async function renderBlurredPhoto(
  sourceKey: string,
  regions: BlurRegion[],
  intensity = 12,
  mimeType = "image/jpeg",
) {
  const sourceUrl = await getSignedDownloadUrl(sourceKey);
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error("Failed to fetch source photo");
  const input = Buffer.from(await response.arrayBuffer());
  const base = await sharp(input).rotate().keepMetadata().toBuffer();
  const metadata = await sharp(base).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("Invalid source photo");
  const overlays = (
    await Promise.all(
      regions.map(async (region) => {
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
        if (right <= left || bottom <= top) return null;
        const boxWidth = right - left;
        const boxHeight = bottom - top;
        if (left + boxWidth > width || top + boxHeight > height) return null;
        const inputBuffer = await sharp(base)
          .extract({
            left,
            top,
            width: boxWidth,
            height: boxHeight,
          })
          .blur(intensity)
          .toBuffer();
        return { input: inputBuffer, left, top };
      }),
    )
  ).filter((overlay): overlay is { input: Buffer; left: number; top: number } =>
    Boolean(overlay),
  );
  const output = sharp(base).composite(overlays).keepMetadata();
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

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("Invalid preview image");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

export async function submitBlurRequests(submissions: BlurSubmission[]) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (submissions.length === 0) {
    return { success: false, error: "No blur requests selected" };
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
      const thumbnail = await sharp(buffer)
        .resize(400, 400, { fit: "cover", position: "center" })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
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
        regions: submission.regions,
        blurredS3Key,
        blurredThumbnailS3Key: thumbnailS3Key,
      });
      await db
        .update(media)
        .set({
          blurStatus: "pending",
          originalS3Key: item.originalS3Key ?? item.s3Key,
          originalThumbnailS3Key:
            item.originalThumbnailS3Key ?? item.thumbnailS3Key,
          blurredS3Key,
          blurredThumbnailS3Key: thumbnailS3Key,
        })
        .where(eq(media.id, item.id));
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
    console.error("Error submitting blur requests:", error);
    return { success: false, error: "Failed to submit blur requests" };
  }
}

export async function getBlurRequests() {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (!(await can(user, "manage", "report", null))) {
    return { success: false, error: "Forbidden" };
  }
  const requests = await db.query.blurRequests.findMany({
    with: {
      media: { with: { event: true, uploadedBy: true } },
      requester: true,
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
  const originalKey = request.media.originalS3Key ?? request.media.s3Key;
  return {
    success: true,
    originalUrl: await getSignedDownloadUrl(originalKey),
    blurredUrl: await getSignedDownloadUrl(request.blurredS3Key),
  };
}

export async function getUserBlurRequests() {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  const requests = await db.query.blurRequests.findMany({
    where: eq(blurRequests.requesterId, user.id),
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
    const thumbnail = await sharp(buffer)
      .resize(400, 400, { fit: "cover", position: "center" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    await uploadToS3(buffer, blurredS3Key, mimeType, undefined, {
      uploadedBy: user.id,
      mediaId: request.mediaId,
    });
    await uploadToS3(thumbnail, thumbnailS3Key, "image/jpeg", undefined, {
      uploadedBy: user.id,
      mediaId: request.mediaId,
    });
  } else if (status === "approved") {
    const sourceKey = request.media.originalS3Key ?? request.media.s3Key;
    const rendered = await renderBlurredPhoto(
      sourceKey,
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
    const thumbnail = await sharp(buffer)
      .resize(400, 400, { fit: "cover", position: "center" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    await uploadToS3(thumbnail, thumbnailS3Key, "image/jpeg", undefined, {
      uploadedBy: user.id,
      mediaId: request.mediaId,
    });
    await uploadToS3(buffer, blurredS3Key, finalMimeType, undefined, {
      uploadedBy: user.id,
      mediaId: request.mediaId,
    });
  }
  await db
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
    .where(eq(blurRequests.id, requestId));
  await db
    .update(media)
    .set(
      status === "approved"
        ? {
            s3Key: blurredS3Key,
            thumbnailS3Key,
            originalS3Key: request.media.originalS3Key ?? request.media.s3Key,
            originalThumbnailS3Key:
              request.media.originalThumbnailS3Key ??
              request.media.thumbnailS3Key,
            blurredS3Key,
            blurredThumbnailS3Key: thumbnailS3Key,
            blurStatus: "approved",
          }
        : { blurStatus: null },
    )
    .where(eq(media.id, request.mediaId));
  await auditLog(user.id, "update", "blur_request", requestId, { status });
  revalidateTag("media", "default");
  revalidatePath(`/events/${request.media.event.slug}`);
  revalidatePath("/admin/blur-requests");
  return { success: true };
}
