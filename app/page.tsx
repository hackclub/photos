import { count, desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import LandingPage from "@/components/home/LandingPage";
import UserDashboard from "@/components/home/UserDashboard";
import { deleteSession, getSession, refreshUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventParticipants, events, media } from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    const { getOnboardingSession } = await import("@/lib/auth");
    const onboardingSession = await getOnboardingSession();
    if (onboardingSession) {
      redirect("/onboarding");
    }
    const recentEvents = await db.query.events.findMany({
      where: eq(events.visibility, "public"),
      limit: 10,
      orderBy: [desc(events.createdAt)],
      with: {
        series: true,
      },
    });
    const eventBannerUrls = new Map<string, string>();
    const eventStats = new Map<
      string,
      {
        mediaCount: number;
        participantCount: number;
      }
    >();
    await Promise.all(
      recentEvents.map(async (event) => {
        if (event.bannerS3Key) {
          eventBannerUrls.set(
            event.id,
            getAssetProxyUrl("event-banner", event.id),
          );
        }
        const [mediaCountResult] = await db
          .select({ value: count() })
          .from(media)
          .where(eq(media.eventId, event.id));
        const [participantCountResult] = await db
          .select({ value: count() })
          .from(eventParticipants)
          .where(eq(eventParticipants.eventId, event.id));
        eventStats.set(event.id, {
          mediaCount: mediaCountResult?.value ?? 0,
          participantCount: participantCountResult?.value ?? 0,
        });
      }),
    );
    const randomMedia = await db.query.media.findMany({
      limit: 50,
      orderBy: sql`RANDOM()`,
      with: {
        event: true,
      },
    });
    const heroImages = randomMedia
      .filter((m) => m.event.visibility === "public")
      .map((m) => {
        try {
          if (m.thumbnailS3Key) {
            return getMediaProxyUrl(m.id, "thumbnail");
          }
          return getMediaProxyUrl(m.id);
        } catch (_e) {
          return null;
        }
      });
    return (
      <LandingPage
        recentEvents={recentEvents}
        eventStats={eventStats}
        eventBannerUrls={eventBannerUrls}
        heroImages={heroImages.filter((url): url is string => !!url)}
      />
    );
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
  const userMedia = await db.query.media.findMany({
    where: eq(media.uploadedById, session.id),
  });
  const userPhotoCount = userMedia.length;
  const eventsJoinedCount = userParticipations.length;
  const eventBannerUrls = new Map<string, string>();
  const eventStats = new Map<
    string,
    {
      mediaCount: number;
      participantCount: number;
    }
  >();
  await Promise.all(
    userParticipations.map(async (participation) => {
      if (participation.event.bannerS3Key) {
        eventBannerUrls.set(
          participation.event.id,
          getAssetProxyUrl("event-banner", participation.event.id),
        );
      }
      const [mediaCountResult] = await db
        .select({ value: count() })
        .from(media)
        .where(eq(media.eventId, participation.event.id));
      const [participantCountResult] = await db
        .select({ value: count() })
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, participation.event.id));
      eventStats.set(participation.event.id, {
        mediaCount: mediaCountResult?.value ?? 0,
        participantCount: participantCountResult?.value ?? 0,
      });
    }),
  );
  const joinedEventIds = userParticipations.map((p) => p.eventId);
  let heroImages: string[] = [];
  if (joinedEventIds.length > 0) {
    const randomMedia = await db.query.media.findMany({
      where: (media, { inArray }) => inArray(media.eventId, joinedEventIds),
      limit: 20,
      orderBy: sql`RANDOM()`,
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
