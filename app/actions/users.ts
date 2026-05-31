"use server";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  apiKeys,
  blurRequests,
  commentLikes,
  dataExports,
  eventAdmins,
  eventParticipants,
  events,
  media,
  mediaComments,
  mediaLikes,
  mediaMentions,
  pendingEventAdmins,
  pendingMediaOwnership,
  pendingSeriesAdmins,
  reports,
  series,
  seriesAdmins,
  shareLinks,
  users,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { deleteFromS3 } from "@/lib/media/s3";
import { deleteBatchMedia } from "@/lib/media/thumbnail";
import { getUserContext } from "@/lib/policy";
import { getUserDisplayName, toPublicUser } from "@/lib/user-display";
export async function searchUsers(query: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!query || query.length < 2) {
      return { success: true, users: [] };
    }
    const searchResults = await db.query.users.findMany({
      where: and(
        sql`${users.migrationMode} IS NULL`,
        or(ilike(users.handle, `%${query}%`)),
      ),
      limit: 10,
      columns: {
        id: true,
        handle: true,
        slackId: true,
      },
    });
    return {
      success: true,
      users: searchResults.map(toPublicUser),
    };
  } catch (error) {
    logger.error("Error searching users:", error);
    return { success: false, error: "Failed to search users" };
  }
}
export async function adminSearchMergeUsers(
  query: string,
  excludeUserId?: string,
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user?.isGlobalAdmin) return { success: false, error: "Forbidden" };
    if (!query || query.length < 2) return { success: true, users: [] };
    const term = `%${query}%`;
    const conditions = [
      sql`${users.deletedAt} IS NULL`,
      or(
        ilike(users.name, term),
        ilike(users.email, term),
        ilike(users.handle, term),
        ilike(users.slackId, term),
        ilike(users.hackclubId, term),
      ),
    ];
    if (excludeUserId) conditions.push(sql`${users.id} <> ${excludeUserId}`);
    const searchResults = await db.query.users.findMany({
      where: and(...conditions),
      limit: 10,
      columns: {
        id: true,
        name: true,
        email: true,
        handle: true,
        slackId: true,
        hackclubId: true,
      },
    });
    return { success: true, users: searchResults };
  } catch (error) {
    logger.error("Error searching merge users:", error);
    return { success: false, error: "Failed to search users" };
  }
}

