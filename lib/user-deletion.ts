import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  apiKeys,
  commentLikes,
  dataExports,
  eventFaceIndexes,
  events,
  faceBlurSubscriptions,
  facePrivacyPreferences,
  faceScans,
  media,
  mediaLikes,
  series,
  users,
} from "@/lib/db/schema";
import { rebuildEventFaceIndex } from "@/lib/face-indexing";
import { logger } from "@/lib/logger";
import { deleteFromS3 } from "@/lib/media/s3";
import {
  deleteBatchMedia,
  deleteMediaAndThumbnail,
} from "@/lib/media/thumbnail";
import { deleteVisionGallery } from "@/lib/vision-client";
export async function deleteUserContent(userId: string) {
  const userMedia = await db.query.media.findMany({
    where: eq(media.uploadedById, userId),
  });
  const { successfulIds: successfulMediaIds } =
    await deleteBatchMedia(userMedia);
  const userEvents = await db.query.events.findMany({
    where: eq(events.createdById, userId),
  });
  const successfulEventIds: string[] = [];
  for (const event of userEvents) {
    let eventDeletionFailed = false;
    const faceIndex = await db.query.eventFaceIndexes.findFirst({
      where: eq(eventFaceIndexes.eventId, event.id),
      columns: { galleryId: true },
    });
    if (faceIndex?.galleryId) {
      await deleteVisionGallery(faceIndex.galleryId).catch((error) => {
        logger.error(
          `Failed to delete face gallery for event ${event.id}:`,
          error,
        );
        eventDeletionFailed = true;
      });
    }
    if (event.bannerS3Key) {
      try {
        await deleteMediaAndThumbnail(event.bannerS3Key, null);
      } catch (e) {
        logger.error(`Failed to delete event banner ${event.id}:`, e);
        eventDeletionFailed = true;
      }
    }
    const eventMedia = await db.query.media.findMany({
      where: eq(media.eventId, event.id),
    });
    const { hasErrors: mediaDeletionErrors } =
      await deleteBatchMedia(eventMedia);
    if (mediaDeletionErrors) {
      eventDeletionFailed = true;
    }
    if (!eventDeletionFailed) {
      successfulEventIds.push(event.id);
    }
  }
  const userSeries = await db.query.series.findMany({
    where: eq(series.createdById, userId),
  });
  const successfulSeriesIds: string[] = [];
  for (const s of userSeries) {
    let seriesDeletionFailed = false;
    if (s.bannerS3Key) {
      try {
        await deleteMediaAndThumbnail(s.bannerS3Key, null);
      } catch (e) {
        logger.error(`Failed to delete series banner ${s.id}:`, e);
        seriesDeletionFailed = true;
      }
    }
    if (!seriesDeletionFailed) {
      successfulSeriesIds.push(s.id);
    }
  }
  const userExports = await db.query.dataExports.findMany({
    where: eq(dataExports.userId, userId),
    columns: { id: true, s3Key: true },
  });
  for (const e of userExports) {
    if (e.s3Key) {
      try {
        await deleteFromS3(e.s3Key);
      } catch (err) {
        logger.error(`Failed to delete export ${e.id}:`, err);
      }
    }
  }
  await db.transaction(async (tx) => {
    if (successfulMediaIds.length > 0) {
      await tx.delete(media).where(inArray(media.id, successfulMediaIds));
    }
    if (successfulEventIds.length > 0) {
      await tx.delete(events).where(inArray(events.id, successfulEventIds));
    }
    if (successfulSeriesIds.length > 0) {
      await tx.delete(series).where(inArray(series.id, successfulSeriesIds));
    }
    await tx.delete(mediaLikes).where(eq(mediaLikes.userId, userId));
    await tx.delete(commentLikes).where(eq(commentLikes.userId, userId));
    await tx.delete(dataExports).where(eq(dataExports.userId, userId));
    await tx
      .delete(faceBlurSubscriptions)
      .where(eq(faceBlurSubscriptions.userId, userId));
    await tx.delete(faceScans).where(eq(faceScans.userId, userId));
    await tx
      .delete(facePrivacyPreferences)
      .where(eq(facePrivacyPreferences.userId, userId));
    await tx
      .update(apiKeys)
      .set({ isRevoked: true })
      .where(eq(apiKeys.userId, userId));
    const allMediaDeleted = successfulMediaIds.length === userMedia.length;
    const allEventsDeleted = successfulEventIds.length === userEvents.length;
    const allSeriesDeleted = successfulSeriesIds.length === userSeries.length;
    if (allMediaDeleted && allEventsDeleted && allSeriesDeleted) {
      await tx
        .update(users)
        .set({
          name: "Deleted User",
          preferredName: null,
          email: `deleted-${userId}@deleted.hackclub.com`,
          hackclubId: `deleted-${userId}`,
          handle: `deleted-${userId}`,
          bio: null,
          socialLinks: null,
          slackId: null,
          hcaAccessToken: null,
          hcaRefreshToken: null,
          isGlobalAdmin: false,
          isBanned: false,
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      logger.warn(
        `Partial deletion for user ${userId}. User record preserved.`,
      );
    }
  });
  const deletedEventIds = new Set(successfulEventIds);
  const deletedMediaIds = new Set(successfulMediaIds);
  const affectedEventIds = new Set(
    userMedia
      .filter((item) => deletedMediaIds.has(item.id))
      .map((item) => item.eventId)
      .filter((eventId) => !deletedEventIds.has(eventId)),
  );
  for (const eventId of affectedEventIds) {
    await rebuildEventFaceIndex(eventId).catch((error) =>
      logger.error(`Failed to rebuild face index for event ${eventId}`, error),
    );
  }
  const userCheck = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { deletedAt: true },
  });
  return !!userCheck?.deletedAt;
}
