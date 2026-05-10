import { count, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import LandingPage from "@/components/home/LandingPage";
import UserDashboard from "@/components/home/UserDashboard";
import { deleteSession, getSession, refreshUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventParticipants, media } from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
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
    const randomMedia = await db.query.media.findMany({
      where: (media, { inArray }) => inArray(media.eventId, joinedEventIds),
      limit: 20,
      orderBy: [desc(media.uploadedAt)],
    });
    const urls = randomMedia.map((m) => {
      try {
        if (m.thumbnailS3Key) {
          return getMediaProxyUrl(m.id, "thumbnail");
        }
        return getMediaProxyUrl(m.id);
      } catch (_e) {
        return null;
      }
    });
    heroImages = urls.filter((url): url is string => !!url);
  }
  return (
    <UserDashboard
      session={session}
      userParticipations={userParticipations}
      eventStats={eventStats}
      eventBannerUrls={eventBannerUrls}
      userPhotoCount={userPhotoCount}
      eventsJoinedCount={eventsJoinedCount}
      heroImages={heroImages}
    />
  );
}
