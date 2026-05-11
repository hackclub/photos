import { and, count, eq, inArray } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  HiArrowLeft,
  HiCalendar,
  HiLockClosed,
  HiMapPin,
  HiPencilSquare,
  HiPhoto,
  HiUserPlus,
  HiVideoCamera,
} from "react-icons/hi2";
import DownloadAllButton from "@/components/events/DownloadAllButton";
import JoinEventButton from "@/components/events/JoinEventButton";
import LeaveEventButton from "@/components/events/LeaveEventButton";
import ParticipantsList from "@/components/events/ParticipantsList";
import BlurMeButton from "@/components/media/BlurMeButton";
import BlurMeGallery from "@/components/media/BlurMeGallery";
import UploadButton from "@/components/media/UploadButton";
import { getSession } from "@/lib/auth";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { eventParticipants, events, media, mediaLikes } from "@/lib/db/schema";
import { getAssetProxyUrl } from "@/lib/media/s3";
import { createOgMetadata } from "@/lib/metadata";
import { can, getUserContext } from "@/lib/policy";
import { toPublicUser } from "@/lib/user-display";
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
  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
  });
  if (!event) {
    return {
      title: "Event Not Found",
    };
  }
  const title = `${event.name} | Hack Club Photos`;
  const description = event.description || `Photos from ${event.name}`;
  if (photo) {
    const photoMedia = await db.query.media.findFirst({
      where: eq(media.id, photo),
    });
    if (photoMedia?.eventId === event.id) {
      const imagePath =
        photoMedia.mimeType === "image/heic" ||
        photoMedia.mimeType === "image/heif"
          ? `/media/${photoMedia.id}/display`
          : `/media/${photoMedia.id}`;
      return createOgMetadata({
        title: `${photoMedia.caption || photoMedia.filename} | ${event.name}`,
        description,
        path: `/events/${slug}?photo=${photo}`,
        imagePath: new URL(imagePath, APP_URL).toString(),
        imageAlt: photoMedia.caption || photoMedia.filename,
      });
    }
  }
  return createOgMetadata({
    title,
    description,
    path: `/events/${slug}`,
    imagePath: new URL(
      `/api/og/event/${encodeURIComponent(slug)}.png`,
      APP_URL,
    ).toString(),
    imageAlt: event.name,
  });
}
export default async function EventPage({
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
  const session = await getSession();
  const ctx = await getUserContext(session?.id);
  const { slug } = await params;
  const { photo: photoId } = await searchParams;
  const event = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      series: true,
      media: {
        with: {
          uploadedBy: {
            columns: {
              id: true,
              preferredName: true,
              handle: true,
              slackId: true,
            },
          },
          apiKey: true,
        },
        orderBy: (media, { desc }) => [desc(media.uploadedAt)],
      },
    },
  });
  if (!event) {
    notFound();
  }
  const canView = await can(ctx, "view", "event", event);
  if (!canView) {
    notFound();
  }
  let isParticipant = false;
  let participantCount = 0;
  let userPhotoCount = 0;
  let canEdit = false;
  if (session?.id) {
    canEdit = await can(ctx, "manage", "event", event);
    const participant = await db.query.eventParticipants.findFirst({
      where: (eventParticipants, { and, eq }) =>
        and(
          eq(eventParticipants.userId, session.id),
          eq(eventParticipants.eventId, event.id),
        ),
    });
    isParticipant = !!participant;
    const [userPhotos] = await db
      .select({ count: count() })
      .from(media)
      .where(
        and(eq(media.eventId, event.id), eq(media.uploadedById, session.id)),
      );
    userPhotoCount = userPhotos?.count ?? 0;
  }
  const participants = await db.query.eventParticipants.findMany({
    where: eq(eventParticipants.eventId, event.id),
    with: {
      user: {
        columns: {
          id: true,
          preferredName: true,
          handle: true,
          slackId: true,
        },
      },
    },
  });
  participantCount = participants.length;
  const visibleEventMedia =
    event.media?.filter((m) => m.blurStatus !== "pending") || [];
  const photoCount =
    visibleEventMedia.filter((m) => m.mimeType.startsWith("image/")).length ||
    0;
  const videoCount =
    visibleEventMedia.filter((m) => m.mimeType.startsWith("video/")).length ||
    0;
  const likeCounts =
    visibleEventMedia.length > 0
      ? await db
          .select({ mediaId: mediaLikes.mediaId, count: count() })
          .from(mediaLikes)
          .where(
            inArray(
              mediaLikes.mediaId,
              visibleEventMedia.map((m) => m.id),
            ),
          )
          .groupBy(mediaLikes.mediaId)
      : [];
  const likeCountByMediaId = new Map(
    likeCounts.map((item) => [item.mediaId, item.count]),
  );
  let bannerUrl: string | null = null;
  if (event.bannerS3Key) {
    bannerUrl = getAssetProxyUrl("event-banner", event.id);
  }
  let mediaWithPermissions = visibleEventMedia;
  if (session?.id && visibleEventMedia.length > 0) {
    const { filterDeletableMedia } = await import("@/lib/policy");
    const deletableMedia = await filterDeletableMedia(
      session.id,
      visibleEventMedia,
    );
    const deletableIds = new Set(deletableMedia.map((m) => m.id));
    mediaWithPermissions = visibleEventMedia.map((m) => ({
      ...m,
      canDelete: deletableIds.has(m.id),
    }));
  }
  return (
    <div className="min-h-screen">
      <div className="relative">
        {bannerUrl ? (
          <div className="absolute inset-0 w-full h-full">
            <Image
              src={bannerUrl}
              alt={event.name}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-linear-to-t from-black via-black/60 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full bg-linear-to-brrom-zinc-900 via-zinc-800 to-zinc-900" />
        )}

        <div className="relative">
          <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-6 sm:pb-8">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <Link
                prefetch={false}
                href="/events"
                className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors"
              >
                <HiArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Back to Events</span>
                <span className="sm:hidden">Back</span>
              </Link>

              {event.series && (
                <Link
                  prefetch={false}
                  href={`/series/${event.series.slug}`}
                  className="inline-block"
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/20 backdrop-blur-sm border border-red-600/30 rounded-lg text-red-400 hover:bg-red-700/30 transition-all">
                    <span className="text-sm font-medium">
                      {event.series.name}
                    </span>
                  </div>
                </Link>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 max-w-4xl">
              {event.name}
            </h1>

            {event.description && (
              <p className="text-base sm:text-lg md:text-xl text-zinc-300 mb-4 sm:mb-6 max-w-3xl">
                {event.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 sm:gap-6 mb-4 sm:mb-6">
              {event.eventDate && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <HiCalendar className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span className="font-medium text-xs sm:text-sm">
                    {new Date(event.eventDate).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )}

              {(event.locationCity ||
                event.locationCountry ||
                event.location ||
                (event.latitude && event.longitude)) && (
                <Link
                  prefetch={false}
                  href="/map"
                  className="flex items-center gap-2 text-zinc-300 hover:text-white transition-colors"
                >
                  <HiMapPin className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span className="font-medium text-xs sm:text-sm">
                    {event.locationCity && event.locationCountry
                      ? `${event.locationCity}, ${event.locationCountry}`
                      : event.location ||
                        `${event.locationCity || ""}${event.locationCountry || ""}`}
                  </span>
                </Link>
              )}

              <ParticipantsList
                participants={participants.map((p) => ({
                  ...p,
                  user: toPublicUser(p.user),
                  joinedAt: p.joinedAt.toISOString(),
                }))}
                count={participantCount}
              />

              {event.visibility === "unlisted" && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 backdrop-blur-sm border border-zinc-700 rounded-lg text-zinc-400">
                  <HiLockClosed className="w-5 h-5" />
                  <span className="text-sm">Unlisted</span>
                </div>
              )}
            </div>

            {session ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                {canEdit && (
                  <Link
                    prefetch={false}
                    href={`/admin/events/${event.id}/edit`}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-lg transition-all border border-zinc-700"
                  >
                    <HiPencilSquare className="w-5 h-5" />
                    <span>Edit Event</span>
                  </Link>
                )}
                <BlurMeButton />
                {!isParticipant && (
                  <JoinEventButton
                    eventId={event.id}
                    requiresInvite={event.requiresInvite}
                  />
                )}
                {isParticipant && (
                  <>
                    <UploadButton eventId={event.id} />
                    <LeaveEventButton
                      eventId={event.id}
                      photoCount={userPhotoCount}
                    />
                  </>
                )}
              </div>
            ) : (
              <Link
                prefetch={false}
                href="/auth/signin"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-lg w-full sm:w-auto"
              >
                <HiUserPlus className="w-5 h-5" />
                Sign In to Join Event
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-800 bg-zinc-900">
        <div className="px-4 sm:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-4 sm:gap-8">
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                {photoCount}
              </span>
              <div className="flex items-center gap-2 text-zinc-500">
                <HiPhoto className="w-5 h-5" />
                <span className="text-xs sm:text-sm font-medium uppercase tracking-wider">
                  Photos
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                {videoCount}
              </span>
              <div className="flex items-center gap-2 text-zinc-500">
                <HiVideoCamera className="w-5 h-5" />
                <span className="text-xs sm:text-sm font-medium uppercase tracking-wider">
                  Videos
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-8 sm:py-12">
        {visibleEventMedia.length > 0 ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Gallery
              </h2>
              <DownloadAllButton
                eventId={event.id}
                eventName={event.name}
                mediaCount={visibleEventMedia.length}
                isAdmin={canEdit}
              />
            </div>
            <BlurMeGallery
              media={mediaWithPermissions.map((m) => ({
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
                canDelete: (m as any).canDelete,
                s3Url: m.s3Url,
                s3Key: m.s3Key,
                thumbnailS3Key: m.thumbnailS3Key,
                uploadedBy: toPublicUser(m.uploadedBy),
                likeCount: likeCountByMediaId.get(m.id) ?? 0,
              }))}
              currentUserId={session?.id}
              eventId={event.id}
              isAdmin={canEdit}
              initialPhotoId={photoId}
            />
          </div>
        ) : (
          <div className="text-center py-24 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
              <HiPhoto className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-2xl font-semibold text-white mb-3">
              No photos yet
            </h3>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              {isParticipant
                ? "Be the first to upload photos from this event!"
                : "Join the event to start uploading photos."}
            </p>
            {isParticipant && <UploadButton eventId={event.id} />}
          </div>
        )}
      </div>
    </div>
  );
}
