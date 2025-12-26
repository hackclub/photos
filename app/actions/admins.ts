"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import sharp from "sharp";
import { auditLog } from "@/lib/audit";
import { createSession, getSession } from "@/lib/auth";
import { AVATAR_COLORS } from "@/lib/avatar";
import { db } from "@/lib/db";
import {
  eventAdmins,
  events,
  series,
  seriesAdmins,
  users,
} from "@/lib/db/schema";
import { deleteFromS3, getAssetProxyUrl, uploadToS3 } from "@/lib/media/s3";
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
export async function getEventAdmins(eventId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { error: "Unauthorized" };
    }
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });
    if (!event) {
      return { error: "Event not found" };
    }
    if (!(await can(user, "manage", "event", event))) {
      return { error: "Forbidden" };
    }
    const admins = await db.query.eventAdmins.findMany({
      where: eq(eventAdmins.eventId, event.id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    return { success: true, admins };
  } catch (error) {
    console.error("Error fetching event admins:", error);
    return { error: "Failed to fetch admins" };
  }
}
export async function getSeriesAdmins(seriesId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (!user) {
      return { error: "Unauthorized" };
    }
    const seriesData = await db.query.series.findFirst({
      where: eq(series.id, seriesId),
    });
    if (!seriesData) {
      return { error: "Series not found" };
    }
    if (!(await can(user, "manage", "series", seriesData))) {
      return { error: "Forbidden" };
    }
    const admins = await db.query.seriesAdmins.findMany({
      where: eq(seriesAdmins.seriesId, seriesData.id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    return { success: true, admins };
  } catch (error) {
    console.error("Error fetching series admins:", error);
    return { error: "Failed to fetch admins" };
  }
}
export async function addAdmin(
  entityType: "event" | "series",
  entityId: string,
  hackclubId: string,
) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) return { error: "Unauthorized" };
    const entity =
      entityType === "event"
        ? await db.query.events.findFirst({
            where: eq(events.id, entityId),
          })
        : await db.query.series.findFirst({
            where: eq(series.id, entityId),
          });
    if (!entity) return { error: `${entityType} not found` };
    if (!(await can(currentUser, "manage", entityType, entity))) {
      return { error: "Forbidden" };
    }
    const targetUser = await db.query.users.findFirst({
      where: eq(users.hackclubId, hackclubId),
    });
    if (!targetUser) return { error: "User not found" };
    const existing =
      entityType === "event"
        ? await db.query.eventAdmins.findFirst({
            where: and(
              eq(eventAdmins.eventId, entityId),
              eq(eventAdmins.userId, targetUser.id),
            ),
          })
        : await db.query.seriesAdmins.findFirst({
            where: and(
              eq(seriesAdmins.seriesId, entityId),
              eq(seriesAdmins.userId, targetUser.id),
            ),
          });
    if (existing) return { error: "User is already an admin" };
    if (entityType === "event") {
      await db.insert(eventAdmins).values({
        eventId: entityId,
        userId: targetUser.id,
      });
    } else {
      await db.insert(seriesAdmins).values({
        seriesId: entityId,
        userId: targetUser.id,
      });
    }
    await auditLog(currentUser.id, "update", entityType, entityId, {
      action: "add_admin",
      targetUserId: targetUser.id,
    });
    revalidatePath(
      `/admin/${entityType === "event" ? "events" : "series"}/${entityId}/edit`,
    );
    return { success: true };
  } catch (error) {
    console.error(`Error adding ${entityType} admin:`, error);
    return { error: "Failed to add admin" };
  }
}
export async function removeAdmin(
  entityType: "event" | "series",
  entityId: string,
  userId: string,
) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) return { error: "Unauthorized" };
    const entity =
      entityType === "event"
        ? await db.query.events.findFirst({
            where: eq(events.id, entityId),
          })
        : await db.query.series.findFirst({
            where: eq(series.id, entityId),
          });
    if (!entity) return { error: `${entityType} not found` };
    if (!(await can(currentUser, "manage", entityType, entity))) {
      return { error: "Forbidden" };
    }
    if (entityType === "event") {
      await db
        .delete(eventAdmins)
        .where(
          and(
            eq(eventAdmins.eventId, entityId),
            eq(eventAdmins.userId, userId),
          ),
        );
    } else {
      await db
        .delete(seriesAdmins)
        .where(
          and(
            eq(seriesAdmins.seriesId, entityId),
            eq(seriesAdmins.userId, userId),
          ),
        );
    }
    await auditLog(currentUser.id, "update", entityType, entityId, {
      action: "remove_admin",
      targetUserId: userId,
    });
    revalidatePath(
      `/admin/${entityType === "event" ? "events" : "series"}/${entityId}/edit`,
    );
    return { success: true };
  } catch (error) {
    console.error(`Error removing ${entityType} admin:`, error);
    return { error: "Failed to remove admin" };
  }
}
export const addEventAdmin = async (id: string, hackclubId: string) =>
  addAdmin("event", id, hackclubId);
export const removeEventAdmin = async (id: string, userId: string) =>
  removeAdmin("event", id, userId);
export const addSeriesAdmin = async (id: string, hackclubId: string) =>
  addAdmin("series", id, hackclubId);
export const removeSeriesAdmin = async (id: string, userId: string) =>
  removeAdmin("series", id, userId);
