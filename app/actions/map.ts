"use server";
import { and, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, media } from "@/lib/db/schema";
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
    const query = db
      .select({
        id: media.id,
        filename: media.filename,
        mimeType: media.mimeType,
        thumbnailS3Key: media.thumbnailS3Key,
        s3Key: media.s3Key,
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
          sql`${media.latitude} IS NOT NULL`,
          sql`${media.longitude} IS NOT NULL`,
        ),
      );
    const results = await query;
    const uniqueEvents = Array.from(
      new Set(
        results.map((item) => ({
          id: item.eventId,
          visibility: item.eventVisibility,
          seriesId: item.eventSeriesId,
        })),
      ),
    );
    const uniqueEventsMap = new Map();
    for (const e of uniqueEvents) {
      uniqueEventsMap.set(e.id, e);
    }
    const uniqueEventsList = Array.from(uniqueEventsMap.values());
    const accessibleEventIds = await getAccessibleEventIds(
      user?.id,
      uniqueEventsList,
    );
    const accessibleMedia = [];
    for (const item of results) {
      if (accessibleEventIds.has(item.eventId)) {
        if (item.latitude !== null && item.longitude !== null) {
          accessibleMedia.push({
            id: item.id,
            filename: item.filename,
            mimeType: item.mimeType,
            thumbnailS3Key: item.thumbnailS3Key,
            s3Key: item.s3Key,
            lat: item.latitude,
            lng: item.longitude,
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
    let filteredMedia = accessibleMedia;
    if (eventSlug) {
      filteredMedia = accessibleMedia.filter((m) => m.event.slug === eventSlug);
    }
    const eventsWithLocation = await db
      .select({
        id: events.id,
        name: events.name,
        slug: events.slug,
        locationCity: events.locationCity,
        locationCountry: events.locationCountry,
        latitude: events.latitude,
        longitude: events.longitude,
        visibility: events.visibility,
        seriesId: events.seriesId,
      })
      .from(events)
      .where(
        and(
          sql`${events.latitude} IS NOT NULL`,
          sql`${events.longitude} IS NOT NULL`,
        ),
      );
    const accessibleLocationEventIds = await getAccessibleEventIds(
      user?.id,
      eventsWithLocation,
    );
    const accessibleEvents = [];
    for (const event of eventsWithLocation) {
      if (accessibleLocationEventIds.has(event.id)) {
        const eventPhotos = await db
          .select({
            id: media.id,
            filename: media.filename,
            mimeType: media.mimeType,
            thumbnailS3Key: media.thumbnailS3Key,
            s3Key: media.s3Key,
            uploadedAt: media.uploadedAt,
          })
          .from(media)
          .where(eq(media.eventId, event.id))
          .orderBy(media.uploadedAt);
        accessibleEvents.push({
          id: event.id,
          name: event.name,
          slug: event.slug,
          city: event.locationCity,
          country: event.locationCountry,
          lat: event.latitude,
          lng: event.longitude,
          photos: eventPhotos,
        });
      }
    }
    let filteredEvents = accessibleEvents;
    if (eventSlug) {
      filteredEvents = accessibleEvents.filter((e) => e.slug === eventSlug);
    }
    return {
      success: true,
      data: {
        photos: filteredMedia,
        events: filteredEvents,
      },
    };
  } catch (error) {
    console.error("Error fetching map data:", error);
    return { success: false, error: "Failed to fetch map data" };
  }
}
