"use server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, media, series } from "@/lib/db/schema";
import { getMediaProxyUrl } from "@/lib/media/s3";
import { getAccessibleEventIdsForUser, getUserContext } from "@/lib/policy";
export type SignageFilter = {
  seriesId?: string;
  eventId?: string;
};
export async function getRandomMedia(filter: SignageFilter = {}, limit = 50) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return { success: true, media: [] };
    }
    let accessibleEventIds = await getAccessibleEventIdsForUser(user?.id);
    if (filter.eventId) {
      if (!accessibleEventIds.includes(filter.eventId)) {
        return { success: false, error: "Forbidden or Event not found" };
      }
      accessibleEventIds = [filter.eventId];
    } else if (filter.seriesId) {
      const seriesEvents = await db.query.events.findMany({
        where: eq(events.seriesId, filter.seriesId),
        columns: { id: true },
      });
      const seriesEventIds = seriesEvents.map((e) => e.id);
      accessibleEventIds = accessibleEventIds.filter((id) =>
        seriesEventIds.includes(id),
      );
    }
    if (accessibleEventIds.length === 0) {
      return { success: true, media: [] };
    }
    const conditions = [
      inArray(media.eventId, accessibleEventIds),
      sql`${media.mimeType} LIKE 'image/%'`,
    ];
    const randomMedia = await db.query.media.findMany({
      where: and(...conditions),
      orderBy: sql`RANDOM()`,
      limit: limit,
      with: {
        event: true,
        uploadedBy: true,
      },
    });
    const mediaWithUrls = await Promise.all(
      randomMedia.map(async (item) => {
        let url: string;
        if (item.mimeType === "image/heic" || item.mimeType === "image/heif") {
          url = getMediaProxyUrl(item.id, "display");
        } else {
          url = getMediaProxyUrl(item.id);
        }
        return {
          ...item,
          url,
        };
      }),
    );
    return { success: true, media: mediaWithUrls };
  } catch (error) {
    console.error("Error fetching random media:", error);
    return { success: false, error: "Failed to fetch media" };
  }
}
export async function getLatestMedia(limit = 1) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return { success: true, media: [] };
    }
    const accessibleEventIds = await getAccessibleEventIdsForUser(user?.id);
    if (accessibleEventIds.length === 0) {
      return { success: true, media: [] };
    }
    const latestMedia = await db.query.media.findMany({
      where: and(
        inArray(media.eventId, accessibleEventIds),
        sql`${media.mimeType} LIKE 'image/%'`,
      ),
      orderBy: [desc(media.uploadedAt)],
      limit: limit,
      with: {
        event: true,
        uploadedBy: true,
      },
    });
    const mediaWithUrls = await Promise.all(
      latestMedia.map(async (item) => {
        let url: string;
        if (item.mimeType === "image/heic" || item.mimeType === "image/heif") {
          url = getMediaProxyUrl(item.id, "display");
        } else {
          url = getMediaProxyUrl(item.id);
        }
        return {
          ...item,
          url,
        };
      }),
    );
    return { success: true, media: mediaWithUrls };
  } catch (error) {
    console.error("Error fetching latest media:", error);
    return { success: false, error: "Failed to fetch latest media" };
  }
}
export async function getSeriesAndEvents() {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return { success: true, series: [], events: [] };
    }
    const allSeries = await db.query.series.findMany({
      orderBy: desc(series.createdAt),
    });
    const allEvents = await db.query.events.findMany({
      orderBy: desc(events.createdAt),
    });
    const accessibleEventIds = await getAccessibleEventIdsForUser(user?.id);
    const accessibleEventIdsSet = new Set(accessibleEventIds);
    const accessibleEvents = allEvents.filter((e) =>
      accessibleEventIdsSet.has(e.id),
    );
    return { success: true, series: allSeries, events: accessibleEvents };
  } catch (error) {
    console.error("Error fetching series and events:", error);
    return { success: false, error: "Failed to fetch data" };
  }
}
