"use server";
import { createHash } from "node:crypto";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import sharp from "sharp";
import { auditLog } from "@/lib/audit";
import { getOnboardingSession, getSession } from "@/lib/auth";
import { GRAVATAR_URL, LIBRAVATAR_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { dataExports, media, users } from "@/lib/db/schema";
import { deleteFromS3, getAssetProxyUrl, uploadToS3 } from "@/lib/media/s3";
import { deleteBatchMedia } from "@/lib/media/thumbnail";
import { can, getUserContext } from "@/lib/policy";

const MAX_AVATAR_SIZE = 50 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "image/svg+xml",
];
export async function uploadUserAvatar(formData: FormData) {
  try {
    const session = await getSession();
    const onboardingSession = !session ? await getOnboardingSession() : null;
    if (!session?.id && !onboardingSession) {
      return { success: false, error: "Unauthorized" };
    }
    if (session?.id) {
      const user = await getUserContext(session.id);
      if (!user) return { success: false, error: "Unauthorized" };
      if (!(await can(user, "update", "user", { id: user.id }))) {
        return { success: false, error: "Forbidden" };
      }
    }
    const file = formData.get("avatar") as File;
    if (!file) {
      return { success: false, error: "No file provided" };
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Only images are allowed.",
      };
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return { success: false, error: "File too large (max 50MB)" };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const processedBuffer = await sharp(buffer)
      .resize(400, 400, {
        fit: "cover",
        position: "center",
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    const key = session?.id
      ? `users/${session.id}/avatar.jpg`
      : `users/onboarding/${onboardingSession!.hackclubId}/avatar.jpg`;
    const tags: Record<string, string> = session?.id
      ? { userId: session.id }
      : { onboardingId: onboardingSession!.hackclubId };
    await uploadToS3(processedBuffer, key, "image/jpeg", undefined, tags);
    revalidateTag(`s3-url-${key}`, "default");
    if (session?.id) {
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, session.id),
        columns: { avatarS3Key: true },
      });
      if (currentUser?.avatarS3Key && currentUser.avatarS3Key !== key) {
        try {
          await deleteFromS3(currentUser.avatarS3Key);
        } catch (e) {
          console.error("Failed to delete old avatar:", e);
        }
      }
      await db
        .update(users)
        .set({
          avatarS3Key: key,
          avatarSource: "upload",
          updatedAt: new Date(),
        })
        .where(eq(users.id, session.id));
      await auditLog(session.id, "update", "user", session.id, {
        action: "upload_avatar",
      });
      revalidatePath(`/users/${session.id}`);
      if (session.handle) {
        revalidatePath(`/users/${session.handle}`);
      }
    }
    let url: string;
    if (session?.id) {
      url = `${getAssetProxyUrl("avatar", session.id)}?t=${Date.now()}`;
    } else if (onboardingSession?.hackclubId) {
      url = `${getAssetProxyUrl("avatar", onboardingSession.hackclubId.toString())}?t=${Date.now()}`;
    } else {
      url = "";
    }
    return { success: true, avatarS3Key: key, url };
  } catch (error) {
    console.error("Error uploading avatar:", error);
    return { success: false, error: "Failed to upload avatar" };
  }
}
export async function getAvatarUrl(key: string) {
  try {
    const parts = key.split("/");
    if (parts.length >= 2 && (parts[0] === "users" || parts[0] === "avatars")) {
      const userId = parts[1];
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId,
        )
      ) {
        const { getAssetProxyUrl } = await import("@/lib/media/s3");
        return { success: true, url: getAssetProxyUrl("avatar", userId) };
      }
    }
    return { success: false, error: "Invalid avatar key format" };
  } catch (error) {
    console.error("Error getting avatar URL:", error);
    return { success: false, error: "Failed to get avatar URL" };
  }
}
export async function checkAvatarExistence(email: string) {
  if (!email) return { found: false };
  const hash = createHash("md5")
    .update(email.trim().toLowerCase())
    .digest("hex");
  try {
    const gravatarUrl = `${GRAVATAR_URL}/${hash}?d=404`;
    const gravatarResponse = await fetch(gravatarUrl, {
      method: "HEAD",
      cache: "no-store",
      headers: {
        "User-Agent": "HackClub-Photos/1.0",
      },
    });
    if (gravatarResponse.status === 200) {
      return {
        found: true,
        type: "gravatar" as const,
        url: `${GRAVATAR_URL}/${hash}?d=mp&s=400`,
      };
    }
  } catch (_e) {}
  try {
    const libravatarUrl = `${LIBRAVATAR_URL}/${hash}?d=404`;
    const libravatarResponse = await fetch(libravatarUrl, {
      method: "HEAD",
      cache: "no-store",
      headers: {
        "User-Agent": "HackClub-Photos/1.0",
      },
    });
    if (libravatarResponse.status === 200) {
      return {
        found: true,
        type: "libravatar" as const,
        url: `${LIBRAVATAR_URL}/${hash}?d=mp&s=400`,
      };
    }
  } catch (_e) {}
  return { found: false };
}
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
      where: or(
        ilike(users.name, `%${query}%`),
        ilike(users.email, `%${query}%`),
        ilike(users.slackId, `%${query}%`),
        ilike(users.handle, `%${query}%`),
      ),
      limit: 10,
      columns: {
        id: true,
        name: true,
        email: true,
        hackclubId: true,
        avatarS3Key: true,
        avatarSource: true,
        handle: true,
        slackId: true,
      },
    });
    return { success: true, users: searchResults };
  } catch (error) {
    console.error("Error searching users:", error);
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
        name: true,
        email: true,
        slackId: true,
        avatarS3Key: true,
        avatarSource: true,
      },
    });
    return { success: true, users: foundUsers };
  } catch (error) {
    console.error("Error fetching users by Slack IDs:", error);
    return { success: false, error: "Failed to fetch users" };
  }
}
export async function getCurrentUser() {
  try {
    const session = await getSession();
    if (!session?.id) {
      return { success: false, error: "Unauthorized" };
    }
    return { success: true, user: session };
  } catch (error) {
    console.error("Error getting current user:", error);
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
            console.error(
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
      console.error("Failed to auto-resolve reports for banned user:", e);
    }
    revalidatePath("/admin/users");
    revalidatePath(`/users/${userId}`);
    if (userToBan?.handle) {
      revalidatePath(`/users/${userToBan.handle}`);
    }
    return { success: true };
  } catch (error) {
    console.error("Error banning user:", error);
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
    console.error("Error unbanning user:", error);
    return { success: false, error: "Failed to unban user" };
  }
}
export async function updateUserProfile(
  userId: string,
  data: {
    bio?: string;
    socialLinks?: Record<string, string>;
    avatarS3Key?: string | null;
    avatarSource?: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear";
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
    console.error("Error updating user profile:", error);
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
    console.error("Error deleting account:", error);
    return { success: false, error: "Failed to delete account" };
  }
}
export async function checkSlackAvatar(slackId: string) {
  try {
    const { getCachetUser } = await import("@/lib/cachet");
    const user = await getCachetUser(slackId);
    return { success: !!user, user };
  } catch (error) {
    console.error("Error checking Slack avatar:", error);
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
    console.error("Error getting user storage usage:", error);
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
    console.error("Error getting storage status:", error);
    return { success: false, error: "Failed to get storage status" };
  }
}
