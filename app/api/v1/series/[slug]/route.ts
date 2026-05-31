import { count, desc, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { unauthorizedResponse, validateApiKey } from "@/lib/auth-api";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { events, media } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getAssetProxyUrl } from "@/lib/media/s3";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await validateApiKey();
  if (!auth) {
    return unauthorizedResponse();
  }
  const { slug } = await params;
  try {
    const seriesData = await db.query.series.findFirst({
      where: (series, { eq }) => eq(series.slug, slug),
      with: {
        events: {
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
            eventDate: true,
            location: true,
            locationCity: true,
            visibility: true,
            bannerS3Key: true,
          },
          orderBy: desc(events.eventDate),
        },
      },
    });
    if (!seriesData) {
      return Response.json({ error: "Series not found" }, { status: 404 });
    }
    if (seriesData.visibility !== "public") {
      return Response.json({ error: "Series not found" }, { status: 404 });
    }
    const publicEvents = seriesData.events.filter(
      (event) => event.visibility === "public",
    );
    const eventIds = publicEvents.map((e) => e.id);
    const mediaCounts =
      eventIds.length > 0
        ? await db
            .select({ eventId: media.eventId, value: count() })
            .from(media)
            .where(inArray(media.eventId, eventIds))
            .groupBy(media.eventId)
        : [];
    const photoCountByEventId = new Map(
      mediaCounts.map((row) => [row.eventId, row.value]),
    );
    const totalPhotos = mediaCounts.reduce((sum, row) => sum + row.value, 0);
    return Response.json({
      data: {
        id: seriesData.id,
        name: seriesData.name,
        slug: seriesData.slug,
        description: seriesData.description,
        bannerUrl: seriesData.bannerS3Key
          ? getAssetProxyUrl("series-banner", seriesData.id)
          : null,
        createdAt: seriesData.createdAt,
        totalPhotos,
        eventCount: publicEvents.length,
        events: publicEvents.map((event) => ({
          id: event.id,
          name: event.name,
          slug: event.slug,
          description: event.description,
          eventDate: event.eventDate,
          location: event.location,
          locationCity: event.locationCity,
          bannerUrl: event.bannerS3Key
            ? getAssetProxyUrl("event-banner", event.id)
            : null,
          photoCount: photoCountByEventId.get(event.id) ?? 0,
          detailUrl: `${APP_URL}/api/v1/events/${event.slug}`,
        })),
      },
    });
  } catch (error) {
    logger.error("Error fetching series details:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
