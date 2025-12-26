import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  events,
  media,
  mediaComments,
  mediaLikes,
  users,
} from "@/lib/db/schema";
import { filterDeletableMedia } from "@/lib/policy";
export type FeedItem = {
  id: string;
  type: "photo" | "comment" | "like";
  timestamp: Date;
  event: {
    id: string | undefined;
    name: string | undefined;
    slug: string | undefined;
    visibility: string | undefined;
  };
  user: {
    id: string | undefined;
    email: string | undefined;
    slackId: string | null | undefined;
    name: string | undefined;
    avatarS3Key: string | null | undefined;
    handle: string | null | undefined;
  };
  media?: {
    id: string;
    filename: string;
    s3Url: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    thumbnailS3Key?: string | null;
    exifData: Record<string, unknown> | null;
    uploadedAt: Date;
    uploadedBy: {
      id: string | undefined;
      name: string | undefined;
      slackId?: string | null;
      avatarS3Key?: string | null;
    };
    likeCount: number;
    commentCount: number;
    canDelete?: boolean;
  };
  comment?: {
    id: string;
    content: string;
    mediaId: string;
  };
};
export async function fetchFeedItems(
  accessibleEventIds: string[],
  limit: number,
  offset: number,
  userId?: string,
): Promise<{
  items: FeedItem[];
  hasMore: boolean;
}> {
  if (accessibleEventIds.length === 0) {
    return { items: [], hasMore: false };
  }
  const recentMedia = await db
    .select({
      id: media.id,
      timestamp: media.uploadedAt,
      eventId: media.eventId,
      userId: media.uploadedById,
      likeCount:
        sql<number>`(SELECT COUNT(*) FROM ${mediaLikes} WHERE ${mediaLikes.mediaId} = ${media.id})::int`.mapWith(
          Number,
        ),
      commentCount:
        sql<number>`(SELECT COUNT(*) FROM ${mediaComments} WHERE ${mediaComments.mediaId} = ${media.id} AND ${mediaComments.parentCommentId} IS NULL)::int`.mapWith(
          Number,
        ),
    })
    .from(media)
    .where(inArray(media.eventId, accessibleEventIds))
    .orderBy(desc(media.uploadedAt))
    .limit(limit + offset);
  const recentComments = await db
    .select({
      id: mediaComments.id,
      timestamp: mediaComments.createdAt,
      mediaId: mediaComments.mediaId,
      userId: mediaComments.userId,
      content: mediaComments.content,
    })
    .from(mediaComments)
    .innerJoin(media, eq(mediaComments.mediaId, media.id))
    .where(inArray(media.eventId, accessibleEventIds))
    .orderBy(desc(mediaComments.createdAt))
    .limit(limit + offset);
  const recentLikes = await db
    .select({
      id: mediaLikes.id,
      timestamp: mediaLikes.createdAt,
      mediaId: mediaLikes.mediaId,
      userId: mediaLikes.userId,
    })
    .from(mediaLikes)
    .innerJoin(media, eq(mediaLikes.mediaId, media.id))
    .where(inArray(media.eventId, accessibleEventIds))
    .orderBy(desc(mediaLikes.createdAt))
    .limit(limit + offset);
  const allActivities = [
    ...recentMedia.map((m) => ({ ...m, activityType: "photo" as const })),
    ...recentComments.map((c) => ({ ...c, activityType: "comment" as const })),
    ...recentLikes.map((l) => ({ ...l, activityType: "like" as const })),
  ];
  allActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const slicedActivities = allActivities.slice(offset, offset + limit);
  const userIds = [...new Set(slicedActivities.map((a) => a.userId))];
  const mediaIds = [
    ...new Set([
      ...slicedActivities
        .filter(
          (
            a,
          ): a is typeof a & {
            mediaId: string;
          } => "mediaId" in a,
        )
        .map((a) => a.mediaId),
      ...slicedActivities
        .filter((a) => a.activityType === "photo")
        .map((a) => a.id as string),
    ]),
  ];
  const [usersData, mediaData] = await Promise.all([
    userIds.length > 0
      ? db.query.users.findMany({
          where: inArray(users.id, userIds),
        })
      : Promise.resolve([]),
    mediaIds.length > 0
      ? db
          .select({
            id: media.id,
            filename: media.filename,
            s3Url: media.s3Url,
            mimeType: media.mimeType,
            width: media.width,
            height: media.height,
            thumbnailS3Key: media.thumbnailS3Key,
            exifData: media.exifData,
            uploadedAt: media.uploadedAt,
            uploadedById: media.uploadedById,
            eventId: media.eventId,
            likeCount:
              sql<number>`(SELECT COUNT(*) FROM ${mediaLikes} WHERE ${mediaLikes.mediaId} = ${media.id})::int`.mapWith(
                Number,
              ),
            commentCount:
              sql<number>`(SELECT COUNT(*) FROM ${mediaComments} WHERE ${mediaComments.mediaId} = ${media.id} AND ${mediaComments.parentCommentId} IS NULL)::int`.mapWith(
                Number,
              ),
            uploaderEmail: users.email,
            uploaderName: users.name,
            uploaderPreferredName: users.preferredName,
            uploaderAvatarS3Key: users.avatarS3Key,
            uploaderSlackId: users.slackId,
            eventName: events.name,
            eventSlug: events.slug,
            eventVisibility: events.visibility,
            eventCoverImage: events.bannerS3Key,
            eventLocation: events.location,
            eventStartDate: events.eventDate,
          })
          .from(media)
          .innerJoin(users, eq(media.uploadedById, users.id))
          .leftJoin(events, eq(media.eventId, events.id))
          .where(inArray(media.id, mediaIds))
      : Promise.resolve([]),
  ]);
  const usersMap = new Map(usersData.map((u) => [u.id, u]));
  const mediaMap = new Map(mediaData.map((m) => [m.id, m]));
  const deletableMediaIds = new Set<string>();
  if (userId && mediaData.length > 0) {
    const candidates = mediaData
      .filter(
        (
          m,
        ): m is typeof m & {
          eventId: string;
        } => !!m.eventId && !!m.uploadedById,
      )
      .map((m) => ({
        id: m.id,
        eventId: m.eventId,
        uploadedById: m.uploadedById,
      }));
    const deletable = await filterDeletableMedia(userId, candidates);
    for (const m of deletable) {
      deletableMediaIds.add(m.id);
    }
  }
  const feedItems: FeedItem[] = slicedActivities.map((activity) => {
    const user = usersMap.get(activity.userId);
    const feedUser = {
      id: user?.id,
      email: user?.email,
      slackId: user?.slackId,
      name: user?.preferredName || user?.name,
      avatarS3Key: user?.avatarS3Key,
      handle: user?.handle,
    };
    if (activity.activityType === "photo") {
      const mediaItem = mediaMap.get(activity.id);
      return {
        id: activity.id,
        type: "photo",
        timestamp: activity.timestamp,
        event: {
          id: mediaItem?.eventId,
          name: mediaItem?.eventName || undefined,
          slug: mediaItem?.eventSlug || undefined,
          visibility: mediaItem?.eventVisibility || undefined,
          coverImage: mediaItem?.eventCoverImage || undefined,
          location: mediaItem?.eventLocation || undefined,
          startDate: mediaItem?.eventStartDate || undefined,
        },
        user: feedUser,
        media: mediaItem
          ? {
              id: mediaItem.id,
              filename: mediaItem.filename,
              s3Url: mediaItem.s3Url,
              mimeType: mediaItem.mimeType,
              width: mediaItem.width,
              height: mediaItem.height,
              thumbnailS3Key: mediaItem.thumbnailS3Key,
              exifData: mediaItem.exifData as Record<string, unknown> | null,
              uploadedAt: mediaItem.uploadedAt,
              uploadedBy: {
                id: mediaItem.uploadedById,
                name:
                  mediaItem.uploaderPreferredName ||
                  mediaItem.uploaderName ||
                  mediaItem.uploaderEmail.split("@")[0],
                email: mediaItem.uploaderEmail,
                avatarS3Key: mediaItem.uploaderAvatarS3Key,
                slackId: mediaItem.uploaderSlackId,
              },
              likeCount: mediaItem.likeCount,
              commentCount: mediaItem.commentCount,
              canDelete: deletableMediaIds.has(mediaItem.id),
            }
          : undefined,
      };
    } else if (activity.activityType === "comment") {
      const mediaItem = mediaMap.get(activity.mediaId);
      return {
        id: activity.id,
        type: "comment",
        timestamp: activity.timestamp,
        event: {
          id: mediaItem?.eventId,
          name: mediaItem?.eventName || undefined,
          slug: mediaItem?.eventSlug || undefined,
          visibility: mediaItem?.eventVisibility || undefined,
          coverImage: mediaItem?.eventCoverImage || undefined,
          location: mediaItem?.eventLocation || undefined,
          startDate: mediaItem?.eventStartDate || undefined,
        },
        user: feedUser,
        comment: {
          id: activity.id,
          content: activity.content,
          mediaId: activity.mediaId,
        },
        media: mediaItem
          ? {
              id: mediaItem.id,
              filename: mediaItem.filename,
              s3Url: mediaItem.s3Url,
              mimeType: mediaItem.mimeType,
              width: mediaItem.width,
              height: mediaItem.height,
              thumbnailS3Key: mediaItem.thumbnailS3Key,
              exifData: mediaItem.exifData as Record<string, unknown> | null,
              uploadedAt: mediaItem.uploadedAt,
              uploadedBy: {
                id: mediaItem.uploadedById,
                name:
                  mediaItem.uploaderPreferredName ||
                  mediaItem.uploaderName ||
                  mediaItem.uploaderEmail.split("@")[0],
                email: mediaItem.uploaderEmail,
                avatarS3Key: mediaItem.uploaderAvatarS3Key,
                slackId: mediaItem.uploaderSlackId,
              },
              likeCount: mediaItem.likeCount,
              commentCount: mediaItem.commentCount,
              canDelete: deletableMediaIds.has(mediaItem.id),
            }
          : undefined,
      };
    } else {
      const mediaItem = mediaMap.get(activity.mediaId);
      return {
        id: activity.id,
        type: "like",
        timestamp: activity.timestamp,
        event: {
          id: mediaItem?.eventId,
          name: mediaItem?.eventName || undefined,
          slug: mediaItem?.eventSlug || undefined,
          visibility: mediaItem?.eventVisibility || undefined,
          coverImage: mediaItem?.eventCoverImage || undefined,
          location: mediaItem?.eventLocation || undefined,
          startDate: mediaItem?.eventStartDate || undefined,
        },
        user: feedUser,
        media: mediaItem
          ? {
              id: mediaItem.id,
              filename: mediaItem.filename,
              s3Url: mediaItem.s3Url,
              mimeType: mediaItem.mimeType,
              width: mediaItem.width,
              height: mediaItem.height,
              thumbnailS3Key: mediaItem.thumbnailS3Key,
              exifData: mediaItem.exifData as Record<string, unknown> | null,
              uploadedAt: mediaItem.uploadedAt,
              uploadedBy: {
                id: mediaItem.uploadedById,
                name:
                  mediaItem.uploaderPreferredName ||
                  mediaItem.uploaderName ||
                  mediaItem.uploaderEmail.split("@")[0],
                email: mediaItem.uploaderEmail,
                avatarS3Key: mediaItem.uploaderAvatarS3Key,
                slackId: mediaItem.uploaderSlackId,
              },
              likeCount: mediaItem.likeCount,
              commentCount: mediaItem.commentCount,
              canDelete: deletableMediaIds.has(mediaItem.id),
            }
          : undefined,
      };
    }
  });
  return {
    items: feedItems,
    hasMore: feedItems.length === limit,
  };
}
