"use server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { events, series } from "@/lib/db/schema";
import { fetchFeedItems } from "@/lib/feed";
import { can, getAccessibleEventIds, getUserContext } from "@/lib/policy";
export async function getGlobalFeed(limit = 50, offset = 0) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return { success: true, items: [], nextOffset: null };
    }
    const safeLimit = Math.min(limit, 100);
    const allEvents = await db.query.events.findMany({
      columns: { id: true, visibility: true, seriesId: true },
    });
    const accessibleEventIdsSet = await getAccessibleEventIds(
      user?.id,
      allEvents,
    );
    const accessibleEventIds = Array.from(accessibleEventIdsSet);
    const result = await fetchFeedItems(
      accessibleEventIds,
      safeLimit,
      offset,
      user?.id,
    );
    return { success: true, ...result };
  } catch (error) {
    console.error("Feed error:", error);
    return { success: false, error: "Failed to fetch feed" };
  }
}
export async function getEventFeed(eventId: string, limit = 50, offset = 0) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    const safeLimit = Math.min(limit, 100);
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });
    if (!event) {
      return { success: false, error: "Event not found" };
    }
    if (!(await can(user, "view", "event", event))) {
      if (!user) {
        return { success: false, error: "Unauthorized" };
      }
      return { success: false, error: "Forbidden" };
    }
    const result = await fetchFeedItems([eventId], safeLimit, offset, user?.id);
    return {
      success: true,
      ...result,
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
      },
    };
  } catch (error) {
    console.error("Event feed error:", error);
    return { success: false, error: "Failed to fetch event feed" };
  }
}
export async function getSeriesFeed(seriesId: string, limit = 50, offset = 0) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return { success: true, items: [], nextOffset: null };
    }
    const safeLimit = Math.min(limit, 100);
    const seriesData = await db.query.series.findFirst({
      where: eq(series.id, seriesId),
      with: {
        events: true,
      },
    });
    if (!seriesData) {
      return { success: false, error: "Series not found" };
    }
    const accessibleEventIdsSet = await getAccessibleEventIds(
      user?.id,
      seriesData.events,
    );
    const accessibleEventIds = Array.from(accessibleEventIdsSet);
    const result = await fetchFeedItems(
      accessibleEventIds,
      safeLimit,
      offset,
      user?.id,
    );
    return {
      success: true,
      ...result,
      series: {
        id: seriesData.id,
        name: seriesData.name,
        slug: seriesData.slug,
      },
    };
  } catch (error) {
    console.error("Series feed error:", error);
    return { success: false, error: "Failed to fetch series feed" };
  }
}
