"use server";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventParticipants,
  media,
  mediaLikes,
  mediaMentions,
  users,
} from "@/lib/db/schema";
import { getAssetProxyUrl } from "@/lib/media/s3";
import {
  augmentMediaWithPermissions,
  getAccessibleEventIds,
  getUserContext,
} from "@/lib/policy";
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
    const userUploads = await db.query.media.findMany({
      where: eq(media.uploadedById, userId),
      orderBy: [desc(media.uploadedAt)],
      with: {
        event: true,
        uploadedBy: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarS3Key: true,
            avatarSource: true,
            handle: true,
            slackId: true,
          },
        },
        likes: true,
      },
    });
    const userLikes = await db.query.mediaLikes.findMany({
      where: eq(mediaLikes.userId, userId),
      orderBy: [desc(mediaLikes.createdAt)],
      with: {
        media: {
          with: {
            event: true,
            uploadedBy: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarS3Key: true,
                avatarSource: true,
                handle: true,
                slackId: true,
              },
            },
            likes: true,
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
      with: {
        media: {
          with: {
            event: true,
            uploadedBy: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarS3Key: true,
                avatarSource: true,
                handle: true,
                slackId: true,
              },
            },
            likes: true,
          },
        },
      },
    });
    const mentionedMedia = userMentions
      .map((mention) => mention.media)
      .filter((m) => m !== null);
    const userEvents = await db.query.eventParticipants.findMany({
      where: eq(eventParticipants.userId, userId),
      orderBy: [desc(eventParticipants.joinedAt)],
      with: {
        event: {
          with: {
            series: {
              columns: {
                name: true,
              },
            },
            media: {
              columns: {
                id: true,
              },
            },
            participants: {
              columns: {
                id: true,
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
    userEvents.forEach((p) => {
      if (p.event) allEventsMap.set(p.event.id, p.event);
    });
    const uniqueEvents = Array.from(allEventsMap.values());
    const accessibleEventIds = await getAccessibleEventIds(
      currentUser?.id,
      uniqueEvents,
    );
    const filteredUploads = userUploads.filter(
      (u) => u.event && accessibleEventIds.has(u.event.id),
    );
    const filteredLikes = likedMedia.filter(
      (m) => m.event && accessibleEventIds.has(m.event.id),
    );
    const filteredMentions = mentionedMedia.filter(
      (m) => m.event && accessibleEventIds.has(m.event.id),
    );
    const filteredUserEvents = userEvents.filter(
      (p) => p.event && accessibleEventIds.has(p.event.id),
    );
    const [augmentedUploads, augmentedLikes, augmentedMentions] =
      await Promise.all([
        augmentMediaWithPermissions(currentUser?.id, filteredUploads),
        augmentMediaWithPermissions(currentUser?.id, filteredLikes),
        augmentMediaWithPermissions(currentUser?.id, filteredMentions),
      ]);
    const joinedEvents = await Promise.all(
      filteredUserEvents.map(async (p) => {
        let bannerUrl = null;
        if (p.event.bannerS3Key) {
          bannerUrl = getAssetProxyUrl("event-banner", p.event.id);
        }
        return {
          ...p.event,
          joinedAt: p.joinedAt,
          mediaCount: p.event.media.length,
          participantCount: p.event.participants.length,
          bannerUrl,
        };
      }),
    );
    return {
      success: true,
      data: {
        uploads: augmentedUploads.map((u) => ({
          ...u,
          likeCount: u.likes.length,
        })),
        likes: augmentedLikes.map((m) => ({
          ...m,
          likeCount: m.likes.length,
        })),
        mentions: augmentedMentions.map((m) => ({
          ...m,
          likeCount: m.likes.length,
        })),
        events: joinedEvents.filter((e) => e !== null),
      },
    };
  } catch (error) {
    console.error("Error fetching user profile data:", error);
    return { success: false, error: "Failed to fetch user data" };
  }
}
