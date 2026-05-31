import { count, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { unauthorizedResponse, validateApiKey } from "@/lib/auth-api";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { eventParticipants, media } from "@/lib/db/schema";
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
    const event = await db.query.events.findFirst({
      where: (events, { and, eq }) =>
        and(eq(events.slug, slug), eq(events.visibility, "public")),
      with: {
        series: {
          columns: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
    if (!event) {
      return Response.json({ error: "Event not found" }, { status: 404 });
    }
    const [allMedia, [participantCountRow]] = await Promise.all([
      db
        .select({ mimeType: media.mimeType })
        .from(media)
        .where(eq(media.eventId, event.id)),
      db
        .select({ value: count() })
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, event.id)),
    ]);
    const photoCount = allMedia.filter((m) =>
      m.mimeType?.startsWith("image/"),
    ).length;
    const videosCount = allMedia.filter((m) =>
      m.mimeType?.startsWith("video/"),
    ).length;
    return Response.json({
      data: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        eventDate: event.eventDate,
        location: event.location,
        locationCity: event.locationCity,
        latitude: event.latitude,
        longitude: event.longitude,
        bannerUrl: event.bannerS3Key
          ? getAssetProxyUrl("event-banner", event.id)
          : null,
        createdAt: event.createdAt,
        photoCount,
        videoCount: videosCount,
        totalMedia: photoCount + videosCount,
        participantCount: participantCountRow?.value ?? 0,
        series: event.series
          ? {
              id: event.series.id,
              name: event.series.name,
              slug: event.series.slug,
              detailUrl: `${APP_URL}/api/v1/series/${event.series.slug}`,
            }
          : null,
        mediaUrl: `${APP_URL}/api/v1/media?event=${event.slug}`,
        photosUrl: `${APP_URL}/api/v1/photos?event=${event.slug}`,
        videosUrl: `${APP_URL}/api/v1/videos?event=${event.slug}`,
      },
    });
  } catch (error) {
    logger.error("Error fetching event details:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
