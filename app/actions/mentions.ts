"use server";
import { and, eq } from "drizzle-orm";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media, mediaMentions, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { can, getUserContext } from "@/lib/policy";
import { toPublicUser } from "@/lib/user-display";
export async function addMention(mediaId: string, userId: string) {
  const session = await getSession();
  const currentUser = await getUserContext(session?.id);
  if (!currentUser) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (
      !(await can(currentUser, "create", "mention", {
        media: mediaItem,
        targetUserId: userId,
      }))
    ) {
      return { success: false, error: "Unauthorized" };
    }
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        handle: true,
        preferredName: true,
        slackId: true,
        migrationMode: true,
        migratedToUserId: true,
      },
    });
    if (!user) {
      return { success: false, error: "User not found" };
    }
    const targetUserId =
      user.migrationMode && user.migratedToUserId
        ? user.migratedToUserId
        : userId;
    const targetUser =
      targetUserId === userId
        ? user
        : await db.query.users.findFirst({
            where: eq(users.id, targetUserId),
            columns: {
              id: true,
              handle: true,
              preferredName: true,
              slackId: true,
            },
          });
    if (!targetUser) {
      return { success: false, error: "Migration target not found" };
    }
    const existingMention = await db.query.mediaMentions.findFirst({
      where: and(
        eq(mediaMentions.mediaId, mediaId),
        eq(mediaMentions.userId, targetUserId),
      ),
    });
    if (existingMention) {
      return { success: false, error: "User already mentioned" };
    }
    await db.insert(mediaMentions).values({
      mediaId,
      userId: targetUserId,
    });
    await auditLog(
      currentUser.id,
      "create",
      "mention",
      `${mediaId}:${userId}`,
      {
        mediaId,
        mentionedUserId: targetUserId,
      },
    );
    try {
      const { notifyMention } = await import("@/lib/slack-notifications");
      notifyMention(mediaId, targetUserId, currentUser.id).catch((error) => {
        logger.error("Failed to enqueue Slack mention notification:", error);
      });
    } catch (error) {
      logger.error("Failed to load Slack mention notification:", error);
    }
    return { success: true, user: toPublicUser(targetUser) };
  } catch (error) {
    logger.error("Failed to add mention:", error);
    return { success: false, error: "Failed to add mention" };
  }
}
export async function removeMention(mediaId: string, userId: string) {
  const session = await getSession();
  const currentUser = await getUserContext(session?.id);
  if (!currentUser) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        migrationMode: true,
        migratedToUserId: true,
      },
    });
    const resolvedUserId =
      user?.migrationMode && user?.migratedToUserId
        ? user.migratedToUserId
        : userId;
    if (
      !(await can(currentUser, "delete", "mention", {
        media: mediaItem,
        targetUserId: resolvedUserId,
      }))
    ) {
      return { success: false, error: "Unauthorized" };
    }
    await db
      .delete(mediaMentions)
      .where(
        and(
          eq(mediaMentions.mediaId, mediaId),
          eq(mediaMentions.userId, resolvedUserId),
        ),
      );
    await auditLog(
      currentUser.id,
      "delete",
      "mention",
      `${mediaId}:${userId}`,
      {
        mediaId,
        mentionedUserId: userId,
      },
    );
    return { success: true };
  } catch (error) {
    logger.error("Failed to remove mention:", error);
    return { success: false, error: "Failed to remove mention" };
  }
}
export async function getMediaMentions(mediaId: string) {
  const session = await getSession();
  const currentUser = await getUserContext(session?.id);
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (!(await can(currentUser, "view", "mention", mediaItem))) {
      if (!currentUser) return { success: false, error: "Unauthorized" };
      return { success: false, error: "Forbidden" };
    }
    const results = await db.query.mediaMentions.findMany({
      where: eq(mediaMentions.mediaId, mediaId),
      with: {
        user: {
          columns: {
            id: true,
            handle: true,
            preferredName: true,
            slackId: true,
          },
        },
      },
    });
    return {
      success: true,
      mentions: results.map((r) => toPublicUser(r.user)),
    };
  } catch (error) {
    logger.error("Failed to get media mentions:", error);
    return { success: false, error: "Failed to get media mentions" };
  }
}
