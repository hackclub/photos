"use server";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media, shareLinks } from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
export async function createShareLink(
  mediaId: string,
  type: "view" | "raw" = "view",
) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: {
        event: true,
      },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (!(await can(user, "create", "share_link", mediaItem))) {
      return { success: false, error: "Unauthorized" };
    }
    const existingLink = await db.query.shareLinks.findFirst({
      where: and(
        eq(shareLinks.mediaId, mediaId),
        eq(shareLinks.createdById, user.id),
        eq(shareLinks.type, type),
        eq(shareLinks.isRevoked, false),
      ),
    });
    if (existingLink) {
      return { success: true, token: existingLink.token };
    }
    const token = nanoid(12);
    await db.insert(shareLinks).values({
      token,
      mediaId,
      createdById: user.id,
      type,
    });
    await auditLog(user.id, "create", "share_link", token, {
      mediaId,
      type,
    });
    return { success: true, token };
  } catch (error) {
    console.error("Failed to create share link:", error);
    return { success: false, error: "Failed to create share link" };
  }
}
export async function revokeShareLink(token: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const link = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.token, token),
    });
    if (!link) {
      return { success: false, error: "Link not found" };
    }
    if (!(await can(user, "delete", "share_link", link))) {
      return { success: false, error: "Unauthorized" };
    }
    await db
      .update(shareLinks)
      .set({ isRevoked: true })
      .where(eq(shareLinks.token, token));
    await auditLog(user.id, "delete", "share_link", token, {
      mediaId: link.mediaId,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to revoke share link:", error);
    return { success: false, error: "Failed to revoke share link" };
  }
}
export async function getSharedMedia(token: string) {
  try {
    const link = await db.query.shareLinks.findFirst({
      where: and(eq(shareLinks.token, token), eq(shareLinks.isRevoked, false)),
      with: {
        media: {
          with: {
            uploadedBy: {
              columns: {
                name: true,
                avatarS3Key: true,
              },
            },
            event: true,
          },
        },
        createdBy: {
          columns: {
            name: true,
          },
        },
      },
    });
    if (!link || !link.media) {
      return { success: false, error: "Link not found or expired" };
    }
    if (link.media.event && link.media.event.allowPublicSharing === false) {
      return {
        success: false,
        error: "Public sharing is disabled for this event",
      };
    }
    db.update(shareLinks)
      .set({ views: link.views + 1 })
      .where(eq(shareLinks.token, token))
      .catch(console.error);
    return { success: true, link };
  } catch (error) {
    console.error("Failed to get shared media:", error);
    return { success: false, error: "Failed to retrieve media" };
  }
}
