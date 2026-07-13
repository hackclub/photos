"use server";
import { and, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, media } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getMediaProxyUrl } from "@/lib/media/s3";
import { getAccessibleEventIds, getUserContext } from "@/lib/policy";
export async function getMapData(eventSlug?: string | null) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return {
        success: true,
        data: {
          photos: [],
          events: [],
        },
      };
    }
    const results = await db
      .select({
        id: media.id,
        filename: media.filename,
        mimeType: media.mimeType,
        latitude: media.latitude,
        longitude: media.longitude,
        uploadedAt: media.uploadedAt,
        eventId: media.eventId,
        uploadedById: media.uploadedById,
        eventName: events.name,
        eventSlug: events.slug,
        eventVisibility: events.visibility,
        eventSeriesId: events.seriesId,
      })
      .from(media)
      .innerJoin(events, eq(media.eventId, events.id))
      .where(
        and(
          isNotNull(media.latitude),
          isNotNull(media.longitude),
          eventSlug ? eq(events.slug, eventSlug) : undefined,
        ),
      )
      .orderBy(desc(media.uploadedAt))
      .limit(5_000);
    const uniqueEventsMap = new Map<
      string,
      {
        id: string;
        visibility: (typeof events.$inferSelect)["visibility"];
        seriesId: string | null;
      }
    >();
    for (const item of results) {
      uniqueEventsMap.set(item.eventId, {
        id: item.eventId,
        visibility: item.eventVisibility,
        seriesId: item.eventSeriesId,
      });
    }
    const uniqueEventsList = Array.from(uniqueEventsMap.values());
    const accessibleEventIds = await getAccessibleEventIds(
      user?.id,
      uniqueEventsList,
    );
    const accessibleMedia = [];
    for (const item of results) {
      if (accessibleEventIds.has(item.eventId)) {
        const lat = Number(item.latitude);
        const lng = Number(item.longitude);
        if (
          item.latitude !== null &&
          item.longitude !== null &&
          !Number.isNaN(lat) &&
          !Number.isNaN(lng)
        ) {
          accessibleMedia.push({
            id: item.id,
            filename: item.filename,
            mimeType: item.mimeType,
            thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
            lat: lat,
            lng: lng,
            uploadedAt: item.uploadedAt,
            event: {
              id: item.eventId,
              name: item.eventName,
              slug: item.eventSlug,
            },
          });
        }
      }
    }
    const eventsWithLocation = await db.query.events.findMany({
      where: and(
        isNotNull(events.latitude),
        isNotNull(events.longitude),
        eventSlug ? eq(events.slug, eventSlug) : undefined,
      ),
      columns: {
        id: true,
        name: true,
        slug: true,
        locationCity: true,
        locationCountry: true,
        latitude: true,
        longitude: true,
        visibility: true,
        seriesId: true,
      },
      with: {
        media: {
          columns: {
            id: true,
            filename: true,
            mimeType: true,
            uploadedAt: true,
          },
          orderBy: [desc(media.uploadedAt)],
          limit: 9,
        },
      },
      orderBy: [desc(events.createdAt)],
      limit: 500,
    });
    const accessibleLocationEventIds = await getAccessibleEventIds(
      user?.id,
      eventsWithLocation,
    );
    const visibleLocationEvents = eventsWithLocation.filter((event) =>
      accessibleLocationEventIds.has(event.id),
    );
    const locationEventIds = visibleLocationEvents.map((event) => event.id);
    const eventMediaCounts =
      locationEventIds.length > 0
        ? await db
            .select({ eventId: media.eventId, count: count() })
            .from(media)
            .where(inArray(media.eventId, locationEventIds))
            .groupBy(media.eventId)
        : [];
    const mediaCountByEventId = new Map(
      eventMediaCounts.map((item) => [item.eventId, item.count]),
    );
    const accessibleEvents = [];
    for (const event of visibleLocationEvents) {
      const lat = Number(event.latitude);
      const lng = Number(event.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      accessibleEvents.push({
        id: event.id,
        name: event.name,
        slug: event.slug,
        city: event.locationCity,
        country: event.locationCountry,
        lat,
        lng,
        photoCount: mediaCountByEventId.get(event.id) ?? 0,
        photos: event.media.map((item) => ({
          ...item,
          thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
        })),
      });
    }
    return {
      success: true,
      data: {
        photos: accessibleMedia,
        events: accessibleEvents,
      },
    };
  } catch (error) {
    logger.error("Error fetching map data:", error);
    return { success: false, error: "Failed to fetch map data" };
  }
}