export async function adminUpdateUser(
  userId: string,
  data: {
    preferredName?: string;
    handle?: string;
    bio?: string;
    slackId?: string;
    socialLinks?: Record<string, string>;
    storageLimit?: number;
    avatarS3Key?: string | null;
    avatarSource?: "upload" | "slack" | "gravatar" | "libravatar" | "dicebear";
  },
) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }
    if (!currentUser.isGlobalAdmin) {
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
      }
    }
    const { storageLimit, ...rest } = data;
    await db
      .update(users)
      .set({
        ...rest,
        storageLimit: storageLimit,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await auditLog(currentUser.id, "update", "user", userId, {
      changes: Object.keys(data),
    });
    revalidatePath("/admin/users");
    revalidatePath(`/users/${userId}`);
    if (data.handle) {
      revalidatePath(`/users/${data.handle}`);
    }
    return { success: true };
  } catch (error) {
    console.error("Error updating user:", error);
    return { success: false, error: "Failed to update user" };
  }
}
export async function adminRandomizeAvatar(userId: string) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }
    if (!currentUser.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }
    const seed = Math.random().toString(36).substring(7);
    const colorIndex =
      seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
      AVATAR_COLORS.length;
    const randomColor = AVATAR_COLORS[colorIndex];
    const avatarUrl = `https://api.dicebear.com/9.x/notionists/jpg?seed=${seed}&backgroundColor=${randomColor}`;
    const response = await fetch(avatarUrl);
    const blob = await response.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const key = `users/${userId}/avatar.jpg`;
    await uploadToS3(buffer, key, "image/jpeg", undefined, { userId });
    revalidateTag(`s3-url-${key}`, "default");
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { avatarS3Key: true, handle: true },
    });
    await db
      .update(users)
      .set({
        avatarS3Key: key,
        avatarSource: "upload",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    revalidatePath("/admin/users");
    revalidatePath(`/users/${userId}`);
    if (targetUser?.handle) {
      revalidatePath(`/users/${targetUser.handle}`);
    }
    const url = `${getAssetProxyUrl("avatar", userId)}?t=${Date.now()}`;
    await auditLog(currentUser.id, "update", "user", userId, {
      action: "randomize_avatar",
    });
    return { success: true, avatarS3Key: key, url };
  } catch (error) {
    console.error("Error randomizing avatar:", error);
    return { success: false, error: "Failed to randomize avatar" };
  }
}
export async function adminUploadUserAvatar(
  userId: string,
  formData: FormData,
) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }
    if (!currentUser.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
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
    const key = `users/${userId}/avatar.jpg`;
    await uploadToS3(processedBuffer, key, "image/jpeg", undefined, { userId });
    revalidateTag(`s3-url-${key}`, "default");
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { avatarS3Key: true, handle: true },
    });
    if (targetUser?.avatarS3Key && targetUser.avatarS3Key !== key) {
      try {
        await deleteFromS3(targetUser.avatarS3Key);
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
      .where(eq(users.id, userId));
    revalidatePath(`/users/${userId}`);
    if (targetUser?.handle) {
      revalidatePath(`/users/${targetUser.handle}`);
    }
    revalidatePath("/admin/users");
    const url = `${getAssetProxyUrl("avatar", userId)}?t=${Date.now()}`;
    await auditLog(currentUser.id, "update", "user", userId, {
      action: "upload_avatar",
    });
    return { success: true, avatarS3Key: key, url };
  } catch (error) {
    console.error("Error uploading avatar:", error);
    return { success: false, error: "Failed to upload avatar" };
  }
}
export async function adminDeleteUser(
  userId: string,
  deleteContent: boolean = true,
) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }
    if (!currentUser.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }
    if (session && userId === session.id) {
      return {
        success: false,
        error: "Cannot delete your own account from admin panel",
      };
    }
    if (deleteContent) {
      const { deleteUserContent } = await import("@/lib/user-deletion");
      const success = await deleteUserContent(userId);
      if (!success) {
        return {
          success: false,
          error:
            "Partial deletion occurred. Some files could not be removed from storage, so the account was not fully deleted.",
        };
      }
    }
    await auditLog(currentUser.id, "delete", "user", userId, {
      deleteContent,
    });
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    console.error("Error deleting user:", error);
    return { success: false, error: "Failed to delete user" };
  }
}
export async function toggleGlobalAdmin(userId: string) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }
    if (!currentUser.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }
    if (session && userId === session.id) {
      return {
        success: false,
        error: "Cannot change your own admin status",
      };
    }
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) {
      return { success: false, error: "User not found" };
    }
    const newStatus = !user.isGlobalAdmin;
    await db
      .update(users)
      .set({
        isGlobalAdmin: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await auditLog(
      currentUser.id,
      newStatus ? "promote" : "demote",
      "user",
      userId,
      {
        role: "global_admin",
      },
    );
    revalidatePath("/admin/users");
    return { success: true, isGlobalAdmin: newStatus };
  } catch (error) {
    console.error("Error toggling admin status:", error);
    return { success: false, error: "Failed to update admin status" };
  }
}
export async function impersonateUser(userId: string) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }
    if (!currentUser.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!targetUser) {
      return { success: false, error: "User not found" };
    }
    await createSession({
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      handle: targetUser.handle,
      hackclubId: targetUser.hackclubId,
      isGlobalAdmin: targetUser.isGlobalAdmin,
      isBanned: targetUser.isBanned,
      avatarS3Key: targetUser.avatarS3Key,
      slackId: targetUser.slackId,
    });
    await auditLog(currentUser.id, "impersonate", "user", userId);
    return { success: true };
  } catch (error) {
    console.error("Error impersonating user:", error);
    return { success: false, error: "Failed to impersonate user" };
  }
}
