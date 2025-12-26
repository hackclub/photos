import { desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media, series } from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
import { can, getUserContext } from "@/lib/policy";
import SeriesDetailClient from "./SeriesDetailClient";
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const seriesData = await db.query.series.findFirst({
    where: eq(series.slug, slug),
  });
  if (!seriesData) {
    return {
      title: "Series Not Found",
    };
  }
  return {
    title: `${seriesData.name} | Hack Club Photos`,
    description: seriesData.description || `Photo series: ${seriesData.name}`,
    openGraph: {
      images: [`/api/og?type=series&id=${slug}`],
    },
    twitter: {
      card: "summary_large_image",
      images: [`/api/og?type=series&id=${slug}`],
    },
  };
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
  const eventIds = seriesData.events.map((e) => e.id);
  const allMedia =
    eventIds.length > 0
      ? await db.query.media.findMany({
          where: inArray(media.eventId, eventIds),
          with: {
            uploadedBy: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarS3Key: true,
                handle: true,
                slackId: true,
              },
            },
            likes: true,
          },
          orderBy: desc(media.uploadedAt),
        })
      : [];
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
      series={seriesData}
      allMedia={allMedia.map((m) => ({
        ...m,
        exifData: m.exifData as Record<string, unknown> | null,
        likeCount: m.likes.length,
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
