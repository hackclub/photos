import { count, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import LandingPage from "@/components/home/LandingPage";
import UserDashboard from "@/components/home/UserDashboard";
import { deleteSession, getSession, refreshUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventAdmins,
  eventParticipants,
  media,
  seriesAdmins,
} from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
import { getRandomMediaIds } from "@/app/actions/signage";
export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    const { getOnboardingSession } = await import("@/lib/auth");
    const onboardingSession = await getOnboardingSession();
    if (onboardingSession) {
      redirect("/onboarding");
    }
    return <LandingPage />;
  }
  const refreshedUser = await refreshUser(session.id);
  if (refreshedUser?.isBanned) {
    await deleteSession();
    redirect("/banned");
  }
  const userParticipations = await db.query.eventParticipants.findMany({
    where: eq(eventParticipants.userId, session.id),
    with: {
      event: {
        with: {
          series: true,
        },
      },
    },
    orderBy: [desc(eventParticipants.joinedAt)],
    limit: 6,
  });
  const [userMediaCount] = await db
    .select({ value: count() })
    .from(media)
    .where(eq(media.uploadedById, session.id));
  const userPhotoCount = userMediaCount?.value ?? 0;
  const eventsJoinedCount = userParticipations.length;
  const eventBannerUrls = new Map<string, string>();
  const eventStats = new Map<
    string,
    {
      mediaCount: number;
      participantCount: number;
    }
  >();
  const participationEventIds = userParticipations.map((item) => item.event.id);
  const adminEventIds = new Set<string>();
  if (session.isGlobalAdmin) {
    for (const id of participationEventIds) {
      adminEventIds.add(id);
    }
  } else if (participationEventIds.length > 0) {
    const [directAdminEvents, seriesAdminRows] = await Promise.all([
      db
        .select({ eventId: eventAdmins.eventId })
        .from(eventAdmins)
        .where(inArray(eventAdmins.eventId, participationEventIds)),
      db
        .select({ seriesId: seriesAdmins.seriesId })
        .from(seriesAdmins)
        .where(eq(seriesAdmins.userId, session.id)),
    ]);
    for (const admin of directAdminEvents) {
      adminEventIds.add(admin.eventId);
    }
    const adminSeriesIds = new Set(seriesAdminRows.map((row) => row.seriesId));
    for (const participation of userParticipations) {
      if (
        participation.event.seriesId &&
        adminSeriesIds.has(participation.event.seriesId)
      ) {
        adminEventIds.add(participation.event.id);
      }
    }
  }
  for (const participation of userParticipations) {
    if (participation.event.bannerS3Key) {
      eventBannerUrls.set(
        participation.event.id,
        getAssetProxyUrl("event-banner", participation.event.id),
      );
    }
  }
  if (participationEventIds.length > 0) {
    const [mediaCounts, participantCounts] = await Promise.all([
      db
        .select({ eventId: media.eventId, value: count() })
        .from(media)
        .where(inArray(media.eventId, participationEventIds))
        .groupBy(media.eventId),
      db
        .select({ eventId: eventParticipants.eventId, value: count() })
        .from(eventParticipants)
        .where(inArray(eventParticipants.eventId, participationEventIds))
        .groupBy(eventParticipants.eventId),
    ]);
    const mediaCountMap = new Map(
      mediaCounts.map((item) => [item.eventId, item.value]),
    );
    const participantCountMap = new Map(
      participantCounts.map((item) => [item.eventId, item.value]),
    );
    for (const id of participationEventIds) {
      eventStats.set(id, {
        mediaCount: mediaCountMap.get(id) ?? 0,
        participantCount: participantCountMap.get(id) ?? 0,
      });
    }
  }
  const joinedEventIds = userParticipations.map((p) => p.eventId);
  let heroImages: string[] = [];
  if (joinedEventIds.length > 0) {
    const randomMediaIds = await getRandomMediaIds(20);
    if (randomMediaIds.success) {
      heroImages = randomMediaIds.ids.map((id) => getMediaProxyUrl(id, "thumbnail"));
    }
  }
  return (
    <UserDashboard
      session={session}
      userParticipations={userParticipations}
      adminEventIds={adminEventIds}
      eventStats={eventStats}
      eventBannerUrls={eventBannerUrls}
      userPhotoCount={userPhotoCount}
      eventsJoinedCount={eventsJoinedCount}
      heroImages={heroImages}
    />
  );
}
