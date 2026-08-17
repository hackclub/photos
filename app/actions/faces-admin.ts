"use server";

import { count, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventFaceIndexes,
  events,
  faceSystemSettings,
  media,
  mediaFaceScans,
} from "@/lib/db/schema";
import {
  ensureEventFaceIndex,
  getFaceSystemSettings,
  queuePendingFaceMedia,
  syncFaceIndexJobs,
} from "@/lib/face-indexing";
import { getUserContext } from "@/lib/policy";
import {
  cancelVisionJob,
  controlVisionQueue,
  deleteVisionGallery,
  getVisionQueue,
} from "@/lib/vision-client";

async function requireGlobalAdmin() {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user?.isGlobalAdmin) throw new Error("Unauthorized");
  return user;
}

export async function getFaceAdminState() {
  await requireGlobalAdmin();
  const [settings, queue, eventRows, scanCounts] = await Promise.all([
    getFaceSystemSettings(),
    getVisionQueue(),
    db
      .select({
        id: events.id,
        name: events.name,
        date: events.eventDate,
        enabled: eventFaceIndexes.enabled,
        status: eventFaceIndexes.status,
        galleryId: eventFaceIndexes.galleryId,
        updatedAt: eventFaceIndexes.updatedAt,
        imageCount: sql<number>`count(${media.id})::int`,
      })
      .from(events)
      .leftJoin(eventFaceIndexes, eq(eventFaceIndexes.eventId, events.id))
      .leftJoin(
        media,
        sql`${media.eventId} = ${events.id} and ${media.mimeType} like 'image/%'`,
      )
      .groupBy(events.id, eventFaceIndexes.eventId)
      .orderBy(sql`${events.eventDate} desc nulls last`)
      .limit(500),
    db
      .select({
        eventId: media.eventId,
        status: mediaFaceScans.status,
        count: count(),
      })
      .from(mediaFaceScans)
      .innerJoin(media, eq(media.id, mediaFaceScans.mediaId))
      .groupBy(media.eventId, mediaFaceScans.status),
  ]);
  const counts = new Map<string, Record<string, number>>();
  for (const row of scanCounts) {
    const current = counts.get(row.eventId) ?? {};
    current[row.status] = row.count;
    counts.set(row.eventId, current);
  }
  return {
    settings,
    queue,
    events: eventRows.map((event) => ({
      ...event,
      enabled: event.enabled ?? false,
      status: event.status ?? "disabled",
      scans: counts.get(event.id) ?? {},
    })),
  };
}

export async function updateFaceSystemSettings(input: {
  scanNewUploads: boolean;
  autoSuggestions: boolean;
  algorithm: "fast" | "accurate" | "very-accurate";
  maxFaces: number;
  suggestionThreshold: number;
  blurThreshold: number;
}) {
  const user = await requireGlobalAdmin();
  const values = {
    scanNewUploads: input.scanNewUploads,
    autoSuggestions: input.autoSuggestions,
    algorithm: input.algorithm,
    maxFaces: Math.max(1, Math.min(500, Math.round(input.maxFaces))),
    suggestionThreshold: Math.max(0, Math.min(1, input.suggestionThreshold)),
    blurThreshold: Math.max(0, Math.min(1, input.blurThreshold)),
    updatedAt: new Date(),
  };
  await db
    .insert(faceSystemSettings)
    .values({ id: "global", ...values })
    .onConflictDoUpdate({ target: faceSystemSettings.id, set: values });
  await auditLog(user.id, "update", "face_system_settings", "global", {
    scanNewUploads: values.scanNewUploads,
    autoSuggestions: values.autoSuggestions,
    algorithm: values.algorithm,
    maxFaces: values.maxFaces,
    suggestionThreshold: values.suggestionThreshold,
    blurThreshold: values.blurThreshold,
  });
  revalidatePath("/admin/faces");
  return { success: true };
}

export async function processPendingFaceIndexing(eventId?: string) {
  const user = await requireGlobalAdmin();
  const eventIds = eventId
    ? [eventId]
    : (
        await db
          .selectDistinct({ eventId: media.eventId })
          .from(media)
          .where(sql`${media.mimeType} like 'image/%'`)
      ).map((row) => row.eventId);
  let queued = 0;
  for (const id of eventIds) {
    await ensureEventFaceIndex(id);
    queued += (await queuePendingFaceMedia({ eventId: id, limit: 500 })).queued;
  }
  await auditLog(user.id, "create", "face_index_batch", eventId ?? "all", {
    events: eventIds.length,
    queued,
  });
  return { success: true, events: eventIds.length, queued };
}

export async function setEventFaceIndexing(eventId: string, enabled: boolean) {
  const user = await requireGlobalAdmin();
  if (enabled) {
    await ensureEventFaceIndex(eventId, { enableDisabled: true });
  } else {
    const index = await db.query.eventFaceIndexes.findFirst({
      where: eq(eventFaceIndexes.eventId, eventId),
    });
    await db
      .update(eventFaceIndexes)
      .set({
        enabled: false,
        status: "disabled",
        galleryId: null,
        updatedAt: new Date(),
      })
      .where(eq(eventFaceIndexes.eventId, eventId));
    const eventMedia = await db
      .select({ id: media.id })
      .from(media)
      .where(eq(media.eventId, eventId));
    if (eventMedia.length > 0) {
      await db.delete(mediaFaceScans).where(
        inArray(
          mediaFaceScans.mediaId,
          eventMedia.map((item) => item.id),
        ),
      );
    }
    if (index?.galleryId)
      await deleteVisionGallery(index.galleryId).catch(() => undefined);
  }
  await auditLog(user.id, "update", "event_face_index", eventId, { enabled });
  return { success: true };
}

export async function synchronizeFaceJobs() {
  await requireGlobalAdmin();
  return { success: true, ...(await syncFaceIndexJobs(250)) };
}

export async function controlFaceQueue(action: "pause" | "resume" | "stop") {
  const user = await requireGlobalAdmin();
  await controlVisionQueue(action);
  await db
    .update(faceSystemSettings)
    .set({ paused: action !== "resume", updatedAt: new Date() })
    .where(eq(faceSystemSettings.id, "global"));
  if (action === "stop") {
    await db
      .update(mediaFaceScans)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(inArray(mediaFaceScans.status, ["queued", "processing"]));
  }
  await auditLog(user.id, "update", "face_queue", action, { action });
  return { success: true };
}

export async function cancelFaceJob(jobId: string) {
  const user = await requireGlobalAdmin();
  await cancelVisionJob(jobId);
  await db
    .update(mediaFaceScans)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(mediaFaceScans.workerJobId, jobId));
  await auditLog(user.id, "update", "face_job", jobId, { status: "cancelled" });
  return { success: true };
}
