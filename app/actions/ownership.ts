"use server";

import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media, pendingMediaOwnership, users } from "@/lib/db/schema";
import { PENDING_REGISTRATION_USER_ID } from "@/lib/pending-ownership";
import { getUserContext } from "@/lib/policy";
import { isValidSlackId, normalizeSlackId } from "@/lib/slack-id";

export async function searchOwnerCandidates(query: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) return { success: false, error: "Unauthorized" };
    if (!user.isGlobalAdmin) return { success: false, error: "Forbidden" };
    if (!query || query.length < 1) return { success: true, users: [] };

    const searchResults = await db.query.users.findMany({
      where: or(
        ilike(users.handle, `%${query}%`),
        ilike(users.name, `%${query}%`),
      ),
      limit: 10,
      columns: {
        id: true,
        handle: true,
        name: true,
        slackId: true,
      },
    });

    return {
      success: true,
      users: searchResults
        .filter(
          (u) =>
            u.id !== PENDING_REGISTRATION_USER_ID &&
            !u.handle?.startsWith("_pending"),
        )
        .map((u) => ({
          id: u.id,
          name: u.name,
          handle: u.handle ?? null,
          slackId: u.slackId ?? null,
        })),
    };
  } catch {
    return { success: false, error: "Failed to search users" };
  }
}

export async function resolveSlackId(slackId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) return { success: false, error: "Unauthorized" };
    if (!user.isGlobalAdmin) return { success: false, error: "Forbidden" };
    if (!isValidSlackId(slackId))
      return { success: false, error: "Invalid Slack ID format" };

    const normalized = normalizeSlackId(slackId);
    const existingUser = await db.query.users.findFirst({
      where: eq(users.slackId, normalized),
      columns: { id: true, handle: true, name: true, slackId: true },
    });

    if (existingUser) {
      return {
        success: true,
        existingUser: true,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          handle: existingUser.handle ?? null,
          slackId: existingUser.slackId ?? null,
        },
      };
    }

    return {
      success: true,
      existingUser: false,
      slackId: normalized,
    };
  } catch {
    return { success: false, error: "Failed to resolve Slack ID" };
  }
}

export async function transferMediaOwnership(
  mediaIds: string[],
  targetUserId: string,
) {
  try {
    const session = await getSession();
    const admin = await getUserContext(session?.id);
    if (!admin) return { success: false, error: "Unauthorized" };
    if (!admin.isGlobalAdmin) return { success: false, error: "Forbidden" };

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, targetUserId),
      columns: { id: true },
    });
    if (!targetUser) return { success: false, error: "Target user not found" };

    const mediaItems = await db.query.media.findMany({
      where: inArray(media.id, mediaIds),
    });

    if (mediaItems.length === 0)
      return { success: false, error: "No media found" };

    await db
      .update(media)
      .set({ uploadedById: targetUserId })
      .where(
        inArray(
          media.id,
          mediaItems.map((m) => m.id),
        ),
      );

    await db.delete(pendingMediaOwnership).where(
      and(
        inArray(
          pendingMediaOwnership.mediaId,
          mediaItems.map((m) => m.id),
        ),
        isNull(pendingMediaOwnership.resolvedAt),
      ),
    );

    for (const item of mediaItems) {
      await auditLog(admin.id, "update", "media", item.id, {
        action: "transfer_ownership",
        newOwnerId: targetUserId,
      });
      revalidatePath(`/events/${item.eventId}`);
    }

    return { success: true, count: mediaItems.length };
  } catch {
    return { success: false, error: "Failed to transfer ownership" };
  }
}

export async function reserveMediaOwnership(
  mediaIds: string[],
  slackId: string,
  showPlaceholder: boolean,
) {
  try {
    const session = await getSession();
    const admin = await getUserContext(session?.id);
    if (!admin) return { success: false, error: "Unauthorized" };
    if (!admin.isGlobalAdmin) return { success: false, error: "Forbidden" };

    const normalizedSlackId = normalizeSlackId(slackId);
    if (!isValidSlackId(normalizedSlackId))
      return { success: false, error: "Invalid Slack ID format" };

    const existingUser = await db.query.users.findFirst({
      where: eq(users.slackId, normalizedSlackId),
      columns: { id: true },
    });

    if (existingUser) {
      return transferMediaOwnership(mediaIds, existingUser.id);
    }

    const mediaItems = await db.query.media.findMany({
      where: inArray(media.id, mediaIds),
    });

    if (mediaItems.length === 0)
      return { success: false, error: "No media found" };

    for (const item of mediaItems) {
      const existingPending = await db.query.pendingMediaOwnership.findFirst({
        where: and(
          eq(pendingMediaOwnership.mediaId, item.id),
          isNull(pendingMediaOwnership.resolvedAt),
        ),
      });

      if (existingPending) {
        await db
          .update(pendingMediaOwnership)
          .set({ slackId: normalizedSlackId, showPlaceholder })
          .where(eq(pendingMediaOwnership.id, existingPending.id));
      } else {
        await db.insert(pendingMediaOwnership).values({
          mediaId: item.id,
          slackId: normalizedSlackId,
          showPlaceholder,
          previousOwnerId: item.uploadedById,
          createdById: admin.id,
        });
      }
    }

    if (showPlaceholder) {
      await db
        .update(media)
        .set({ uploadedById: PENDING_REGISTRATION_USER_ID })
        .where(
          inArray(
            media.id,
            mediaItems.map((m) => m.id),
          ),
        );
    }

    for (const item of mediaItems) {
      await auditLog(admin.id, "update", "media", item.id, {
        action: "reserve_pending_ownership",
        slackId: normalizedSlackId,
        showPlaceholder,
      });
      revalidatePath(`/events/${item.eventId}`);
    }

    return { success: true, count: mediaItems.length, pending: true } as {
      success: boolean;
      count: number;
      pending: boolean;
      error?: string;
    };
  } catch {
    return { success: false, error: "Failed to reserve ownership" };
  }
}
