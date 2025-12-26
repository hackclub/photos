import { count, eq, sql } from "drizzle-orm";
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
  const eventBannerUrls = new Map<string, string>();
  const eventCounts = new Map<
    string,
    {
      media: number;
      participants: number;
    }
  >();
  await Promise.all(
    events.map(async (event) => {
      if (event.bannerS3Key) {
        eventBannerUrls.set(
          event.id,
          getAssetProxyUrl("event-banner", event.id),
        );
      }
      try {
        const [mediaCount] = await db
          .select({ count: count() })
          .from(media)
          .where(eq(media.eventId, event.id));
        const [participantCount] = await db
          .select({ count: count() })
          .from(eventParticipants)
          .where(eq(eventParticipants.eventId, event.id));
        eventCounts.set(event.id, {
          media: mediaCount.count,
          participants: participantCount.count,
        });
      } catch (error) {
        console.error(`Error fetching counts for event ${event.id}:`, error);
        eventCounts.set(event.id, { media: 0, participants: 0 });
      }
    }),
  );
  const randomMedia = await db.query.media.findMany({
    where: (media, { inArray }) =>
      inArray(
        media.eventId,
        events.map((e) => e.id),
      ),
    limit: 20,
    orderBy: sql`RANDOM()`,
  });
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
            <Link
              href="/admin/events"
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
              <Link
                href="/admin/events"
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
