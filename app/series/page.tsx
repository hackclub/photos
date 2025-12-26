import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { HiFolder } from "react-icons/hi2";
import SeriesCard from "@/components/series/SeriesCard";
import Hero from "@/components/ui/Hero";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { series as seriesTable } from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
import { can, getUserContext } from "@/lib/policy";
export default async function SeriesPage() {
  const session = await getSession();
  const ctx = await getUserContext(session?.id);
  let series = [];
  if (ctx) {
    const allSeries = await db.query.series.findMany({
      orderBy: (series, { desc }) => [desc(series.createdAt)],
      with: {
        events: {
          with: {
            media: {
              columns: {
                id: true,
              },
            },
          },
        },
      },
    });
    series = (
      await Promise.all(
        allSeries.map(async (s) => {
          if (await can(ctx, "view", "series", s)) {
            return s;
          }
          return null;
        }),
      )
    ).filter((s) => s !== null);
  } else {
    series = await db.query.series.findMany({
      where: eq(seriesTable.visibility, "public"),
      orderBy: (series, { desc }) => [desc(series.createdAt)],
      with: {
        events: {
          with: {
            media: {
              columns: {
                id: true,
              },
            },
          },
        },
      },
    });
  }
  const seriesBannerUrls = new Map<string, string>();
  for (const s of series) {
    if (s.bannerS3Key) {
      seriesBannerUrls.set(s.id, getAssetProxyUrl("series-banner", s.id));
    }
  }
  const eventIds = series.flatMap((s) => s.events.map((e) => e.id));
  let heroImages: string[] = [];
  if (eventIds.length > 0) {
    const randomMedia = await db.query.media.findMany({
      where: (media, { inArray }) => inArray(media.eventId, eventIds),
      limit: 20,
      orderBy: sql`RANDOM()`,
    });
    heroImages = randomMedia
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
  }
  return (
    <div className="min-h-screen">
      <Hero
        title="Event Series"
        size="sm"
        subtitle={
          ctx
            ? "Explore photo collections organized by event series"
            : "Public event series photo collections"
        }
        images={heroImages}
        actions={
          ctx?.isGlobalAdmin && (
            <Link
              href="/admin/series"
              className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-lg hover:scale-105"
            >
              + Create Series
            </Link>
          )
        }
      />

      <div className="px-4 sm:px-8 py-6 sm:py-8">
        {series.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {series.map((s) => (
              <SeriesCard
                key={s.id}
                series={{
                  ...s,
                  bannerUrl: seriesBannerUrls.get(s.id),
                  eventCount: s.events.length,
                  totalPhotos: s.events.reduce(
                    (total, event) => total + (event.media?.length || 0),
                    0,
                  ),
                }}
                showVisibilityBadge={true}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
              <HiFolder className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-3">
              No series yet
            </h3>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              {ctx
                ? ctx.isGlobalAdmin
                  ? "Create your first series!"
                  : "Event series haven't been made yet!"
                : "No public series available at this time."}
            </p>
            {ctx?.isGlobalAdmin && (
              <Link
                href="/admin/series"
                className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-lg "
              >
                + Create First Series
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
