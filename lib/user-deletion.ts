import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commentLikes,
  dataExports,
  events,
  media,
  mediaLikes,
  series,
  users,
} from "@/lib/db/schema";
import { deleteFromS3 } from "@/lib/media/s3";
import {
  deleteBatchMedia,
  deleteMediaAndThumbnail,
} from "@/lib/media/thumbnail";
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
    if (event.bannerS3Key) {
      try {
        await deleteMediaAndThumbnail(event.bannerS3Key, null);
      } catch (e) {
        console.error(`Failed to delete event banner ${event.id}:`, e);
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
        console.error(`Failed to delete series banner ${s.id}:`, e);
        seriesDeletionFailed = true;
      }
    }
    if (!seriesDeletionFailed) {
      successfulSeriesIds.push(s.id);
    }
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { avatarS3Key: true },
  });
  if (user?.avatarS3Key) {
    try {
      await deleteMediaAndThumbnail(user.avatarS3Key, null);
    } catch (e) {
      console.error(`Failed to delete avatar:`, e);
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
        console.error(`Failed to delete export ${e.id}:`, err);
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
          avatarS3Key: null,
          socialLinks: null,
          slackId: null,
          hcaAccessToken: null,
          isBanned: false,
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      console.warn(
        `Partial deletion for user ${userId}. User record preserved.`,
      );
    }
  });
  const userCheck = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { deletedAt: true },
  });
  return !!userCheck?.deletedAt;
}
