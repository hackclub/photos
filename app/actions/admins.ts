"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { createSession, getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventAdmins,
  events,
  pendingEventAdmins,
  pendingSeriesAdmins,
  series,
  seriesAdmins,
  users,
} from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
import { isValidSlackId, normalizeSlackId } from "@/lib/slack-id";
import { toPublicUser } from "@/lib/user-display";
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
            preferredName: true,
            handle: true,
            slackId: true,
          },
        },
      },
    });
    const pendingAdmins = user.isGlobalAdmin
      ? await db.query.pendingEventAdmins.findMany({
          where: and(
            eq(pendingEventAdmins.eventId, event.id),
            isNull(pendingEventAdmins.claimedAt),
          ),
          orderBy: (pendingEventAdmins, { desc }) => [
            desc(pendingEventAdmins.grantedAt),
          ],
        })
      : [];
    return {
      success: true,
      admins: admins.map((admin) => ({
        ...admin,
        user: toPublicUser(admin.user),
      })),
      pendingAdmins,
    };
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
            preferredName: true,
            handle: true,
            slackId: true,
          },
        },
      },
    });
    const pendingAdmins = user.isGlobalAdmin
      ? await db.query.pendingSeriesAdmins.findMany({
          where: and(
            eq(pendingSeriesAdmins.seriesId, seriesData.id),
            isNull(pendingSeriesAdmins.claimedAt),
          ),
          orderBy: (pendingSeriesAdmins, { desc }) => [
            desc(pendingSeriesAdmins.grantedAt),
          ],
        })
      : [];
    return {
      success: true,
      admins: admins.map((admin) => ({
        ...admin,
        user: toPublicUser(admin.user),
      })),
      pendingAdmins,
    };
  } catch (error) {
    console.error("Error fetching series admins:", error);
    return { error: "Failed to fetch admins" };
  }
}
export async function addAdmin(
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
    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
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

export async function addPendingAdminBySlackId(
  entityType: "event" | "series",
  entityId: string,
  slackIdInput: string,
) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) return { success: false, error: "Unauthorized" };
    if (!currentUser.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }

    const slackId = normalizeSlackId(slackIdInput);
    if (!isValidSlackId(slackId)) {
      return { success: false, error: "Enter a valid Slack user ID" };
    }

    const entity =
      entityType === "event"
        ? await db.query.events.findFirst({ where: eq(events.id, entityId) })
        : await db.query.series.findFirst({ where: eq(series.id, entityId) });
    if (!entity) return { success: false, error: `${entityType} not found` };

    const existingUser = await db.query.users.findFirst({
      where: eq(users.slackId, slackId),
      columns: { id: true },
    });
    if (existingUser) {
      return addAdmin(entityType, entityId, existingUser.id);
    }

    const existingPending =
      entityType === "event"
        ? await db.query.pendingEventAdmins.findFirst({
            where: and(
              eq(pendingEventAdmins.eventId, entityId),
              eq(pendingEventAdmins.slackId, slackId),
              isNull(pendingEventAdmins.claimedAt),
            ),
          })
        : await db.query.pendingSeriesAdmins.findFirst({
            where: and(
              eq(pendingSeriesAdmins.seriesId, entityId),
              eq(pendingSeriesAdmins.slackId, slackId),
              isNull(pendingSeriesAdmins.claimedAt),
            ),
          });
    if (existingPending) {
      return { success: false, error: "Slack user is already pending" };
    }

    if (entityType === "event") {
      await db.insert(pendingEventAdmins).values({
        eventId: entityId,
        slackId,
        grantedById: currentUser.id,
      });
    } else {
      await db.insert(pendingSeriesAdmins).values({
        seriesId: entityId,
        slackId,
        grantedById: currentUser.id,
      });
    }

    await auditLog(currentUser.id, "update", entityType, entityId, {
      action: "add_pending_admin",
      slackId,
    });
    revalidatePath(
      `/admin/${entityType === "event" ? "events" : "series"}/${entityId}/edit`,
    );
    return { success: true };
  } catch (error) {
    console.error(`Error adding pending ${entityType} admin:`, error);
    return { success: false, error: "Failed to add pending admin" };
  }
}

export async function removePendingAdminBySlackId(
  entityType: "event" | "series",
  entityId: string,
  slackIdInput: string,
) {
  try {
    const session = await getSession();
    const currentUser = await getUserContext(session?.id);
    if (!currentUser) return { success: false, error: "Unauthorized" };
    if (!currentUser.isGlobalAdmin) {
      return { success: false, error: "Forbidden" };
    }

    const slackId = normalizeSlackId(slackIdInput);
    if (entityType === "event") {
      await db
        .delete(pendingEventAdmins)
        .where(
          and(
            eq(pendingEventAdmins.eventId, entityId),
            eq(pendingEventAdmins.slackId, slackId),
            isNull(pendingEventAdmins.claimedAt),
          ),
        );
    } else {
      await db
        .delete(pendingSeriesAdmins)
        .where(
          and(
            eq(pendingSeriesAdmins.seriesId, entityId),
            eq(pendingSeriesAdmins.slackId, slackId),
            isNull(pendingSeriesAdmins.claimedAt),
          ),
        );
    }

    await auditLog(currentUser.id, "update", entityType, entityId, {
      action: "remove_pending_admin",
      slackId,
    });
    revalidatePath(
      `/admin/${entityType === "event" ? "events" : "series"}/${entityId}/edit`,
    );
    return { success: true };
  } catch (error) {
    console.error(`Error removing pending ${entityType} admin:`, error);
    return { success: false, error: "Failed to remove pending admin" };
  }
}

export async function addPendingEventAdminBySlackId(
  id: string,
  slackId: string,
) {
  return addPendingAdminBySlackId("event", id, slackId);
}
export async function addPendingSeriesAdminBySlackId(
  id: string,
  slackId: string,
) {
  return addPendingAdminBySlackId("series", id, slackId);
}
export async function removePendingEventAdminBySlackId(
  id: string,
  slackId: string,
) {
  return removePendingAdminBySlackId("event", id, slackId);
}
export async function removePendingSeriesAdminBySlackId(
  id: string,
  slackId: string,
) {
  return removePendingAdminBySlackId("series", id, slackId);
}
export async function adminUpdateUser(
  userId: string,
  data: {
    preferredName?: string;
    handle?: string;
    bio?: string;
    slackId?: string;
    socialLinks?: Record<string, string>;
    storageLimit?: number;
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
      slackId: targetUser.slackId,
    });
    await auditLog(currentUser.id, "impersonate", "user", userId);
    return { success: true };
  } catch (error) {
    console.error("Error impersonating user:", error);
    return { success: false, error: "Failed to impersonate user" };
  }
}
