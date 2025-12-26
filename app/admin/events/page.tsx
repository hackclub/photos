import { count, desc, eq, inArray, or, type SQL, sql, sum } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HiPlus } from "react-icons/hi2";
import { getCurrentUser } from "@/app/actions/users";
import {
  AdminPageContent,
  AdminPageHeader,
} from "@/components/ui/AdminPageLayout";
import { db } from "@/lib/db";
import { eventAdmins, events, media, seriesAdmins } from "@/lib/db/schema";
import { getUserContext } from "@/lib/policy";
import EventsClient from "./EventsClient";
export default async function ManageEventsPage() {
  const userResult = await getCurrentUser();
  if (!userResult.success || !userResult.user) {
    redirect("/auth/signin?callbackUrl=/admin/events");
  }
  const ctx = await getUserContext(userResult.user.id);
  if (!ctx || ctx.isBanned) {
    redirect("/unauthorized");
  }
  const user = userResult.user;
  let whereClause: SQL | undefined;
  if (!ctx.isGlobalAdmin) {
    const directAdminEvents = await db
      .select({ id: eventAdmins.eventId })
      .from(eventAdmins)
      .where(eq(eventAdmins.userId, user.id));
    const directEventIds = directAdminEvents.map((e) => e.id);
    const seriesAdminSeries = await db
      .select({ id: seriesAdmins.seriesId })
      .from(seriesAdmins)
      .where(eq(seriesAdmins.userId, user.id));
    const seriesIds = seriesAdminSeries.map((s) => s.id);
    const conditions = [];
    if (directEventIds.length > 0) {
      conditions.push(inArray(events.id, directEventIds));
    }
    if (seriesIds.length > 0) {
      conditions.push(inArray(events.seriesId, seriesIds));
    }
    if (conditions.length === 0) {
      return (
        <>
          <AdminPageHeader
            title="Manage Events"
            description="Create and manage photo events"
          >
            <Link
              href="/admin/events/new"
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-sm"
            >
              <HiPlus className="w-5 h-5" />
              New Event
            </Link>
          </AdminPageHeader>
          <AdminPageContent>
            <EventsClient events={[]} />
          </AdminPageContent>
        </>
      );
    }
    whereClause = or(...conditions);
  }
  const eventsWithStats = await db
    .select({
      event: events,
      mediaCount: count(media.id),
      totalSize: sum(media.fileSize),
    })
    .from(events)
    .leftJoin(media, sql`${events.id} = ${media.eventId}`)
    .where(whereClause)
    .groupBy(events.id)
    .orderBy(desc(events.createdAt));
  const { getAssetProxyUrl, getMediaProxyUrl } = await import("@/lib/media/s3");
  const eventsWithThumbnails = await Promise.all(
    eventsWithStats.map(async ({ event, mediaCount, totalSize }) => {
      let thumbnailUrl = null;
      if (event.bannerS3Key) {
        thumbnailUrl = getAssetProxyUrl("event-banner", event.id);
      }
      if (!thumbnailUrl) {
        const firstPhoto = await db.query.media.findFirst({
          where: (media, { eq }) => eq(media.eventId, event.id),
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
      return {
        ...event,
        mediaCount,
        totalSize: Number(totalSize || 0),
        thumbnailUrl,
      };
    }),
  );
  return (
    <>
      <AdminPageHeader
        title="Manage Events"
        description="Create and manage photo events"
      >
        <Link
          href="/admin/events/new"
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors text-sm"
        >
          <HiPlus className="w-5 h-5" />
          New Event
        </Link>
      </AdminPageHeader>
      <AdminPageContent>
        <EventsClient events={eventsWithThumbnails} />
      </AdminPageContent>
    </>
  );
}
