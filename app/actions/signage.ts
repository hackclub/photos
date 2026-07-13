"use server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, media, series } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getMediaProxyUrl } from "@/lib/media/s3";
import {
  can,
  getAccessibleEventIdsForUser,
  getUserContext,
} from "@/lib/policy";
import { publicSeries } from "@/lib/public-data";
import { toPublicUser } from "@/lib/user-display";

function toSignageMedia(item: any, url: string) {
  return {
    id: item.id,
    eventId: item.eventId,
    filename: item.filename,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    caption: item.caption,
    uploadedAt: item.uploadedAt,
    event: item.event,
    uploadedBy: toPublicUser(item.uploadedBy),
    url,
    thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
  };
}

function clampLimit(limit: number, fallback: number) {
  return Number.isFinite(limit)
    ? Math.max(1, Math.min(100, Math.floor(limit)))
    : fallback;
}

export type SignageFilter = {
  seriesId?: string;
  eventId?: string;
};
export async function getRandomMedia(filter: SignageFilter = {}, limit = 50) {
  try {
    const safeLimit = clampLimit(limit, 50);
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
      orderBy: [sql`random()`],
      limit: safeLimit,
      with: {
        event: true,
        uploadedBy: {
          columns: {
            id: true,
            preferredName: true,
            handle: true,
            slackId: true,
          },
        },
      },
    });
    const mediaWithUrls = await Promise.all(
      randomMedia.map(async (item) => {
        return toSignageMedia(item, getMediaProxyUrl(item.id));
      }),
    );
    return { success: true, media: mediaWithUrls };
  } catch (error) {
    logger.error("Error fetching random media:", error);
    return { success: false, error: "Failed to fetch media" };
  }
}
export async function getLatestMedia(limit = 1) {
  try {
    const safeLimit = clampLimit(limit, 1);
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
      limit: safeLimit,
      with: {
        event: true,
        uploadedBy: {
          columns: {
            id: true,
            preferredName: true,
            handle: true,
            slackId: true,
          },
        },
      },
    });
    const mediaWithUrls = await Promise.all(
      latestMedia.map(async (item) => {
        return toSignageMedia(item, getMediaProxyUrl(item.id));
      }),
    );
    return { success: true, media: mediaWithUrls };
  } catch (error) {
    logger.error("Error fetching latest media:", error);
    return { success: false, error: "Failed to fetch latest media" };
  }
}

export async function getRandomMediaIds(limit = 12) {
  try {
    const safeLimit = clampLimit(limit, 12);
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) return { success: true, ids: [] as string[] };
    const accessibleEventIds = await getAccessibleEventIdsForUser(user?.id);
    if (accessibleEventIds.length === 0)
      return { success: true, ids: [] as string[] };
    const rows = await db.query.media.findMany({
      where: and(
        inArray(media.eventId, accessibleEventIds),
        sql`${media.mimeType} LIKE 'image/%'`,
      ),
      orderBy: [sql`random()`],
      limit: safeLimit,
      columns: { id: true },
    });
    return { success: true, ids: rows.map((row) => row.id) };
  } catch (error) {
    logger.error("Error fetching random media ids:", error);
    return { success: false, error: "Failed to fetch media" };
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
    const accessibleEvents = allEvents
      .filter((e) => accessibleEventIdsSet.has(e.id))
      .map(({ inviteCode: _inviteCode, ...event }) => event);
    const accessibleSeries = [];
    for (const s of allSeries) {
      if (await can(user, "view", "series", s)) {
        accessibleSeries.push(s);
      }
    }
    return {
      success: true,
      series: accessibleSeries.map(publicSeries),
      events: accessibleEvents,
    };
  } catch (error) {
    logger.error("Error fetching series and events:", error);
    return { success: false, error: "Failed to fetch data" };
  }
}
