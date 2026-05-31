import { initTRPC, TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { joinEvent, leaveEvent } from "@/app/actions/events";
import { getMapData } from "@/app/actions/map";
import { deleteMedia, updateMediaCaption } from "@/app/actions/media";
import {
  addMention,
  getMediaMentions,
  removeMention,
} from "@/app/actions/mentions";
import { createReport } from "@/app/actions/reports";
import { globalSearch } from "@/app/actions/search";
import { createShareLink } from "@/app/actions/sharing";
import { getRandomMediaIds } from "@/app/actions/signage";
import {
  createComment,
  deleteComment,
  getMediaComments,
  getMediaLikes,
  toggleCommentLike,
  toggleMediaLike,
} from "@/app/actions/social";
import {
  addTag,
  getMediaTags,
  removeTag,
  searchByTag,
} from "@/app/actions/tags";
import { finalizeUpload, getPresignedUrl } from "@/app/actions/upload";
import { searchUsers } from "@/app/actions/users";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventParticipants, media, mediaLikes } from "@/lib/db/schema";
import { getAssetProxyUrl, getMediaProxyUrl } from "@/lib/media/s3";
import {
  augmentMediaWithPermissions,
  can,
  getAccessibleEventIdsForUser,
  getUserContext,
} from "@/lib/policy";
import { getSlackAvatarUrl, toPublicUser } from "@/lib/user-display";

export async function createTRPCContext() {
  let token: string | null = null;
  const { headers } = await import("next/headers");
  const authHeader = (await headers()).get("Authorization");
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
  const session = await getSession();
  return { session, token };
}

