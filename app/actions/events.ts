"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventParticipants, events, media } from "@/lib/db/schema";
import {
  deleteBatchMedia,
  deleteMediaAndThumbnail,
} from "@/lib/media/thumbnail";
import { can, getUserContext } from "@/lib/policy";
export async function joinEvent(eventId: string, inviteCode?: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) {
    return { success: false, error: "Event not found" };
  }
  if (!(await can(user, "join", "event", event))) {
    return { success: false, error: "Forbidden" };
  }
  const existingParticipant = await db.query.eventParticipants.findFirst({
    where: and(
      eq(eventParticipants.eventId, eventId),
      eq(eventParticipants.userId, user.id),
    ),
  });
  if (existingParticipant) {
    return { success: true };
  }
  const isAdmin = await can(user, "manage", "event", event);
  if (!isAdmin && event.requiresInvite) {
    if (!inviteCode) {
      return { success: false, error: "Invite code required" };
    }
    if (event.inviteCode !== inviteCode) {
      return { success: false, error: "Invalid invite code" };
    }
  }
  await db.insert(eventParticipants).values({
    eventId: event.id,
    userId: user.id,
  });
  await auditLog(user.id, "join", "event", event.id);
  revalidatePath(`/events/${event.slug}`);
  revalidatePath("/events");
  return { success: true };
}
export async function leaveEvent(eventId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) {
    return { success: false, error: "Event not found" };
  }
  if (!(await can(user, "leave", "event", event))) {
    return { success: false, error: "Forbidden" };
  }
  const userMedia = await db.query.media.findMany({
    where: and(eq(media.eventId, eventId), eq(media.uploadedById, user.id)),
  });
  const { successfulIds } = await deleteBatchMedia(userMedia);
  if (successfulIds.length > 0) {
    await db.delete(media).where(inArray(media.id, successfulIds));
  }
  await db
    .delete(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.userId, user.id),
      ),
    );
  await auditLog(user.id, "leave", "event", event.id);
  revalidatePath(`/events/${event.slug}`);
  revalidatePath("/events");
  return { success: true };
}
export async function deleteEvent(eventId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) {
    return { success: false, error: "Event not found" };
  }
  if (!(await can(user, "delete", "event", event))) {
    return { success: false, error: "Forbidden" };
  }
  const eventMedia = await db.query.media.findMany({
    where: eq(media.eventId, event.id),
  });
  const { successfulIds, hasErrors: hasMediaDeletionErrors } =
    await deleteBatchMedia(eventMedia);
  let bannerDeletionError = false;
  if (event.bannerS3Key) {
    try {
      await deleteMediaAndThumbnail(event.bannerS3Key, null);
    } catch (error) {
      console.error("Error deleting banner from S3:", error);
      bannerDeletionError = true;
    }
  }
  if (hasMediaDeletionErrors || bannerDeletionError) {
    if (successfulIds.length > 0) {
      await db.delete(media).where(inArray(media.id, successfulIds));
    }
    return {
      success: false,
      error:
        "Failed to delete some files from storage. Event was not deleted, but successfully deleted files were removed.",
    };
  }
  await db.delete(events).where(eq(events.id, event.id));
  await auditLog(user.id, "delete", "event", event.id);
  revalidatePath("/events");
  revalidatePath("/admin/events");
  return { success: true };
}
interface EventInput {
  name: string;
  slug: string;
  description?: string;
  visibility?: "public" | "auth_required" | "unlisted";
  requiresInvite?: boolean;
  eventDate?: string | Date;
  location?: string;
  locationCity?: string;
  locationCountry?: string;
  latitude?: string | number;
  longitude?: string | number;
  seriesId?: string;
}
export async function updateEvent(eventId: string, data: EventInput) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) {
    return { success: false, error: "Event not found" };
  }
  if (!(await can(user, "update", "event", event))) {
    return { success: false, error: "Forbidden" };
  }
  const {
    name,
    description,
    visibility,
    requiresInvite,
    eventDate,
    location,
    locationCity,
    locationCountry,
    latitude,
    longitude,
    slug,
    seriesId,
  } = data;
  let inviteCode = event.inviteCode;
  if (requiresInvite && !inviteCode) {
    const { randomBytes } = await import("node:crypto");
    inviteCode = randomBytes(16).toString("hex");
  } else if (!requiresInvite) {
    inviteCode = null;
  }
  try {
    const [updatedEvent] = await db
      .update(events)
      .set({
        name,
        slug,
        description,
        visibility,
        requiresInvite,
        inviteCode,
        seriesId: seriesId || null,
        eventDate: eventDate ? new Date(eventDate) : null,
        location: location || null,
        locationCity: locationCity || null,
        locationCountry: locationCountry || null,
        latitude: latitude ? parseFloat(String(latitude)) : null,
        longitude: longitude ? parseFloat(String(longitude)) : null,
        updatedAt: new Date(),
      })
      .where(eq(events.id, event.id))
      .returning();
    await auditLog(user.id, "update", "event", event.id, {
      changes: Object.keys(data),
    });
    revalidatePath(`/events/${updatedEvent.slug}`);
    revalidatePath("/events");
    revalidatePath("/admin/events");
    return { success: true, event: updatedEvent };
  } catch (error: unknown) {
    console.error("Update event error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update event";
    return { success: false, error: errorMessage };
  }
}
export async function regenerateInviteCode(eventId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) {
    return { success: false, error: "Event not found" };
  }
  if (!(await can(user, "update", "event", event))) {
    return { success: false, error: "Forbidden" };
  }
  const { randomBytes } = await import("node:crypto");
  const inviteCode = randomBytes(16).toString("hex");
  try {
    await db
      .update(events)
      .set({
        inviteCode,
        updatedAt: new Date(),
      })
      .where(eq(events.id, event.id));
    await auditLog(user.id, "update", "event", event.id, {
      action: "regenerate_invite_code",
    });
    revalidatePath(`/events/${event.slug}`);
    return { success: true, inviteCode };
  } catch (error: unknown) {
    console.error("Regenerate invite code error:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to regenerate invite code";
    return {
      success: false,
      error: errorMessage,
    };
  }
}
export async function getEvent(eventId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      series: true,
    },
  });
  if (!event) {
    return { success: false, error: "Event not found" };
  }
  if (!(await can(user, "view", "event", event))) {
    return { success: false, error: "Unauthorized" };
  }
  return { success: true, event };
}
export async function createEvent(data: EventInput) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!(await can(user, "create", "event"))) {
    return { success: false, error: "Forbidden" };
  }
  const {
    name,
    description,
    visibility,
    requiresInvite,
    eventDate,
    location,
    locationCity,
    locationCountry,
    latitude,
    longitude,
    slug,
    seriesId,
  } = data;
  let inviteCode = null;
  if (requiresInvite) {
    const { randomBytes } = await import("node:crypto");
    inviteCode = randomBytes(16).toString("hex");
  }
  try {
    const [newEvent] = await db
      .insert(events)
      .values({
        name,
        slug,
        description,
        visibility,
        requiresInvite,
        inviteCode,
        seriesId: seriesId || null,
        eventDate: eventDate ? new Date(eventDate) : null,
        location: location || null,
        locationCity: locationCity || null,
        locationCountry: locationCountry || null,
        latitude: latitude ? parseFloat(String(latitude)) : null,
        longitude: longitude ? parseFloat(String(longitude)) : null,
        createdById: user.id,
      })
      .returning();
    const { eventAdmins } = await import("@/lib/db/schema");
    await db.insert(eventAdmins).values({
      eventId: newEvent.id,
      userId: user.id,
    });
    await auditLog(user.id, "create", "event", newEvent.id, {
      name,
      slug,
    });
    revalidatePath("/events");
    revalidatePath("/admin/events");
    return { success: true, event: newEvent };
  } catch (error: unknown) {
    console.error("Create event error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create event";
    return { success: false, error: errorMessage };
  }
}
export async function checkSlugAvailability(slug: string) {
  const existingEvent = await db.query.events.findFirst({
    where: eq(events.slug, slug),
  });
  return { available: !existingEvent };
}
