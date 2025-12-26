"use server";
import { and, eq } from "drizzle-orm";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media, mediaMentions, users } from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
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
    });
    if (!user) {
      return { success: false, error: "User not found" };
    }
    const existingMention = await db.query.mediaMentions.findFirst({
      where: and(
        eq(mediaMentions.mediaId, mediaId),
        eq(mediaMentions.userId, userId),
      ),
    });
    if (existingMention) {
      return { success: false, error: "User already mentioned" };
    }
    await db.insert(mediaMentions).values({
      mediaId,
      userId,
    });
    await auditLog(
      currentUser.id,
      "create",
      "mention",
      `${mediaId}:${userId}`,
      {
        mediaId,
        mentionedUserId: userId,
      },
    );
    return { success: true, user };
  } catch (error) {
    console.error("Failed to add mention:", error);
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
    if (
      !(await can(currentUser, "delete", "mention", {
        media: mediaItem,
        targetUserId: userId,
      }))
    ) {
      return { success: false, error: "Unauthorized" };
    }
    await db
      .delete(mediaMentions)
      .where(
        and(
          eq(mediaMentions.mediaId, mediaId),
          eq(mediaMentions.userId, userId),
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
    console.error("Failed to remove mention:", error);
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
        user: true,
      },
    });
    return { success: true, mentions: results.map((r) => r.user) };
  } catch (error) {
    console.error("Failed to get media mentions:", error);
    return { success: false, error: "Failed to get media mentions" };
  }
}
