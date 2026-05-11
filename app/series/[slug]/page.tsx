import { count, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { media, mediaLikes, series } from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
import { createOgMetadata } from "@/lib/metadata";
import { can, getUserContext } from "@/lib/policy";
import { toPublicUser } from "@/lib/user-display";
import SeriesDetailClient from "./SeriesDetailClient";
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    photo?: string;
  }>;
}) {
  const { slug } = await params;
  const { photo } = await searchParams;
  const seriesData = await db.query.series.findFirst({
    where: eq(series.slug, slug),
    with: {
      events: true,
    },
  });
  if (!seriesData) {
    return {
      title: "Series Not Found",
    };
  }
  const title = `${seriesData.name} | Hack Club Photos`;
  const description =
    seriesData.description || `Photo series: ${seriesData.name}`;
  if (photo) {
    const photoMedia = await db.query.media.findFirst({
      where: eq(media.id, photo),
    });
    const eventIds = new Set(seriesData.events.map((event) => event.id));
    if (photoMedia && eventIds.has(photoMedia.eventId)) {
      const imagePath =
        photoMedia.mimeType === "image/heic" ||
        photoMedia.mimeType === "image/heif"
          ? `/media/${photoMedia.id}/display`
          : `/media/${photoMedia.id}`;
      return createOgMetadata({
        title: `${photoMedia.caption || photoMedia.filename} | ${seriesData.name}`,
        description,
        path: `/series/${slug}?photo=${photo}`,
        imagePath: new URL(imagePath, APP_URL).toString(),
        imageAlt: photoMedia.caption || photoMedia.filename,
      });
    }
  }
  return createOgMetadata({
    title,
    description,
    path: `/series/${slug}`,
    imagePath: new URL(
      `/api/og/series/${encodeURIComponent(slug)}.png`,
      APP_URL,
    ).toString(),
    imageAlt: seriesData.name,
  });
}
export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const session = await getSession();
  const ctx = await getUserContext(session?.id);
  const { slug } = await params;
  const seriesData = await db.query.series.findFirst({
    where: eq(series.slug, slug),
    with: {
      events: {
        orderBy: (events, { desc }) => [desc(events.createdAt)],
      },
    },
  });
  if (!seriesData) {
    notFound();
  }
  const canView = await can(ctx, "view", "series", seriesData);
  if (!canView) {
    notFound();
  }
  const canEdit = await can(ctx, "manage", "series", seriesData.id);
  const seriesEvents = seriesData.events.map((event) => ({
    ...event,
    isAdmin: canEdit || !!ctx?.eventAdmins.some((admin) => admin.eventId === event.id),
  }));
  const eventIds = seriesData.events.map((e) => e.id);
  const allMedia =
    eventIds.length > 0
      ? await db.query.media.findMany({
          where: inArray(media.eventId, eventIds),
          with: {
            uploadedBy: {
              columns: {
                id: true,
                preferredName: true,
                handle: true,
                slackId: true,
              },
            },
          },
          orderBy: desc(media.uploadedAt),
        })
      : [];
  const likeCounts =
    allMedia.length > 0
      ? await db
          .select({ mediaId: mediaLikes.mediaId, count: count() })
          .from(mediaLikes)
          .where(
            inArray(
              mediaLikes.mediaId,
              allMedia.map((m) => m.id),
            ),
          )
          .groupBy(mediaLikes.mediaId)
      : [];
  const likeCountByMediaId = new Map(
    likeCounts.map((item) => [item.mediaId, item.count]),
  );
  const photoCount = allMedia.filter((m) =>
    m.mimeType.startsWith("image/"),
  ).length;
  const videoCount = allMedia.filter((m) =>
    m.mimeType.startsWith("video/"),
  ).length;
  const eventMediaUrls = new Map<string, string>();
  for (const event of seriesData.events) {
    if (!event.bannerS3Key) {
      const firstMedia = allMedia.find((m) => m.eventId === event.id);
      if (firstMedia) {
        try {
          const url = getMediaProxyUrl(
            firstMedia.id,
            firstMedia.thumbnailS3Key ? "thumbnail" : "original",
          );
          eventMediaUrls.set(event.id, url);
        } catch (error) {
          console.error(
            `Error fetching URL for event ${event.id} media:`,
            error,
          );
        }
      }
    }
  }
  let bannerUrl: string | null = null;
  if (seriesData.bannerS3Key) {
    bannerUrl = getAssetProxyUrl("series-banner", seriesData.id);
  }
  const eventBannerUrls = new Map<string, string>();
  for (const event of seriesData.events) {
    if (event.bannerS3Key) {
      eventBannerUrls.set(event.id, getAssetProxyUrl("event-banner", event.id));
    }
  }
  return (
    <SeriesDetailClient
      series={{ ...seriesData, events: seriesEvents }}
      allMedia={allMedia.map((m) => ({
        id: m.id,
        filename: m.filename,
        mimeType: m.mimeType,
        width: m.width,
        height: m.height,
        exifData: m.exifData as Record<string, unknown> | null,
        latitude: m.latitude,
        longitude: m.longitude,
        uploadedAt: m.uploadedAt,
        caption: m.caption,
        s3Url: m.s3Url,
        s3Key: m.s3Key,
        eventId: m.eventId,
        thumbnailS3Key: m.thumbnailS3Key,
        uploadedBy: toPublicUser(m.uploadedBy),
        likeCount: likeCountByMediaId.get(m.id) ?? 0,
      }))}
      photoCount={photoCount}
      videoCount={videoCount}
      bannerUrl={bannerUrl}
      eventBannerUrls={Object.fromEntries(eventBannerUrls)}
      eventMediaUrls={Object.fromEntries(eventMediaUrls)}
      canEdit={canEdit}
      currentUserId={session?.id}
      isAdmin={canEdit}
    />
  );
}
