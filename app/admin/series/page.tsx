import { count, desc, eq, inArray, type SQL, sql, sum } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HiPlus } from "react-icons/hi2";
import { getCurrentUser } from "@/app/actions/users";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { db } from "@/lib/db";
import { events, media, series, seriesAdmins } from "@/lib/db/schema";
import { getUserContext } from "@/lib/policy";
import SeriesClient from "./SeriesClient";
export default async function ManageSeriesPage() {
  const userResult = await getCurrentUser();
  if (!userResult.success || !userResult.user) {
    redirect("/auth/signin?callbackUrl=/admin/series");
  }
  const ctx = await getUserContext(userResult.user.id);
  if (!ctx || ctx.isBanned) {
    redirect("/unauthorized");
  }
  const user = userResult.user;
  let whereClause: SQL | undefined;
  if (!ctx.isGlobalAdmin) {
    const seriesAdminSeries = await db
      .select({ id: seriesAdmins.seriesId })
      .from(seriesAdmins)
      .where(eq(seriesAdmins.userId, user.id));
    const seriesIds = seriesAdminSeries.map((s) => s.id);
    if (seriesIds.length === 0) {
      return (
        <>
          <AdminPageHeader
            title="Manage Series"
            description="Organize events into series collections"
          >
            <Link
              href="/admin/series/new"
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-sm"
            >
              <HiPlus className="w-5 h-5" />
              New Series
            </Link>
          </AdminPageHeader>
          <AdminPageContent>
            <SeriesClient series={[]} />
          </AdminPageContent>
        </>
      );
    }
    whereClause = inArray(series.id, seriesIds);
  }
  const seriesWithStats = await db
    .select({
      series: series,
      eventCount: count(events.id),
    })
    .from(series)
    .leftJoin(events, sql`${series.id} = ${events.seriesId}`)
    .where(whereClause)
    .groupBy(series.id)
    .orderBy(desc(series.createdAt));
  const { getAssetProxyUrl, getMediaProxyUrl } = await import("@/lib/media/s3");
  const seriesWithThumbnails = await Promise.all(
    seriesWithStats.map(async ({ series: s, eventCount }) => {
      let thumbnailUrl = null;
      let totalPhotos = 0;
      let totalSize = 0;
      if (s.bannerS3Key) {
        thumbnailUrl = getAssetProxyUrl("series-banner", s.id);
      }
      const seriesEvents = await db.query.events.findMany({
        where: (events, { eq }) => eq(events.seriesId, s.id),
      });
      if (seriesEvents.length > 0) {
        const mediaStatsResult = await db
          .select({
            count: count(media.id),
            size: sum(media.fileSize),
          })
          .from(media)
          .where(
            sql`${media.eventId} IN (${sql.join(
              seriesEvents.map((e) => sql`${e.id}`),
              sql`, `,
            )})`,
          )
          .execute();
        totalPhotos = mediaStatsResult[0]?.count || 0;
        totalSize = Number(mediaStatsResult[0]?.size || 0);
        if (!thumbnailUrl) {
          const firstPhoto = await db.query.media.findFirst({
            where: (media, { inArray }) =>
              inArray(
                media.eventId,
                seriesEvents.map((e) => e.id),
              ),
            orderBy: (media, { desc }) => [desc(media.uploadedAt)],
          });
          if (firstPhoto) {
            try {
              thumbnailUrl = getMediaProxyUrl(
                firstPhoto.id,
                firstPhoto.thumbnailS3Key ? "thumbnail" : "original",
              );
            } catch (error) {
              console.error("Error fetching thumbnail:", error);
            }
          }
        }
      }
      return {
        ...s,
        eventCount,
        totalPhotos,
        totalSize,
        thumbnailUrl,
      };
    }),
  );
  return (
    <>
      <AdminPageHeader
        title="Manage Series"
        description="Organize events into series collections"
      >
        <Link
          href="/admin/series/new"
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-sm"
        >
          <HiPlus className="w-5 h-5" />
          New Series
        </Link>
      </AdminPageHeader>
      <AdminPageContent>
        <SeriesClient series={seriesWithThumbnails} />
      </AdminPageContent>
    </>
  );
}
