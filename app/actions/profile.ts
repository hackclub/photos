"use server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventParticipants,
  faceMatchSuggestions,
  facePrivacyPreferences,
  media,
  mediaLikes,
  mediaMentions,
  users,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getAssetProxyUrl } from "@/lib/media/s3";
import {
  augmentMediaWithPermissions,
  can,
  getAccessibleEventIds,
  getUserContext,
} from "@/lib/policy";
import { toPublicUser } from "@/lib/user-display";

const PROFILE_MEDIA_LIMIT = 500;
const PROFILE_EVENT_LIMIT = 500;

export async function getUserProfileData(userId: string) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (currentUser?.isBanned) {
      return { success: false, error: "Unauthorized" };
    }
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        isBanned: true,
      },
    });
    if (!user) {
      return { success: false, error: "User not found" };
    }
    if (user.isBanned) {
      return { success: false, error: "User is banned" };
    }
    const privacy = await db.query.facePrivacyPreferences.findFirst({
      where: eq(facePrivacyPreferences.userId, userId),
    });
    const privilegedViewer =
      currentUser?.id === userId || currentUser?.isGlobalAdmin === true;
    if (privacy?.hideProfile && !privilegedViewer) {
      return { success: false, error: "User not found" };
    }
    const userUploads = await db.query.media.findMany({
      where: eq(media.uploadedById, userId),
      orderBy: [desc(media.uploadedAt)],
      limit: PROFILE_MEDIA_LIMIT,
      with: {
        event: true,
        uploadedBy: {
          columns: {
            id: true,
            preferredName: true,
            handle: true,
            slackId: true,
          },
        },
      },
    });
    const userLikes = await db.query.mediaLikes.findMany({
      where: eq(mediaLikes.userId, userId),
      orderBy: [desc(mediaLikes.createdAt)],
      limit: PROFILE_MEDIA_LIMIT,
      with: {
        media: {
          with: {
            event: true,
            uploadedBy: {
              columns: {
                id: true,
                preferredName: true,
                handle: true,
                slackId: true,
              },
            },
          },
        },
      },
    });
    const likedMedia = userLikes
      .map((like) => like.media)
      .filter((m) => m !== null);
    const userMentions = await db.query.mediaMentions.findMany({
      where: eq(mediaMentions.userId, userId),
      orderBy: [desc(mediaMentions.createdAt)],
      limit: PROFILE_MEDIA_LIMIT,
      with: {
        media: {
          with: {
            event: true,
            uploadedBy: {
              columns: {
                id: true,
                preferredName: true,
                handle: true,
                slackId: true,
              },
            },
          },
        },
      },
    });
    const mentionedMedia = userMentions
      .map((mention) => mention.media)
      .filter((m) => m !== null);
    const suggestionRows =
      privacy?.hideMentions && !privilegedViewer
        ? []
        : await db.query.faceMatchSuggestions.findMany({
            where: and(
              eq(faceMatchSuggestions.userId, userId),
              eq(faceMatchSuggestions.status, "pending"),
            ),
            orderBy: [desc(faceMatchSuggestions.createdAt)],
            limit: PROFILE_MEDIA_LIMIT,
            with: {
              media: {
                with: {
                  event: true,
                  uploadedBy: {
                    columns: {
                      id: true,
                      preferredName: true,
                      handle: true,
                      slackId: true,
                    },
                  },
                },
              },
            },
          });
    const visibleSuggestionRows = [];
    for (const suggestion of suggestionRows) {
      const eventAdmin = Boolean(
        currentUser &&
          (await can(currentUser, "manage", "event", suggestion.media.eventId)),
      );
      if (privacy?.hideAiSuggestions && !privilegedViewer && !eventAdmin)
        continue;
      visibleSuggestionRows.push({
        suggestion,
        canConfirm: privilegedViewer || eventAdmin,
      });
    }
    const confirmedMediaIds = new Set(mentionedMedia.map((item) => item.id));
    const suggestedMedia = visibleSuggestionRows
      .filter(({ suggestion }) => !confirmedMediaIds.has(suggestion.mediaId))
      .map(({ suggestion, canConfirm }) => ({
        ...suggestion.media,
        suggestedMention: true,
        suggestionId: suggestion.id,
        canConfirmSuggestion:
          canConfirm || currentUser?.id === suggestion.userId,
      }));
    const userEvents = await db.query.eventParticipants.findMany({
      where: eq(eventParticipants.userId, userId),
      orderBy: [desc(eventParticipants.joinedAt)],
      limit: PROFILE_EVENT_LIMIT,
      with: {
        event: {
          with: {
            series: {
              columns: {
                name: true,
              },
            },
          },
        },
      },
    });
    const allEventsMap = new Map<string, any>();
    userUploads.forEach((u) => {
      if (u.event) allEventsMap.set(u.event.id, u.event);
    });
    likedMedia.forEach((m) => {
      if (m.event) allEventsMap.set(m.event.id, m.event);
    });
    mentionedMedia.forEach((m) => {
      if (m.event) allEventsMap.set(m.event.id, m.event);
    });
    suggestedMedia.forEach((m) => {
      if (m.event) allEventsMap.set(m.event.id, m.event);
    });
    userEvents.forEach((p) => {
      if (p.event) allEventsMap.set(p.event.id, p.event);
    });
    const uniqueEvents = Array.from(allEventsMap.values());
    const accessibleEventIds = await getAccessibleEventIds(
      currentUser?.id,
      uniqueEvents,
    );
    const publicUploads = userUploads.map((item) => ({
      ...item,
      uploadedBy: toPublicUser(item.uploadedBy),
    }));
    const publicLikedMedia = likedMedia.map((item) => ({
      ...item,
      uploadedBy: toPublicUser(item.uploadedBy),
    }));
    const publicMentionedMedia = mentionedMedia.map((item) => ({
      ...item,
      uploadedBy: toPublicUser(item.uploadedBy),
    }));
    const publicSuggestedMedia = suggestedMedia.map((item) => ({
      ...item,
      uploadedBy: toPublicUser(item.uploadedBy),
    }));
    const filteredUploads = publicUploads.filter(
      (u) => u.event && accessibleEventIds.has(u.event.id),
    );
    const filteredLikes = publicLikedMedia.filter(
      (m) => m.event && accessibleEventIds.has(m.event.id),
    );
    const filteredMentions = publicMentionedMedia.filter(
      (m) => m.event && accessibleEventIds.has(m.event.id),
    );
    const filteredSuggestions = publicSuggestedMedia.filter(
      (m) => m.event && accessibleEventIds.has(m.event.id),
    );
    const filteredUserEvents = userEvents.filter(
      (p) => p.event && accessibleEventIds.has(p.event.id),
    );
    const mediaIds = Array.from(
      new Set(
        [
          ...filteredUploads,
          ...filteredLikes,
          ...filteredMentions,
          ...filteredSuggestions,
        ].map((item) => item.id),
      ),
    );
    const eventIds = filteredUserEvents.map((item) => item.event.id);
    const [likeCounts, eventMediaCounts, eventParticipantCounts] =
      await Promise.all([
        mediaIds.length > 0
          ? db
              .select({ mediaId: mediaLikes.mediaId, count: count() })
              .from(mediaLikes)
              .where(inArray(mediaLikes.mediaId, mediaIds))
              .groupBy(mediaLikes.mediaId)
          : Promise.resolve([]),
        eventIds.length > 0
          ? db
              .select({ eventId: media.eventId, count: count() })
              .from(media)
              .where(inArray(media.eventId, eventIds))
              .groupBy(media.eventId)
          : Promise.resolve([]),
        eventIds.length > 0
          ? db
              .select({
                eventId: eventParticipants.eventId,
                count: count(),
              })
              .from(eventParticipants)
              .where(inArray(eventParticipants.eventId, eventIds))
              .groupBy(eventParticipants.eventId)
          : Promise.resolve([]),
      ]);
    const likeCountByMediaId = new Map(
      likeCounts.map((item) => [item.mediaId, item.count]),
    );
    const mediaCountByEventId = new Map(
      eventMediaCounts.map((item) => [item.eventId, item.count]),
    );
    const participantCountByEventId = new Map(
      eventParticipantCounts.map((item) => [item.eventId, item.count]),
    );
    const [augmentedUploads, augmentedLikes, augmentedMentions] =
      await Promise.all([
        augmentMediaWithPermissions(currentUser?.id, filteredUploads),
        augmentMediaWithPermissions(currentUser?.id, filteredLikes),
        augmentMediaWithPermissions(currentUser?.id, [
          ...(privacy?.hideMentions && !privilegedViewer
            ? []
            : filteredMentions),
          ...filteredSuggestions,
        ]),
      ]);
    const joinedEvents = await Promise.all(
      filteredUserEvents.map(async (p) => {
        let bannerUrl = null;
        if (p.event.bannerS3Key) {
          bannerUrl = getAssetProxyUrl("event-banner", p.event.id);
        }
        const {
          inviteCode: _inviteCode,
          bannerS3Key: _bannerS3Key,
          createdById: _createdById,
          ...safeEvent
        } = p.event;
        return {
          ...safeEvent,
          joinedAt: p.joinedAt,
          mediaCount: mediaCountByEventId.get(p.event.id) ?? 0,
          participantCount: participantCountByEventId.get(p.event.id) ?? 0,
          bannerUrl,
        };
      }),
    );
    return {
      success: true,
      data: {
        uploads: augmentedUploads.map((u) => ({
          ...u,
          likeCount: likeCountByMediaId.get(u.id) ?? 0,
        })),
        likes: augmentedLikes.map((m) => ({
          ...m,
          likeCount: likeCountByMediaId.get(m.id) ?? 0,
        })),
        mentions: augmentedMentions.map((m) => ({
          ...m,
          likeCount: likeCountByMediaId.get(m.id) ?? 0,
        })),
        events: joinedEvents.filter((e) => e !== null),
      },
    };
  } catch (error) {
    logger.error("Error fetching user profile data:", error);
    return { success: false, error: "Failed to fetch user data" };
  }
}
