import { count, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { HiCalendar } from "react-icons/hi2";
import EventCard from "@/components/events/EventCard";
import Hero from "@/components/ui/Hero";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventParticipants,
  events as eventsTable,
  media,
} from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
import { getAccessibleEventIds, getUserContext } from "@/lib/policy";
export default async function EventsPage() {
  const session = await getSession();
  const ctx = await getUserContext(session?.id);
  let events = [];
  if (ctx && !ctx.isBanned) {
    const allEvents = await db.query.events.findMany({
      orderBy: (events, { desc }) => [desc(events.createdAt)],
      with: {
        series: true,
      },
    });
    const accessibleIds = await getAccessibleEventIds(ctx.id, allEvents);
    events = allEvents.filter((e) => accessibleIds.has(e.id));
  } else {
    events = await db.query.events.findMany({
      where: eq(eventsTable.visibility, "public"),
      orderBy: (events, { desc }) => [desc(events.createdAt)],
      with: {
        series: true,
      },
    });
  }
  const adminEventIds = new Set<string>();
  if (ctx) {
    for (const admin of ctx.eventAdmins) {
      adminEventIds.add(admin.eventId);
    }
    for (const admin of ctx.seriesAdmins) {
      for (const event of events) {
        if (event.seriesId === admin.seriesId) {
          adminEventIds.add(event.id);
        }
      }
    }
    if (ctx.isGlobalAdmin) {
      for (const event of events) {
        adminEventIds.add(event.id);
      }
    }
  }
  const eventBannerUrls = new Map<string, string>();
  const eventCounts = new Map<
    string,
    {
      media: number;
      participants: number;
    }
  >();
  const eventIds = events.map((event) => event.id);
  for (const event of events) {
    if (event.bannerS3Key) {
      eventBannerUrls.set(event.id, getAssetProxyUrl("event-banner", event.id));
    }
  }
  if (eventIds.length > 0) {
    const [mediaCounts, participantCounts] = await Promise.all([
      db
        .select({ eventId: media.eventId, count: count() })
        .from(media)
        .where(inArray(media.eventId, eventIds))
        .groupBy(media.eventId),
      db
        .select({ eventId: eventParticipants.eventId, count: count() })
        .from(eventParticipants)
        .where(inArray(eventParticipants.eventId, eventIds))
        .groupBy(eventParticipants.eventId),
    ]);
    const mediaCountMap = new Map(
      mediaCounts.map((item) => [item.eventId, item.count]),
    );
    const participantCountMap = new Map(
      participantCounts.map((item) => [item.eventId, item.count]),
    );
    for (const id of eventIds) {
      eventCounts.set(id, {
        media: mediaCountMap.get(id) ?? 0,
        participants: participantCountMap.get(id) ?? 0,
      });
    }
  }
  events = [...events].sort((a, b) => {
    const aPhotos = eventCounts.get(a.id)?.media ?? 0;
    const bPhotos = eventCounts.get(b.id)?.media ?? 0;
    if (aPhotos === 0 && bPhotos > 0) return 1;
    if (bPhotos === 0 && aPhotos > 0) return -1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const randomMedia =
    eventIds.length > 0
      ? await db.query.media.findMany({
          where: inArray(media.eventId, eventIds),
          limit: 20,
          orderBy: [desc(media.uploadedAt)],
        })
      : [];
  const heroImages = randomMedia
    .map((m) => {
      try {
        if (m.thumbnailS3Key) {
          return getMediaProxyUrl(m.id, "thumbnail");
        }
        return getMediaProxyUrl(m.id);
      } catch (_e) {
        return null;
      }
    })
    .filter((url): url is string => !!url);
  return (
    <div className="min-h-screen">
      <Hero
        title="Events"
        size="sm"
        subtitle={
          ctx
            ? "Browse and join photo collections from Hack Club events"
            : "Public photo collections from Hack Club events"
        }
        images={heroImages}
        actions={
          (ctx?.isGlobalAdmin ||
            (ctx?.seriesAdmins && ctx.seriesAdmins.length > 0)) && (
            <Link prefetch={false} href="/admin/events"
              className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:scale-105"
            >
              + Create Event
            </Link>
          )
        }
      />

      <div className="px-4 sm:px-8 py-6 sm:py-8">
        {events.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={{
                  ...event,
                  isAdmin: adminEventIds.has(event.id),
                  bannerUrl: eventBannerUrls.get(event.id),
                  mediaCount: eventCounts.get(event.id)?.media || 0,
                  participantCount:
                    eventCounts.get(event.id)?.participants || 0,
                }}
                showVisibilityBadge={true}
                showStats={true}
                showSeries={true}
                showDate={false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
              <HiCalendar className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-3">
              No events yet
            </h3>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              {ctx
                ? ctx.isGlobalAdmin
                  ? "Create an event!"
                  : "Events haven't been made yet!"
                : "No public events available at this time."}
            </p>
            {(ctx?.isGlobalAdmin ||
              (ctx?.seriesAdmins && ctx.seriesAdmins.length > 0)) && (
              <Link prefetch={false} href="/admin/events"
                className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-lg "
              >
                + Create First Event
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
