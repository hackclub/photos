"use server";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dataExports, media, users } from "@/lib/db/schema";
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
      where: or(ilike(users.handle, `%${query}%`)),
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
      where: inArray(users.slackId, slackIds),
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
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };
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
    const { getCachetUser } = await import("@/lib/cachet");
    const user = await getCachetUser(slackId);
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