export async function getUserMergePreview(
  sourceUserId: string,
  targetUserId: string,
) {
  try {
    const session = await getSession();
    const admin = await getUserContext(session?.id);
    if (!admin?.isGlobalAdmin) return { success: false, error: "Forbidden" };
    if (sourceUserId === targetUserId) {
      return { success: false, error: "Choose two different users" };
    }
    const [source, target] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, sourceUserId),
        columns: {
          id: true,
          hackclubId: true,
          email: true,
          name: true,
          preferredName: true,
          handle: true,
          slackId: true,
          verificationStatus: true,
          bio: true,
          socialLinks: true,
          isGlobalAdmin: true,
          storageLimit: true,
          isBanned: true,
          bannedAt: true,
          bannedById: true,
          banReason: true,
          migratedToUserId: true,
          migrationMode: true,
          migrationMessage: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: {
          id: true,
          hackclubId: true,
          email: true,
          name: true,
          preferredName: true,
          handle: true,
          slackId: true,
          verificationStatus: true,
          bio: true,
          socialLinks: true,
          isGlobalAdmin: true,
          storageLimit: true,
          isBanned: true,
          bannedAt: true,
          bannedById: true,
          banReason: true,
          migratedToUserId: true,
          migrationMode: true,
          migrationMessage: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    if (!source || !target) return { success: false, error: "User not found" };
    const eventRows = await db
      .select({
        eventId: events.id,
        eventName: events.name,
        eventSlug: events.slug,
        sourceUploads: sql<number>`count(distinct ${media.id}) filter (where ${media.uploadedById} = ${sourceUserId})`,
        targetUploads: sql<number>`count(distinct ${media.id}) filter (where ${media.uploadedById} = ${targetUserId})`,
        sourceMentions: sql<number>`count(distinct ${mediaMentions.mediaId}) filter (where ${mediaMentions.userId} = ${sourceUserId})`,
        targetMentions: sql<number>`count(distinct ${mediaMentions.mediaId}) filter (where ${mediaMentions.userId} = ${targetUserId})`,
        sourceAttendance: sql<number>`count(distinct ${eventParticipants.id}) filter (where ${eventParticipants.userId} = ${sourceUserId})`,
        targetAttendance: sql<number>`count(distinct ${eventParticipants.id}) filter (where ${eventParticipants.userId} = ${targetUserId})`,
      })
      .from(events)
      .leftJoin(media, eq(media.eventId, events.id))
      .leftJoin(mediaMentions, eq(mediaMentions.mediaId, media.id))
      .leftJoin(eventParticipants, eq(eventParticipants.eventId, events.id))
      .groupBy(events.id)
      .having(sql`
        count(distinct ${media.id}) filter (where ${media.uploadedById} in (${sourceUserId}, ${targetUserId})) > 0
        or count(distinct ${mediaMentions.mediaId}) filter (where ${mediaMentions.userId} in (${sourceUserId}, ${targetUserId})) > 0
        or count(distinct ${eventParticipants.id}) filter (where ${eventParticipants.userId} in (${sourceUserId}, ${targetUserId})) > 0
      `);
    const [sourceLikes, sourceComments, sourceApiKeys, sourceExports] =
      await Promise.all([
        db.$count(mediaLikes, eq(mediaLikes.userId, sourceUserId)),
        db.$count(mediaComments, eq(mediaComments.userId, sourceUserId)),
        db.$count(apiKeys, eq(apiKeys.userId, sourceUserId)),
        db.$count(dataExports, eq(dataExports.userId, sourceUserId)),
      ]);
    return {
      success: true,
      source,
      target,
      events: eventRows.map((row) => ({
        ...row,
        sourceUploads: Number(row.sourceUploads),
        targetUploads: Number(row.targetUploads),
        sourceMentions: Number(row.sourceMentions),
        targetMentions: Number(row.targetMentions),
        sourceAttendance: Number(row.sourceAttendance),
        targetAttendance: Number(row.targetAttendance),
      })),
      totals: { sourceLikes, sourceComments, sourceApiKeys, sourceExports },
    };
  } catch (error) {
    logger.error("Error building merge preview:", error);
    return { success: false, error: "Failed to build merge preview" };
  }
}

type MergeUserDataField =
  | "name"
  | "preferredName"
  | "handle"
  | "bio"
  | "socialLinks"
  | "storageLimit";

export async function mergeUsers(options: {
  sourceUserId: string;
  targetUserId: string;
  moveUploadsEventIds?: string[];
  moveMentionEventIds?: string[];
  moveAttendanceEventIds?: string[];
  moveLikes?: boolean;
  moveComments?: boolean;
  moveCommentLikes?: boolean;
  moveReports?: boolean;
  moveBlurRequests?: boolean;
  moveShareLinks?: boolean;
  moveApiKeys?: boolean;
  moveDataExports?: boolean;
  moveAdminRoles?: boolean;
  moveCreatedEvents?: boolean;
  moveCreatedSeries?: boolean;
  movePendingGrants?: boolean;
  scrubSourceProfile?: boolean;
  migrateLogin?: boolean;
  aliasLogin?: boolean;
  mergeDataFields?: MergeUserDataField[];
}) {
  try {
    const session = await getSession();
    const admin = await getUserContext(session?.id);
    if (!admin?.isGlobalAdmin) return { success: false, error: "Forbidden" };
    if (options.sourceUserId === options.targetUserId) {
      return { success: false, error: "Choose two different users" };
    }
    const [source, target] = await Promise.all([
      db.query.users.findFirst({
        where: eq(users.id, options.sourceUserId),
        columns: {
          id: true,
          hackclubId: true,
          name: true,
          preferredName: true,
          handle: true,
          slackId: true,
          bio: true,
          socialLinks: true,
          storageLimit: true,
        },
      }),
      db.query.users.findFirst({
        where: eq(users.id, options.targetUserId),
        columns: {
          id: true,
          hackclubId: true,
          name: true,
          handle: true,
          slackId: true,
        },
      }),
    ]);
    if (!source || !target) return { success: false, error: "User not found" };
    if (options.scrubSourceProfile && !options.aliasLogin) {
      return {
        success: false,
        error:
          "Source profile can only be scrubbed when alias login is enabled",
      };
    }
    const dataUpdate: Partial<typeof users.$inferInsert> = {};
    for (const field of options.mergeDataFields || []) {
      if (field === "handle" && source.handle) {
        const owner = await db.query.users.findFirst({
          where: eq(users.handle, source.handle),
          columns: { id: true },
        });
        if (owner && owner.id !== target.id) {
          return { success: false, error: "Source handle is already owned" };
        }
      }
      if (field === "name") dataUpdate.name = source.name;
      if (field === "preferredName")
        dataUpdate.preferredName = source.preferredName;
      if (field === "handle") dataUpdate.handle = source.handle;
      if (field === "bio") dataUpdate.bio = source.bio;
      if (field === "socialLinks") dataUpdate.socialLinks = source.socialLinks;
      if (field === "storageLimit")
        dataUpdate.storageLimit = source.storageLimit;
    }
    const mentionMediaIds = options.moveMentionEventIds?.length
      ? (
          await db
            .select({ id: media.id })
            .from(media)
            .where(inArray(media.eventId, options.moveMentionEventIds))
        ).map((row) => row.id)
      : [];
    const attendanceEventIds = options.moveAttendanceEventIds || [];
    await db.transaction(async (tx) => {
      if (options.moveUploadsEventIds?.length) {
        await tx
          .update(media)
          .set({ uploadedById: target.id })
          .where(
            and(
              eq(media.uploadedById, source.id),
              inArray(media.eventId, options.moveUploadsEventIds),
            ),
          );
      }
      if (mentionMediaIds.length) {
        await tx
          .delete(mediaMentions)
          .where(
            and(
              eq(mediaMentions.userId, target.id),
              inArray(mediaMentions.mediaId, mentionMediaIds),
            ),
          );
        await tx
          .update(mediaMentions)
          .set({ userId: target.id })
          .where(
            and(
              eq(mediaMentions.userId, source.id),
              inArray(mediaMentions.mediaId, mentionMediaIds),
            ),
          );
      }
      if (attendanceEventIds.length) {
        await tx
          .delete(eventParticipants)
          .where(
            and(
              eq(eventParticipants.userId, target.id),
              inArray(eventParticipants.eventId, attendanceEventIds),
            ),
          );
        await tx
          .update(eventParticipants)
          .set({ userId: target.id })
          .where(
            and(
              eq(eventParticipants.userId, source.id),
              inArray(eventParticipants.eventId, attendanceEventIds),
            ),
          );
      }
      if (options.moveLikes) {
        await tx
          .delete(mediaLikes)
          .where(
            and(
              eq(mediaLikes.userId, target.id),
              inArray(
                mediaLikes.mediaId,
                tx
                  .select({ mediaId: mediaLikes.mediaId })
                  .from(mediaLikes)
                  .where(eq(mediaLikes.userId, source.id)),
              ),
            ),
          );
        await tx
          .update(mediaLikes)
          .set({ userId: target.id })
          .where(eq(mediaLikes.userId, source.id));
      }
      if (options.moveComments) {
        await tx
          .update(mediaComments)
          .set({ userId: target.id, updatedAt: new Date() })
          .where(eq(mediaComments.userId, source.id));
      }
      if (options.moveCommentLikes) {
        await tx
          .update(commentLikes)
          .set({ userId: target.id })
          .where(eq(commentLikes.userId, source.id));
      }
      if (options.moveReports) {
        await tx
          .update(reports)
          .set({ reporterId: target.id, updatedAt: new Date() })
          .where(eq(reports.reporterId, source.id));
        await tx
          .update(reports)
          .set({ resolvedById: target.id, updatedAt: new Date() })
          .where(eq(reports.resolvedById, source.id));
      }
      if (options.moveBlurRequests) {
        await tx
          .update(blurRequests)
          .set({ requesterId: target.id, updatedAt: new Date() })
          .where(eq(blurRequests.requesterId, source.id));
        await tx
          .update(blurRequests)
          .set({ resolvedById: target.id, updatedAt: new Date() })
          .where(eq(blurRequests.resolvedById, source.id));
      }
      if (options.moveShareLinks) {
        await tx
          .update(shareLinks)
          .set({ createdById: target.id })
          .where(eq(shareLinks.createdById, source.id));
      }
      if (options.moveApiKeys) {
        await tx
          .update(apiKeys)
          .set({ userId: target.id })
          .where(eq(apiKeys.userId, source.id));
      }
      if (options.moveDataExports) {
        await tx
          .update(dataExports)
          .set({ userId: target.id })
          .where(eq(dataExports.userId, source.id));
      }
      if (options.moveAdminRoles) {
        await tx
          .update(eventAdmins)
          .set({ userId: target.id })
          .where(eq(eventAdmins.userId, source.id));
        await tx
          .update(seriesAdmins)
          .set({ userId: target.id })
          .where(eq(seriesAdmins.userId, source.id));
      }
      if (options.moveCreatedEvents) {
        await tx
          .update(events)
          .set({ createdById: target.id, updatedAt: new Date() })
          .where(eq(events.createdById, source.id));
      }
      if (options.moveCreatedSeries) {
        await tx
          .update(series)
          .set({ createdById: target.id, updatedAt: new Date() })
          .where(eq(series.createdById, source.id));
      }
      if (options.movePendingGrants) {
        await tx
          .update(pendingMediaOwnership)
          .set({ previousOwnerId: target.id })
          .where(eq(pendingMediaOwnership.previousOwnerId, source.id));
        await tx
          .update(pendingMediaOwnership)
          .set({ createdById: target.id })
          .where(eq(pendingMediaOwnership.createdById, source.id));
        await tx
          .update(pendingMediaOwnership)
          .set({ resolvedById: target.id })
          .where(eq(pendingMediaOwnership.resolvedById, source.id));
        await tx
          .update(pendingSeriesAdmins)
          .set({ grantedById: target.id })
          .where(eq(pendingSeriesAdmins.grantedById, source.id));
        await tx
          .update(pendingSeriesAdmins)
          .set({ claimedById: target.id })
          .where(eq(pendingSeriesAdmins.claimedById, source.id));
        await tx
          .update(pendingEventAdmins)
          .set({ grantedById: target.id })
          .where(eq(pendingEventAdmins.grantedById, source.id));
        await tx
          .update(pendingEventAdmins)
          .set({ claimedById: target.id })
          .where(eq(pendingEventAdmins.claimedById, source.id));
      }
      if (Object.keys(dataUpdate).length > 0) {
        await tx
          .update(users)
          .set({ ...dataUpdate, updatedAt: new Date() })
          .where(eq(users.id, target.id));
      }
      if (options.migrateLogin || options.aliasLogin) {
        const label = `${target.name}${target.slackId ? ` / ${target.slackId}` : ""} / ${target.hackclubId}`;
        await tx
          .update(users)
          .set({
            ...(options.scrubSourceProfile
              ? {
                  name: "Migrated User",
                  preferredName: null,
                  bio: null,
                  socialLinks: null,
                }
              : {}),
            migratedToUserId: target.id,
            migrationMode: options.aliasLogin ? "alias" : "notify",
            migrationMessage: `You have been migrated to ${label}. Please log in with that account.`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, source.id));
      } else {
        await tx
          .update(users)
          .set({
            migratedToUserId: null,
            migrationMode: null,
            migrationMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, source.id));
      }
    });
    await auditLog(admin.id, "merge", "user", source.id, {
      sourceUserId: source.id,
      targetUserId: target.id,
      moveUploadsEventIds: options.moveUploadsEventIds || [],
      moveMentionEventIds: options.moveMentionEventIds || [],
      moveAttendanceEventIds: options.moveAttendanceEventIds || [],
      buckets: {
        likes: !!options.moveLikes,
        comments: !!options.moveComments,
        commentLikes: !!options.moveCommentLikes,
        reports: !!options.moveReports,
        blurRequests: !!options.moveBlurRequests,
        shareLinks: !!options.moveShareLinks,
        apiKeys: !!options.moveApiKeys,
        dataExports: !!options.moveDataExports,
        adminRoles: !!options.moveAdminRoles,
        createdEvents: !!options.moveCreatedEvents,
        createdSeries: !!options.moveCreatedSeries,
        pendingGrants: !!options.movePendingGrants,
      },
      scrubSourceProfile: !!options.scrubSourceProfile,
      migrateLogin: !!options.migrateLogin,
      aliasLogin: !!options.aliasLogin,
      mergeDataFields: options.mergeDataFields || [],
    });
    revalidatePath("/admin/users");
    revalidatePath(`/users/${source.handle || source.id}`);
    revalidatePath(`/users/${target.handle || target.id}`);
    return { success: true };
  } catch (error) {
    logger.error("Error merging users:", error);
    return { success: false, error: "Failed to merge users" };
  }
}
export async function clearUserMigration(userId: string) {
  try {
    const session = await getSession();
    const admin = await getUserContext(session?.id);
    if (!admin?.isGlobalAdmin) return { success: false, error: "Forbidden" };
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, handle: true, migrationMode: true },
    });
    if (!user) return { success: false, error: "User not found" };
    await db
      .update(users)
      .set({
        migratedToUserId: null,
        migrationMode: null,
        migrationMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await auditLog(admin.id, "update", "user", userId, {
      clearedMigrationMode: user.migrationMode,
    });
    revalidatePath("/admin/users");
    revalidatePath(`/users/${user.handle || user.id}`);
    return { success: true };
  } catch (error) {
    logger.error("Error clearing user migration:", error);
    return { success: false, error: "Failed to clear migration" };
  }
}
export async function getUsersBySlackIds(slackIds: string[]) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!slackIds || slackIds.length === 0) {
      return { success: true, users: [] };
    }
    const foundUsers = await db.query.users.findMany({
      where: and(
        sql`${users.migrationMode} IS NULL`,
        inArray(users.slackId, slackIds),
      ),
      columns: {
        id: true,
        slackId: true,
        handle: true,
      },
    });
    return {
      success: true,
      users: foundUsers.map((user) => ({
        ...toPublicUser(user),
        email: "",
        slackId: user.slackId,
      })),
    };
  } catch (error) {
    logger.error("Error fetching users by Slack IDs:", error);
    return { success: false, error: "Failed to fetch users" };
  }
}
export async function getCurrentUser() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return { success: false, error: "Unauthorized" };
    }
    return {
      success: true,
      user: { ...session, name: getUserDisplayName(session) },
    };
  } catch (error) {
    logger.error("Error getting current user:", error);
    return { success: false, error: "Failed to get user" };
  }
}
export async function banUser(
  userId: string,
  reason?: string,
  deleteContent: boolean = true,
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!user.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }
    if (deleteContent) {
      const userMedia = await db.query.media.findMany({
        where: eq(media.uploadedById, userId),
      });
      const { successfulIds: successfulMediaIds } =
        await deleteBatchMedia(userMedia);
      if (successfulMediaIds.length > 0) {
        await db.delete(media).where(inArray(media.id, successfulMediaIds));
      }
      const userExports = await db.query.dataExports.findMany({
        where: eq(dataExports.userId, userId),
      });
      const successfulExportIds: string[] = [];
      for (const exportItem of userExports) {
        if (exportItem.s3Key) {
          try {
            await deleteFromS3(exportItem.s3Key);
            successfulExportIds.push(exportItem.id);
          } catch (error) {
            logger.error(
              `Failed to delete S3 file ${exportItem.s3Key}:`,
              error,
            );
          }
        } else {
          successfulExportIds.push(exportItem.id);
        }
      }
      if (successfulExportIds.length > 0) {
        await db
          .delete(dataExports)
          .where(inArray(dataExports.id, successfulExportIds));
      }
    }
    const userToBan = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { handle: true },
    });
    await db
      .update(users)
      .set({
        isBanned: true,
        bannedAt: new Date(),
        bannedById: user.id,
        banReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await auditLog(user.id, "ban", "user", userId, {
      reason,
      deleteContent,
    });
    try {
      const { reports } = await import("@/lib/db/schema");
      await db
        .update(reports)
        .set({
          status: "ignored",
          resolvedAt: new Date(),
          resolvedById: user.id,
          resolutionNotes: "User was banned",
        })
        .where(
          and(eq(reports.reporterId, userId), eq(reports.status, "pending")),
        );
    } catch (e) {
      logger.error("Failed to auto-resolve reports for banned user:", e);
    }
    revalidatePath("/admin/users");
    revalidatePath(`/users/${userId}`);
    if (userToBan?.handle) {
      revalidatePath(`/users/${userToBan.handle}`);
    }
    return { success: true };
  } catch (error) {
    logger.error("Error banning user:", error);
    return { success: false, error: "Failed to ban user" };
  }
}
export async function unbanUser(userId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (!user.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }
    const userToUnban = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { handle: true },
    });
    await db
      .update(users)
      .set({
        isBanned: false,
        bannedAt: null,
        bannedById: null,
        banReason: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await auditLog(user.id, "unban", "user", userId);
    revalidatePath("/admin/users");
    revalidatePath(`/users/${userId}`);
    if (userToUnban?.handle) {
      revalidatePath(`/users/${userToUnban.handle}`);
    }
    return { success: true };
  } catch (error) {
    logger.error("Error unbanning user:", error);
    return { success: false, error: "Failed to unban user" };
  }
}
export async function updateUserProfile(
  userId: string,
  data: {
    bio?: string;
    socialLinks?: Record<string, string>;
    handle?: string;
    preferredName?: string;
  },
) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    if (user.id !== userId && !user.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }
    if (data.handle) {
      const { checkHandleAvailability } = await import(
        "@/app/actions/onboarding"
      );
      const availability = await checkHandleAvailability(data.handle);
      if (!availability.available) {
        const existingUser = await db.query.users.findFirst({
          where: eq(users.handle, data.handle),
          columns: { id: true },
        });
        if (existingUser && existingUser.id !== userId) {
          return {
            success: false,
            error: availability.error || "Handle is already taken",
          };
        }
        if (existingUser && existingUser.id === userId) {
        } else {
          return {
            success: false,
            error: availability.error || "Handle is unavailable",
          };
        }
      }
    }
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.handle !== undefined) updateData.handle = data.handle;
    if (data.preferredName !== undefined)
      updateData.preferredName = data.preferredName;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.socialLinks !== undefined)
      updateData.socialLinks = data.socialLinks;
    await db.update(users).set(updateData).where(eq(users.id, userId));
    await auditLog(user.id, "update", "user", userId, {
      changes: Object.keys(data),
    });
    revalidatePath(`/users/${userId}`);
    if (data.handle) {
      revalidatePath(`/users/${data.handle}`);
    } else {
      if (session && session.id === userId && session.handle) {
        revalidatePath(`/users/${session.handle}`);
      } else {
        const updatedUser = await db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { handle: true },
        });
        if (updatedUser?.handle) {
          revalidatePath(`/users/${updatedUser.handle}`);
        }
      }
    }
    return { success: true };
  } catch (error) {
    logger.error("Error updating user profile:", error);
    return { success: false, error: "Failed to update profile" };
  }
}
export async function deleteAccount() {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }
    const userId = user.id;
    const { deleteUserContent } = await import("@/lib/user-deletion");
    const success = await deleteUserContent(userId);
    if (!success) {
      return {
        success: false,
        error:
          "Partial deletion occurred. Some files could not be removed from storage, so the account was not fully deleted. Please try again.",
      };
    }
    const { deleteSession } = await import("@/lib/auth");
    await deleteSession();
    const cookieStore = await cookies();
    cookieStore.set("account_deleted", "true", {
      path: "/",
      maxAge: 60,
      httpOnly: true,
      sameSite: "lax",
    });
    await auditLog(user.id, "delete", "user", userId, {
      action: "self_delete",
    });
    return { success: true };
  } catch (error) {
    logger.error("Error deleting account:", error);
    return { success: false, error: "Failed to delete account" };
  }
}
export async function checkSlackAvatar(slackId: string) {
  try {
    const { isValidSlackId, normalizeSlackId } = await import("@/lib/slack-id");
    const normalizedSlackId = normalizeSlackId(slackId);
    if (!isValidSlackId(normalizedSlackId)) return { success: false };
    const { getCachetUser } = await import("@/lib/cachet");
    const user = await getCachetUser(normalizedSlackId);
    return { success: !!user, user };
  } catch (error) {
    logger.error("Error checking Slack avatar:", error);
    return { success: false };
  }
}
export async function getUserStorageUsage(userId: string) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return 0;
    }
    if (session.id !== userId && !session.isGlobalAdmin) {
      return 0;
    }
    const { getUserStorageUsage: getUsage } = await import("@/lib/storage");
    return await getUsage(userId);
  } catch (error) {
    logger.error("Error getting user storage usage:", error);
    return 0;
  }
}
export async function getStorageStatus(projectedBytes: number = 0) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return { success: false, error: "Unauthorized" };
    }
    const { checkStorageLimit } = await import("@/lib/storage");
    const status = await checkStorageLimit(session.id, projectedBytes);
    return { success: true, ...status };
  } catch (error) {
    logger.error("Error getting storage status:", error);
    return { success: false, error: "Failed to get storage status" };
  }
}
