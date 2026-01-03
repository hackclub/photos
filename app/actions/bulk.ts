"use server";
import { eq, inArray } from "drizzle-orm";
import { broadcastPhotoDeleted } from "@/app/api/feed/stream/route";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, media, series } from "@/lib/db/schema";
import { getMediaProxyUrl } from "@/lib/media/s3";
import { deleteBatchMedia } from "@/lib/media/thumbnail";
import { can, getUserContext } from "@/lib/policy";
export async function getBulkMediaUrls(s3Keys?: string[], mediaIds?: string[]) {
  try {
    console.log(
      "getBulkMediaUrls called with s3Keys:",
      s3Keys?.length,
      "mediaIds:",
      mediaIds?.length,
    );
    const urls: Record<string, string> = {};
    if (s3Keys && s3Keys.length > 0) {
      await Promise.all(
        s3Keys.map(async (key) => {
          try {
            const mediaItem = await db.query.media.findFirst({
              where: eq(media.thumbnailS3Key, key),
            });
            if (mediaItem) {
              const url = getMediaProxyUrl(mediaItem.id, "thumbnail");
              console.log(`[Bulk] Mapped key ${key} to URL ${url}`);
              urls[key] = url;
            } else {
              const match = key.match(/^media\/([^/]+)\/thumbnail\.jpg$/);
              if (match?.[1]) {
                urls[key] = getMediaProxyUrl(match[1], "thumbnail");
              } else {
                console.warn(`Could not resolve media ID for key: ${key}`);
              }
            }
          } catch (error) {
            console.error(`Failed to sign URL for key ${key}:`, error);
          }
        }),
      );
    }
    if (mediaIds && mediaIds.length > 0) {
      const session = await getSession();
      const user = await getUserContext(session?.id);
      const mediaItems = await db.query.media.findMany({
        where: inArray(media.id, mediaIds),
        with: {
          event: true,
        },
      });
      await Promise.all(
        mediaItems.map(async (item) => {
          if (item.event && !(await can(user, "view", "event", item.event))) {
            return;
          }
          try {
            urls[item.id] = getMediaProxyUrl(item.id);
          } catch (error) {
            console.error(`Failed to sign URL for media ${item.id}:`, error);
          }
        }),
      );
    }
    return { success: true, urls };
  } catch (error) {
    console.error("Error generating bulk URLs:", error);
    return { success: false, error: "Failed to generate URLs" };
  }
}
export async function bulkDeleteMedia(mediaIds: string[]) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
    return { success: false, error: "mediaIds must be a non-empty array" };
  }
  try {
    const mediaItems = await db.query.media.findMany({
      where: inArray(media.id, mediaIds),
      with: {
        event: true,
      },
    });
    if (mediaItems.length === 0) {
      return { success: false, error: "No media found" };
    }
    const itemsToDelete = [];
    for (const item of mediaItems) {
      if (await can(user, "delete", "media", item)) {
        itemsToDelete.push(item);
      }
    }
    if (itemsToDelete.length === 0) {
      return {
        success: false,
        error: "You do not have permission to delete any of the selected items",
      };
    }
    const { successfulIds: successfullyDeletedIds } =
      await deleteBatchMedia(itemsToDelete);
    const failedItems = itemsToDelete
      .filter((item) => !successfullyDeletedIds.includes(item.id))
      .map((item) => item.id);
    if (successfullyDeletedIds.length === 0) {
      return {
        success: false,
        error:
          "All S3 deletions failed. Database not modified to prevent orphaned records.",
      };
    }
    await db.delete(media).where(inArray(media.id, successfullyDeletedIds));
    await auditLog(user.id, "delete", "media_bulk", "bulk", {
      count: successfullyDeletedIds.length,
      ids: successfullyDeletedIds,
    });
    for (const mediaId of successfullyDeletedIds) {
      broadcastPhotoDeleted(mediaId);
    }
    return {
      success: true,
      deleted: successfullyDeletedIds.length,
      deletedIds: successfullyDeletedIds,
      skipped: mediaItems.length - itemsToDelete.length,
      failed: failedItems.length,
    };
  } catch (error) {
    console.error("Bulk delete error:", error);
    return { success: false, error: "Failed to delete media" };
  }
}
export interface BulkEventData {
  name: string;
  slug: string;
  description: string;
  location: string;
  locationCity: string;
  locationCountry: string;
  latitude: number | null;
  longitude: number | null;
  eventDate: Date | null;
  adminUserIds: string[];
  visibility: "public" | "auth_required" | "unlisted";
  requiresInvite: boolean;
  allowPublicSharing: boolean;
}
export async function bulkCreateEvents(
  seriesId: string,
  eventsData: BulkEventData[],
) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  const seriesData = await db.query.series.findFirst({
    where: eq(series.id, seriesId),
    with: {
      admins: true,
    },
  });
  if (!seriesData) {
    return { success: false, error: "Series not found" };
  }
  if (!(await can(user, "manage", "series", seriesData))) {
    return { success: false, error: "Forbidden" };
  }
  try {
    const results = {
      created: 0,
      failed: 0,
      errors: [] as string[],
    };
    for (const eventData of eventsData) {
      try {
        let slug = eventData.slug;
        let counter = 1;
        while (
          await db.query.events.findFirst({
            where: eq(events.slug, slug),
          })
        ) {
          slug = `${eventData.slug}-${counter}`;
          counter++;
        }
        const [newEvent] = await db
          .insert(events)
          .values({
            name: eventData.name,
            slug: slug,
            description: eventData.description,
            location: eventData.location,
            locationCity: eventData.locationCity,
            locationCountry: eventData.locationCountry,
            latitude: eventData.latitude,
            longitude: eventData.longitude,
            eventDate: eventData.eventDate,
            visibility: eventData.visibility,
            requiresInvite: eventData.requiresInvite,
            allowPublicSharing: eventData.allowPublicSharing,
            seriesId: seriesId,
            createdById: user.id,
          })
          .returning();
        await auditLog(user.id, "create", "event", newEvent.id, {
          name: newEvent.name,
          seriesId,
        });
        const adminIds = new Set([user.id, ...eventData.adminUserIds]);
        const { eventAdmins } = await import("@/lib/db/schema");
        if (adminIds.size > 0) {
          await db.insert(eventAdmins).values(
            Array.from(adminIds).map((userId) => ({
              eventId: newEvent.id,
              userId: userId,
            })),
          );
        }
        results.created++;
      } catch (error: unknown) {
        console.error(`Failed to create event ${eventData.name}:`, error);
        results.failed++;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        results.errors.push(
          `Failed to create ${eventData.name}: ${errorMessage}`,
        );
      }
    }
    return { success: true, ...results };
  } catch (error: unknown) {
    console.error("Bulk create error:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to process bulk creation";
    return {
      success: false,
      error: errorMessage,
    };
  }
}
