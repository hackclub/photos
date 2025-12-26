"use server";
import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  events,
  media,
  mediaMentions,
  mediaTags,
  series,
  tags,
  users,
} from "@/lib/db/schema";
import {
  augmentMediaWithPermissions,
  can,
  getAccessibleEventIds,
  getUserContext,
} from "@/lib/policy";
export type SearchResults = {
  users: (typeof users.$inferSelect)[];
  events: (typeof events.$inferSelect)[];
  series: (typeof series.$inferSelect)[];
  media: (typeof media.$inferSelect & {
    event: typeof events.$inferSelect;
    uploadedBy: typeof users.$inferSelect;
  })[];
  tags: (typeof tags.$inferSelect)[];
};
export async function globalSearch(query: string): Promise<{
  success: boolean;
  results?: SearchResults;
  error?: string;
}> {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return {
        success: true,
        results: { users: [], events: [], series: [], media: [], tags: [] },
      };
    }
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      return {
        success: true,
        results: { users: [], events: [], series: [], media: [], tags: [] },
      };
    }
    const searchPattern = `%${trimmedQuery}%`;
    const tagResults = await db.query.tags.findMany({
      where: ilike(tags.name, searchPattern),
      limit: 5,
    });
    let userResults: (typeof users.$inferSelect)[] = [];
    if (session) {
      userResults = await db.query.users.findMany({
        where: or(
          ilike(users.name, searchPattern),
          ilike(users.email, searchPattern),
          ilike(users.handle, searchPattern),
        ),
        limit: 5,
        orderBy: [desc(users.createdAt)],
      });
    }
    const seriesConditions = [
      or(
        ilike(series.name, searchPattern),
        ilike(series.description, searchPattern),
      ),
    ];
    if (session) {
      seriesConditions.push(
        inArray(series.visibility, ["public", "auth_required", "unlisted"]),
      );
    } else {
      seriesConditions.push(eq(series.visibility, "public"));
    }
    const rawSeriesResults = await db.query.series.findMany({
      where: and(...seriesConditions),
      limit: 20,
      orderBy: [desc(series.createdAt)],
    });
    const seriesResults = (
      await Promise.all(
        rawSeriesResults.map(async (s) => {
          if (await can(user, "view", "series", s)) {
            return s;
          }
          return null;
        }),
      )
    )
      .filter((s) => s !== null)
      .slice(0, 5);
    const eventConditions = [
      or(
        ilike(events.name, searchPattern),
        ilike(events.description, searchPattern),
        ilike(events.location, searchPattern),
      ),
    ];
    if (session) {
      eventConditions.push(
        inArray(events.visibility, ["public", "auth_required", "unlisted"]),
      );
    } else {
      eventConditions.push(eq(events.visibility, "public"));
    }
    const rawEventResults = await db.query.events.findMany({
      where: and(...eventConditions),
      limit: 20,
      orderBy: [desc(events.createdAt)],
    });
    const accessibleEventIds = await getAccessibleEventIds(
      session?.id,
      rawEventResults,
    );
    const eventResults = rawEventResults
      .filter((e) => accessibleEventIds.has(e.id))
      .slice(0, 5);
    const matchingUsers = await db.query.users.findMany({
      where: or(
        ilike(users.name, searchPattern),
        ilike(users.handle, searchPattern),
      ),
      columns: { id: true },
      limit: 10,
    });
    const matchingUserIds = matchingUsers.map((u) => u.id);
    const mediaSearchConditions = [
      ilike(media.caption, searchPattern),
      ilike(media.filename, searchPattern),
    ];
    if (matchingUserIds.length > 0) {
      mediaSearchConditions.push(inArray(media.uploadedById, matchingUserIds));
      const mentionSubquery = db
        .select({ mediaId: mediaMentions.mediaId })
        .from(mediaMentions)
        .where(inArray(mediaMentions.userId, matchingUserIds));
      mediaSearchConditions.push(inArray(media.id, mentionSubquery));
    }
    const mediaResults = await db.query.media.findMany({
      where: or(...mediaSearchConditions),
      limit: 20,
      with: {
        event: true,
        uploadedBy: true,
      },
      orderBy: [desc(media.uploadedAt)],
    });
    const mediaEvents = mediaResults
      .map((m) => m.event)
      .filter(
        (e): e is NonNullable<(typeof mediaResults)[number]["event"]> => !!e,
      );
    const accessibleMediaEventIds = await getAccessibleEventIds(
      session?.id,
      mediaEvents,
    );
    const filteredMedia = mediaResults
      .filter((m) => m.event && accessibleMediaEventIds.has(m.event.id))
      .slice(0, 10);
    const finalMedia = await augmentMediaWithPermissions(
      session?.id,
      filteredMedia,
    );
    return {
      success: true,
      results: {
        users: userResults,
        events: eventResults,
        series: seriesResults,
        media: finalMedia,
        tags: tagResults,
      },
    };
  } catch (error) {
    console.error("Global search error:", error);
    return { success: false, error: "Failed to perform search" };
  }
}
export type AdvancedSearchFilters = {
  type?: "all" | "photo" | "video";
  uploaderIds?: string[];
  eventIds?: string[];
  seriesIds?: string[];
  tagIds?: string[];
  mentionedUserIds?: string[];
  dateRange?: "any" | "today" | "yesterday" | "week" | "month" | "year";
};
export async function getSearchFilterOptions() {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return {
        success: true,
        data: {
          events: [],
          series: [],
          users: [],
          tags: [],
        },
      };
    }
    const [allEvents, allSeries, allUsers, allTags] = await Promise.all([
      db.query.events.findMany({
        orderBy: [desc(events.createdAt)],
        columns: { id: true, name: true },
        limit: 100,
      }),
      db.query.series.findMany({
        orderBy: [desc(series.createdAt)],
        columns: { id: true, name: true },
        limit: 100,
      }),
      db.query.users.findMany({
        orderBy: [desc(users.createdAt)],
        columns: { id: true, name: true, handle: true },
        limit: 100,
      }),
      db.query.tags.findMany({
        orderBy: [desc(tags.name)],
        columns: { id: true, name: true, color: true },
        limit: 100,
      }),
    ]);
    return {
      success: true,
      data: {
        events: allEvents,
        series: allSeries,
        users: allUsers,
        tags: allTags,
      },
    };
  } catch (error) {
    console.error("Failed to fetch filter options:", error);
    return { success: false, error: "Failed to fetch filter options" };
  }
}
export async function advancedSearch(
  query: string,
  filters: AdvancedSearchFilters = {},
): Promise<{
  success: boolean;
  results?: SearchResults;
  error?: string;
}> {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return {
        success: true,
        results: { users: [], events: [], series: [], media: [], tags: [] },
      };
    }
    const trimmedQuery = query.trim();
    const searchPattern = `%${trimmedQuery}%`;
    let tagResults: (typeof tags.$inferSelect)[] = [];
    if (trimmedQuery.length >= 2) {
      tagResults = await db.query.tags.findMany({
        where: ilike(tags.name, searchPattern),
        limit: 10,
      });
    }
    let userResults: (typeof users.$inferSelect)[] = [];
    if (session && trimmedQuery.length >= 2) {
      userResults = await db.query.users.findMany({
        where: or(
          ilike(users.name, searchPattern),
          ilike(users.email, searchPattern),
          ilike(users.handle, searchPattern),
        ),
        limit: 5,
        orderBy: [desc(users.createdAt)],
      });
    }
    let eventResults: (typeof events.$inferSelect)[] = [];
    if (trimmedQuery.length >= 2) {
      const eventConditions = [
        or(
          ilike(events.name, searchPattern),
          ilike(events.description, searchPattern),
          ilike(events.location, searchPattern),
        ),
      ];
      if (session) {
        eventConditions.push(
          inArray(events.visibility, ["public", "auth_required", "unlisted"]),
        );
      } else {
        eventConditions.push(eq(events.visibility, "public"));
      }
      const rawEventResults = await db.query.events.findMany({
        where: and(...eventConditions),
        limit: 20,
        orderBy: [desc(events.createdAt)],
      });
      const accessibleEventIds = await getAccessibleEventIds(
        session?.id,
        rawEventResults,
      );
      eventResults = rawEventResults
        .filter((e) => accessibleEventIds.has(e.id))
        .slice(0, 5);
    }
    const mediaConditions = [];
    if (trimmedQuery.length > 0) {
      const matchingUsers = await db.query.users.findMany({
        where: or(
          ilike(users.name, searchPattern),
          ilike(users.handle, searchPattern),
        ),
        columns: { id: true },
        limit: 10,
      });
      const matchingUserIds = matchingUsers.map((u) => u.id);
      const textSearchConditions = [
        ilike(media.caption, searchPattern),
        ilike(media.filename, searchPattern),
      ];
      if (matchingUserIds.length > 0) {
        textSearchConditions.push(inArray(media.uploadedById, matchingUserIds));
        const mentionSubquery = db
          .select({ mediaId: mediaMentions.mediaId })
          .from(mediaMentions)
          .where(inArray(mediaMentions.userId, matchingUserIds));
        textSearchConditions.push(inArray(media.id, mentionSubquery));
      }
      mediaConditions.push(or(...textSearchConditions));
    }
    if (filters.type === "photo") {
      mediaConditions.push(ilike(media.mimeType, "image/%"));
    } else if (filters.type === "video") {
      mediaConditions.push(ilike(media.mimeType, "video/%"));
    }
    if (filters.uploaderIds && filters.uploaderIds.length > 0) {
      mediaConditions.push(inArray(media.uploadedById, filters.uploaderIds));
    }
    if (filters.eventIds && filters.eventIds.length > 0) {
      mediaConditions.push(inArray(media.eventId, filters.eventIds));
    }
    if (filters.seriesIds && filters.seriesIds.length > 0) {
      const eventsInSeries = db
        .select({ id: events.id })
        .from(events)
        .where(inArray(events.seriesId, filters.seriesIds));
      mediaConditions.push(inArray(media.eventId, eventsInSeries));
    }
    if (filters.dateRange && filters.dateRange !== "any") {
      const _now = new Date();
      const startDate = new Date();
      switch (filters.dateRange) {
        case "today":
          startDate.setHours(0, 0, 0, 0);
          break;
        case "yesterday":
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          break;
        case "week":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "month":
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case "year":
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }
      mediaConditions.push(gte(media.takenAt, startDate));
    }
    if (filters.tagIds && filters.tagIds.length > 0) {
      const mediaWithTag = db
        .select({ mediaId: mediaTags.mediaId })
        .from(mediaTags)
        .where(inArray(mediaTags.tagId, filters.tagIds));
      mediaConditions.push(inArray(media.id, mediaWithTag));
    }
    if (filters.mentionedUserIds && filters.mentionedUserIds.length > 0) {
      const mentionSubquery = db
        .select({ mediaId: mediaMentions.mediaId })
        .from(mediaMentions)
        .where(inArray(mediaMentions.userId, filters.mentionedUserIds));
      mediaConditions.push(
        or(
          inArray(media.uploadedById, filters.mentionedUserIds),
          inArray(media.id, mentionSubquery),
        ),
      );
    }
    const mediaResults = await db.query.media.findMany({
      where: and(...mediaConditions),
      limit: 500,
      with: {
        event: true,
        uploadedBy: true,
      },
      orderBy: [
        sql`${media.takenAt} DESC NULLS LAST`,
        sql`${media.uploadedAt} DESC`,
      ],
    });
    const mediaEvents = mediaResults
      .map((m) => m.event)
      .filter(
        (e): e is NonNullable<(typeof mediaResults)[number]["event"]> => !!e,
      );
    const accessibleMediaEventIds = await getAccessibleEventIds(
      session?.id,
      mediaEvents,
    );
    const filteredMedia = mediaResults.filter(
      (m) => m.event && accessibleMediaEventIds.has(m.event.id),
    );
    const finalMedia = await augmentMediaWithPermissions(
      session?.id,
      filteredMedia,
    );
    return {
      success: true,
      results: {
        users: userResults,
        events: eventResults,
        series: [],
        media: finalMedia,
        tags: tagResults,
      },
    };
  } catch (error) {
    console.error("Advanced search error:", error);
    return { success: false, error: "Failed to perform advanced search" };
  }
}