type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create();

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const appRouter = t.router({
  auth: t.router({
    me: t.procedure.query(({ ctx }) =>
      ctx.session
        ? { ...ctx.session, avatarUrl: getSlackAvatarUrl(ctx.session.slackId) }
        : null,
    ),
  }),
  mobile: t.router({
    bootstrap: t.procedure.query(async ({ ctx }) => {
      const userContext = await getUserContext(ctx.session?.id);
      return {
        user: ctx.session,
        hasAdminAccess: Boolean(
          userContext?.isGlobalAdmin ||
            userContext?.eventAdmins.length ||
            userContext?.seriesAdmins.length,
        ),
        navigation: [
          { key: "home", label: "Home", path: "/", authRequired: false },
          { key: "feed", label: "Feed", path: "/feed", authRequired: false },
          {
            key: "events",
            label: "Events",
            path: "/events",
            authRequired: false,
          },
          {
            key: "series",
            label: "Series",
            path: "/series",
            authRequired: false,
          },
          { key: "map", label: "Map", path: "/map", authRequired: false },
          { key: "tags", label: "Tags", path: "/tags", authRequired: false },
        ],
      };
    }),
    homeSummary: protectedProcedure.query(async ({ ctx }) => {
      const userContext = await getUserContext(ctx.session.id);
      if (userContext?.isBanned) throw new TRPCError({ code: "FORBIDDEN" });
      const participations = await db.query.eventParticipants.findMany({
        where: (participants, { eq }) =>
          eq(participants.userId, ctx.session.id),
        with: {
          event: {
            with: { series: true },
          },
        },
        orderBy: (participants, { desc }) => [desc(participants.joinedAt)],
        limit: 6,
      });
      const [userMediaCount] = await db
        .select({ value: count() })
        .from(media)
        .where(eq(media.uploadedById, ctx.session.id));
      const eventIds = participations.map(
        (participation) => participation.event.id,
      );
      const [mediaCounts, participantCounts] = eventIds.length
        ? await Promise.all([
            db
              .select({ eventId: media.eventId, value: count() })
              .from(media)
              .where(inArray(media.eventId, eventIds))
              .groupBy(media.eventId),
            db
              .select({ eventId: eventParticipants.eventId, value: count() })
              .from(eventParticipants)
              .where(inArray(eventParticipants.eventId, eventIds))
              .groupBy(eventParticipants.eventId),
          ])
        : [[], []];
      const mediaCountByEventId = new Map(
        mediaCounts.map((item) => [item.eventId, item.value]),
      );
      const participantCountByEventId = new Map(
        participantCounts.map((item) => [item.eventId, item.value]),
      );
      const randomMedia = eventIds.length
        ? await getRandomMediaIds(20)
        : { success: true as const, ids: [] as string[] };
      return {
        user: ctx.session,
        userPhotoCount: userMediaCount?.value ?? 0,
        joinedEvents: participations.map((participation) => ({
          id: participation.event.id,
          name: participation.event.name,
          slug: participation.event.slug,
          description: participation.event.description,
          eventDate: participation.event.eventDate,
          location: participation.event.location,
          locationCity: participation.event.locationCity,
          visibility: participation.event.visibility,
          bannerUrl: participation.event.bannerS3Key
            ? getAssetProxyUrl("event-banner", participation.event.id)
            : null,
          firstMediaUrl: null,
          mediaCount: mediaCountByEventId.get(participation.event.id) ?? 0,
          participantCount:
            participantCountByEventId.get(participation.event.id) ?? 0,
          series: participation.event.series
            ? {
                id: participation.event.series.id,
                name: participation.event.series.name,
                slug: participation.event.series.slug,
              }
            : null,
        })),
        joinedEventCount: participations.length,
        heroImages: (randomMedia.ids ?? []).map((id) =>
          getMediaProxyUrl(id, "thumbnail"),
        ),
      };
    }),
    events: t.procedure.query(async ({ ctx }) => {
      const accessibleIds = await getAccessibleEventIdsForUser(ctx.session?.id);
      if (accessibleIds.length === 0) return [];
      const eventRows = await db.query.events.findMany({
        where: (events, { inArray }) => inArray(events.id, accessibleIds),
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
          createdAt: true,
        },
        with: {
          media: {
            columns: { id: true },
            orderBy: (media, { desc }) => [desc(media.uploadedAt)],
            limit: 1,
          },
        },
        orderBy: (events, { desc }) => [desc(events.createdAt)],
        limit: 100,
      });
      const mediaCounts = await db
        .select({ eventId: media.eventId, count: count() })
        .from(media)
        .where(
          inArray(
            media.eventId,
            eventRows.map((event) => event.id),
          ),
        )
        .groupBy(media.eventId);
      const mediaCountByEventId = new Map(
        mediaCounts.map((item) => [item.eventId, item.count]),
      );
      return eventRows
        .sort((a, b) => {
          const aPhotos = mediaCountByEventId.get(a.id) ?? 0;
          const bPhotos = mediaCountByEventId.get(b.id) ?? 0;
          if (aPhotos === 0 && bPhotos > 0) return 1;
          if (bPhotos === 0 && aPhotos > 0) return -1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        })
        .map((event) => ({
          id: event.id,
          name: event.name,
          slug: event.slug,
          description: event.description,
          eventDate: event.eventDate,
          location: event.location,
          locationCity: event.locationCity,
          visibility: event.visibility,
          bannerUrl: event.bannerS3Key
            ? getAssetProxyUrl("event-banner", event.id)
            : null,
          firstMediaUrl: event.media[0]
            ? getMediaProxyUrl(event.media[0].id, "thumbnail")
            : null,
          mediaCount: mediaCountByEventId.get(event.id) ?? 0,
        }));
    }),
    eventBySlug: protectedProcedure
      .input(z.object({ slug: z.string().min(1).max(160) }))
      .query(async ({ ctx, input }) => {
        const userContext = await getUserContext(ctx.session.id);
        const event = await db.query.events.findFirst({
          where: (events, { eq }) => eq(events.slug, input.slug),
          with: {
            series: true,
            media: {
              with: {
                uploadedBy: {
                  columns: {
                    id: true,
                    handle: true,
                    preferredName: true,
                    slackId: true,
                  },
                },
              },
              orderBy: (media, { desc }) => [desc(media.uploadedAt)],
            },
          },
        });
        if (!event) throw new TRPCError({ code: "NOT_FOUND" });
        if (!(await can(userContext, "view", "event", event))) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const [participantCountRow] = await db
          .select({ value: count() })
          .from(eventParticipants)
          .where(eq(eventParticipants.eventId, event.id));
        const participant = await db.query.eventParticipants.findFirst({
          where: and(
            eq(eventParticipants.eventId, event.id),
            eq(eventParticipants.userId, ctx.session.id),
          ),
        });
        const likeRows = event.media.length
          ? await db
              .select({ mediaId: mediaLikes.mediaId, value: count() })
              .from(mediaLikes)
              .where(
                inArray(
                  mediaLikes.mediaId,
                  event.media.map((item) => item.id),
                ),
              )
              .groupBy(mediaLikes.mediaId)
          : [];
        const likeCountByMediaId = new Map(
          likeRows.map((row) => [row.mediaId, row.value]),
        );
        const mediaWithPermissions = await augmentMediaWithPermissions(
          ctx.session.id,
          event.media.filter((item) => item.blurStatus !== "pending"),
        );
        const canManage = await can(userContext, "manage", "event", event);
        return {
          event: {
            id: event.id,
            name: event.name,
            slug: event.slug,
            description: event.description,
            location: event.location,
            locationCity: event.locationCity,
            eventDate: event.eventDate,
            bannerUrl: event.bannerS3Key
              ? getAssetProxyUrl("event-banner", event.id)
              : null,
            series: event.series
              ? {
                  id: event.series.id,
                  name: event.series.name,
                  slug: event.series.slug,
                }
              : null,
          },
          isParticipant: Boolean(participant),
          canManage,
          participantCount: participantCountRow?.value ?? 0,
          media: mediaWithPermissions.map((item) => ({
            id: item.id,
            filename: item.filename,
            mimeType: item.mimeType,
            width: item.width,
            height: item.height,
            caption: item.caption,
            uploadedAt: item.uploadedAt,
            url: getMediaProxyUrl(item.id),
            thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
            likeCount: likeCountByMediaId.get(item.id) ?? 0,
            canDelete: item.canDelete,
            uploadedBy: toPublicUser(item.uploadedBy),
          })),
        };
      }),
    seriesBySlug: protectedProcedure
      .input(z.object({ slug: z.string().min(1).max(160) }))
      .query(async ({ ctx, input }) => {
        const userContext = await getUserContext(ctx.session.id);
        const seriesData = await db.query.series.findFirst({
          where: (series, { eq }) => eq(series.slug, input.slug),
          with: {
            events: {
              orderBy: (events, { desc }) => [desc(events.createdAt)],
            },
          },
        });
        if (!seriesData) throw new TRPCError({ code: "NOT_FOUND" });
        if (!(await can(userContext, "view", "series", seriesData))) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const eventIds = seriesData.events.map((event) => event.id);
        const allMedia = eventIds.length
          ? await db.query.media.findMany({
              where: inArray(media.eventId, eventIds),
              with: {
                uploadedBy: {
                  columns: {
                    id: true,
                    handle: true,
                    preferredName: true,
                    slackId: true,
                  },
                },
              },
              orderBy: desc(media.uploadedAt),
            })
          : [];
        const likeRows = allMedia.length
          ? await db
              .select({ mediaId: mediaLikes.mediaId, value: count() })
              .from(mediaLikes)
              .where(
                inArray(
                  mediaLikes.mediaId,
                  allMedia.map((item) => item.id),
                ),
              )
              .groupBy(mediaLikes.mediaId)
          : [];
        const likeCountByMediaId = new Map(
          likeRows.map((row) => [row.mediaId, row.value]),
        );
        const eventCounts = new Map<string, number>();
        for (const item of allMedia) {
          eventCounts.set(
            item.eventId,
            (eventCounts.get(item.eventId) ?? 0) + 1,
          );
        }
        const mediaByEvent = new Map<string, (typeof allMedia)[number]>();
        for (const item of allMedia) {
          if (!mediaByEvent.has(item.eventId))
            mediaByEvent.set(item.eventId, item);
        }
        const mediaWithPermissions = await augmentMediaWithPermissions(
          ctx.session.id,
          allMedia.filter((item) => item.blurStatus !== "pending"),
        );
        const photoCount = mediaWithPermissions.filter((item) =>
          item.mimeType.startsWith("image/"),
        ).length;
        const videoCount = mediaWithPermissions.filter((item) =>
          item.mimeType.startsWith("video/"),
        ).length;
        return {
          series: {
            id: seriesData.id,
            name: seriesData.name,
            slug: seriesData.slug,
            description: seriesData.description,
            visibility: seriesData.visibility,
            bannerUrl: seriesData.bannerS3Key
              ? getAssetProxyUrl("series-banner", seriesData.id)
              : null,
          },
          photoCount,
          videoCount,
          events: seriesData.events.map((event) => {
            const firstMedia = mediaByEvent.get(event.id);
            return {
              id: event.id,
              name: event.name,
              slug: event.slug,
              description: event.description,
              eventDate: event.eventDate,
              location: event.location,
              locationCity: event.locationCity,
              visibility: event.visibility,
              bannerUrl: event.bannerS3Key
                ? getAssetProxyUrl("event-banner", event.id)
                : null,
              firstMediaUrl: firstMedia
                ? getMediaProxyUrl(firstMedia.id, "thumbnail")
                : null,
              mediaCount: eventCounts.get(event.id) ?? 0,
            };
          }),
          media: mediaWithPermissions.map((item) => ({
            id: item.id,
            filename: item.filename,
            mimeType: item.mimeType,
            width: item.width,
            height: item.height,
            caption: item.caption,
            exifData: item.exifData,
            latitude: item.latitude,
            longitude: item.longitude,
            uploadedAt: item.uploadedAt,
            url: getMediaProxyUrl(item.id),
            thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
            likeCount: likeCountByMediaId.get(item.id) ?? 0,
            canDelete: item.canDelete,
            uploadedBy: toPublicUser(item.uploadedBy),
          })),
        };
      }),
    search: t.procedure
      .input(z.object({ query: z.string().min(0).max(120) }))
      .query(async ({ input }) => {
        const result = await globalSearch(input.query);
        if (!result.success || !result.results) return result;
        return {
          success: true,
          results: {
            users: result.results.users,
            tags: result.results.tags,
            events: result.results.events.map((event) => ({
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
            })),
            series: result.results.series.map((item) => ({
              id: item.id,
              name: item.name,
              slug: item.slug,
              description: item.description,
              bannerUrl: item.bannerS3Key
                ? getAssetProxyUrl("series-banner", item.id)
                : null,
            })),
            media: result.results.media.map((item) => ({
              id: item.id,
              filename: item.filename,
              caption: item.caption,
              mimeType: item.mimeType,
              exifData: item.exifData,
              latitude: item.latitude,
              longitude: item.longitude,
              thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
              event: item.event
                ? {
                    id: item.event.id,
                    name: item.event.name,
                    slug: item.event.slug,
                  }
                : null,
              uploadedBy: item.uploadedBy,
            })),
          },
        };
      }),
    webSession: protectedProcedure.query(() => ({ ok: true })),
    mapData: protectedProcedure.query(async () => {
      const result = await getMapData();
      if (!result.success || !result.data) return result;
      return {
        success: true,
        data: {
          photos: result.data.photos.map((photo) => ({
            id: photo.id,
            filename: photo.filename,
            mimeType: photo.mimeType,
            lat: photo.lat,
            lng: photo.lng,
            thumbnailUrl: getMediaProxyUrl(photo.id, "thumbnail"),
            event: photo.event,
          })),
          events: result.data.events.map((event) => ({
            id: event.id,
            name: event.name,
            slug: event.slug,
            city: event.city,
            country: event.country,
            lat: event.lat,
            lng: event.lng,
            photoCount: event.photos?.length ?? 0,
            thumbnailUrl: event.photos?.[0]
              ? getMediaProxyUrl(event.photos[0].id, "thumbnail")
              : null,
          })),
        },
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
