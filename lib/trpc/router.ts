import { initTRPC, TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  cancelDataExport,
  deleteExport,
  getLatestExport,
  requestDataExport,
} from "@/app/actions/data-export";
import { joinEvent, leaveEvent } from "@/app/actions/events";
import { getGlobalFeed } from "@/app/actions/feed";
import { getMapData } from "@/app/actions/map";
import { deleteMedia, updateMediaCaption } from "@/app/actions/media";
import {
  addMention,
  getMediaMentions,
  removeMention,
} from "@/app/actions/mentions";
import {
  checkHandleAvailability,
  completeOnboarding,
} from "@/app/actions/onboarding";
import {
  deleteAllFaceData,
  getPrivacyOverview,
  updatePrivacyPreferences,
} from "@/app/actions/privacy";
import { createReport } from "@/app/actions/reports";
import { globalSearch } from "@/app/actions/search";
import { createShareLink, getSharedMedia } from "@/app/actions/sharing";
import { getRandomMediaIds } from "@/app/actions/signage";
import {
  createComment,
  deleteComment,
  getMediaComments,
  toggleCommentLike,
  toggleMediaLike,
} from "@/app/actions/social";
import { addTag, getMediaTags, removeTag } from "@/app/actions/tags";
import { finalizeUpload, getPresignedUrl } from "@/app/actions/upload";
import {
  deleteAccount,
  searchUsers,
  updateUserProfile,
} from "@/app/actions/users";
import { getSession } from "@/lib/auth";
import { APP_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  eventParticipants,
  facePrivacyPreferences,
  media,
  mediaComments,
  mediaLikes,
  mediaMentions,
  series,
  users,
} from "@/lib/db/schema";
import {
  getAssetProxyUrl,
  getMediaProxyUrl,
  getSignedDownloadUrl,
} from "@/lib/media/s3";
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
const MAX_MOBILE_MEDIA_RESULTS = 500;

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
              limit: MAX_MOBILE_MEDIA_RESULTS,
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
            requiresInvite: Boolean(event.inviteCode),
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
            exifData: item.exifData,
            latitude: item.latitude,
            longitude: item.longitude,
            takenAt: item.takenAt,
            uploadedAt: item.uploadedAt,
            url: getMediaProxyUrl(item.id),
            thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
            likeCount: likeCountByMediaId.get(item.id) ?? 0,
            canDelete: item.canDelete,
            uploadedBy: toPublicUser(item.uploadedBy),
          })),
        };
      }),
    series: t.procedure.query(async ({ ctx }) => {
      const accessibleIds = await getAccessibleEventIdsForUser(ctx.session?.id);
      const allSeries = await db.query.series.findMany({
        orderBy: desc(series.createdAt),
        with: { events: true },
      });
      const accessibleEventSet = new Set(accessibleIds);
      const visible = allSeries.filter(
        (s) =>
          s.visibility === "public" ||
          s.visibility === "auth_required" ||
          s.events.some((e) => accessibleEventSet.has(e.id)),
      );
      const result = await Promise.all(
        visible.map(async (s) => {
          const eventIds = s.events.map((e) => e.id);
          const [mediaCount] = eventIds.length
            ? await db
                .select({ value: count() })
                .from(media)
                .where(inArray(media.eventId, eventIds))
            : [{ value: 0 }];
          const firstMedia = eventIds.length
            ? await db.query.media.findFirst({
                where: inArray(media.eventId, eventIds),
                orderBy: desc(media.uploadedAt),
                columns: { id: true },
              })
            : null;
          return {
            id: s.id,
            name: s.name,
            slug: s.slug,
            description: s.description,
            visibility: s.visibility,
            bannerUrl: s.bannerS3Key
              ? getAssetProxyUrl("series-banner", s.id)
              : null,
            firstMediaUrl: firstMedia
              ? getMediaProxyUrl(firstMedia.id, "thumbnail")
              : null,
            eventCount: s.events.length,
            mediaCount: mediaCount?.value ?? 0,
          };
        }),
      );
      return result;
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
              limit: MAX_MOBILE_MEDIA_RESULTS,
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
    feed: t.router({
      page: protectedProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(100).optional(),
            cursor: z.number().min(0).optional(),
          }),
        )
        .query(async ({ input }) => {
          const limit = input.limit ?? 50;
          const offset = input.cursor ?? 0;
          const res = await getGlobalFeed(limit, offset);
          if (!res.success || !res.items) return { items: [] };
          return {
            items: res.items
              .filter((item) => item.media)
              .map((item) => ({
                id: item.id,
                type: item.type,
                timestamp: item.timestamp,
                media: {
                  id: item.media!.id,
                  filename: item.media!.filename,
                  mimeType: item.media!.mimeType,
                  width: item.media!.width,
                  height: item.media!.height,
                  uploadedAt: item.media!.uploadedAt,
                  likeCount: item.media!.likeCount,
                  commentCount: item.media!.commentCount,
                  thumbnailUrl: getMediaProxyUrl(item.media!.id, "thumbnail"),
                  url: getMediaProxyUrl(item.media!.id),
                },
                event: item.event?.id
                  ? {
                      id: item.event.id,
                      name: item.event.name ?? "",
                      slug: item.event.slug ?? "",
                    }
                  : null,
                user: item.user
                  ? {
                      id: item.user.id ?? "",
                      name: item.user.name ?? "",
                      handle: item.user.handle ?? null,
                      avatarUrl: item.user.avatarUrl,
                    }
                  : null,
              })),
            nextCursor: res.items.length === limit ? offset + limit : undefined,
          };
        }),
    }),
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
            photoCount: event.photoCount ?? event.photos?.length ?? 0,
            thumbnailUrl: event.photos?.[0]
              ? getMediaProxyUrl(event.photos[0].id, "thumbnail")
              : null,
          })),
        },
      };
    }),
    attendee: t.router({
      auth: t.router({
        checkHandle: t.procedure
          .input(z.object({ handle: z.string().min(1).max(20) }))
          .mutation(async ({ input }) => {
            return await checkHandleAvailability(input.handle);
          }),
        completeOnboarding: protectedProcedure
          .input(
            z.object({
              handle: z.string().min(3).max(20),
              matchingEnabled: z.boolean().optional(),
              eventId: z.string().uuid().optional(),
            }),
          )
          .mutation(async ({ ctx, input }) => {
            const res = await completeOnboarding({ handle: input.handle });
            if (!res.success) return res;
            if (input.matchingEnabled !== undefined) {
              await updatePrivacyPreferences({
                matchingEnabled: input.matchingEnabled,
                autoSuggestionsEnabled: true,
                hideProfile: false,
                hideMentions: false,
                hideAiSuggestions: false,
              });
            }
            if (input.eventId) {
              const join = await joinEvent(input.eventId);
              if (!join.success) return join;
            }
            return { success: true };
          }),
      }),
      events: t.router({
        join: protectedProcedure
          .input(
            z.object({
              eventId: z.string().uuid(),
              inviteCode: z.string().optional(),
            }),
          )
          .mutation(async ({ input }) => {
            return await joinEvent(input.eventId, input.inviteCode);
          }),
        leave: protectedProcedure
          .input(z.object({ eventId: z.string().uuid() }))
          .mutation(async ({ input }) => {
            return await leaveEvent(input.eventId);
          }),
        participants: protectedProcedure
          .input(z.object({ eventId: z.string().uuid() }))
          .query(async ({ ctx, input }) => {
            const user = await getUserContext(ctx.session.id);
            const event = await db.query.events.findFirst({
              where: (events, { eq }) => eq(events.id, input.eventId),
            });
            if (!event) throw new TRPCError({ code: "NOT_FOUND" });
            if (!(await can(user, "view", "event", event))) {
              throw new TRPCError({ code: "FORBIDDEN" });
            }
            const rows = await db.query.eventParticipants.findMany({
              where: eq(eventParticipants.eventId, input.eventId),
              with: { user: true },
              limit: 200,
            });
            return rows.map((row) =>
              toPublicUser({
                id: row.user.id,
                preferredName: row.user.preferredName,
                handle: row.user.handle,
                slackId: row.user.slackId,
                isGlobalAdmin: row.user.isGlobalAdmin,
              }),
            );
          }),
      }),
      media: t.router({
        byId: protectedProcedure
          .input(z.object({ mediaId: z.string().uuid() }))
          .query(async ({ ctx, input }) => {
            const user = await getUserContext(ctx.session.id);
            const item = await db.query.media.findFirst({
              where: eq(media.id, input.mediaId),
              with: {
                event: { columns: { id: true, name: true, slug: true } },
                uploadedBy: {
                  columns: {
                    id: true,
                    handle: true,
                    preferredName: true,
                    slackId: true,
                  },
                },
              },
            });
            if (!item || item.blurStatus === "pending") {
              throw new TRPCError({ code: "NOT_FOUND" });
            }
            if (!(await can(user, "view", "media", item))) {
              throw new TRPCError({ code: "FORBIDDEN" });
            }
            const [[likeCountRow], [commentCountRow], existingLike, augmented] =
              await Promise.all([
                db
                  .select({ value: count() })
                  .from(mediaLikes)
                  .where(eq(mediaLikes.mediaId, item.id)),
                db
                  .select({ value: count() })
                  .from(mediaComments)
                  .where(eq(mediaComments.mediaId, item.id)),
                db.query.mediaLikes.findFirst({
                  where: and(
                    eq(mediaLikes.mediaId, item.id),
                    eq(mediaLikes.userId, ctx.session.id),
                  ),
                  columns: { id: true },
                }),
                augmentMediaWithPermissions(ctx.session.id, [item]),
              ]);
            const permitted = augmented[0];
            if (!permitted) throw new TRPCError({ code: "FORBIDDEN" });
            return {
              id: item.id,
              filename: item.filename,
              mimeType: item.mimeType,
              width: item.width,
              height: item.height,
              duration: item.duration,
              caption: item.caption,
              exifData: item.exifData,
              latitude: item.latitude,
              longitude: item.longitude,
              takenAt: item.takenAt,
              uploadedAt: item.uploadedAt,
              url: getMediaProxyUrl(item.id),
              thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
              likeCount: likeCountRow?.value ?? 0,
              commentCount: commentCountRow?.value ?? 0,
              hasLiked: Boolean(existingLike),
              canDelete: permitted.canDelete,
              uploadedBy: toPublicUser(item.uploadedBy),
              event: item.event,
            };
          }),
        delete: protectedProcedure
          .input(z.object({ mediaId: z.string().uuid() }))
          .mutation(async ({ input }) => {
            const res = await deleteMedia(input.mediaId);
            return { success: res.success, error: res.error };
          }),
        updateCaption: protectedProcedure
          .input(
            z.object({
              mediaId: z.string().uuid(),
              caption: z.string().max(500),
            }),
          )
          .mutation(async ({ input }) =>
            updateMediaCaption(input.mediaId, input.caption),
          ),
        tags: protectedProcedure
          .input(z.object({ mediaId: z.string().uuid() }))
          .query(async ({ input }) => {
            const res = await getMediaTags(input.mediaId);
            if (!res.success) return { tags: [] };
            return { tags: res.tags ?? [] };
          }),
        addTag: protectedProcedure
          .input(
            z.object({
              mediaId: z.string().uuid(),
              name: z.string().min(1).max(80),
            }),
          )
          .mutation(async ({ input }) => addTag(input.mediaId, input.name)),
        removeTag: protectedProcedure
          .input(
            z.object({ mediaId: z.string().uuid(), tagId: z.string().uuid() }),
          )
          .mutation(async ({ input }) => removeTag(input.mediaId, input.tagId)),
        mentions: protectedProcedure
          .input(z.object({ mediaId: z.string().uuid() }))
          .query(async ({ input }) => {
            const res = await getMediaMentions(input.mediaId);
            if (!res.success) return { users: [] };
            return { users: res.mentions ?? [] };
          }),
        addMention: protectedProcedure
          .input(
            z.object({ mediaId: z.string().uuid(), userId: z.string().uuid() }),
          )
          .mutation(async ({ input }) =>
            addMention(input.mediaId, input.userId),
          ),
        removeMention: protectedProcedure
          .input(
            z.object({ mediaId: z.string().uuid(), userId: z.string().uuid() }),
          )
          .mutation(async ({ input }) =>
            removeMention(input.mediaId, input.userId),
          ),
        downloadUrl: protectedProcedure
          .input(z.object({ mediaId: z.string().uuid() }))
          .query(async ({ ctx, input }) => {
            const user = await getUserContext(ctx.session.id);
            const item = await db.query.media.findFirst({
              where: eq(media.id, input.mediaId),
              columns: {
                id: true,
                s3Key: true,
                mimeType: true,
                filename: true,
              },
            });
            if (!item) throw new TRPCError({ code: "NOT_FOUND" });
            if (!(await can(user, "view", "media", item))) {
              throw new TRPCError({ code: "FORBIDDEN" });
            }
            return { url: await getSignedDownloadUrl(item.s3Key) };
          }),
        my: protectedProcedure
          .input(
            z.object({
              limit: z.number().min(1).max(200).optional(),
              offset: z.number().min(0).optional(),
            }),
          )
          .query(async ({ ctx, input }) => {
            const limit = input.limit ?? 100;
            const offset = input.offset ?? 0;
            const items = await db.query.media.findMany({
              where: eq(media.uploadedById, ctx.session.id),
              orderBy: desc(media.uploadedAt),
              limit,
              offset,
              with: {
                event: { columns: { id: true, name: true, slug: true } },
              },
            });
            const ids = items.map((item) => item.id);
            const likeRows = ids.length
              ? await db
                  .select({ mediaId: mediaLikes.mediaId, value: count() })
                  .from(mediaLikes)
                  .where(inArray(mediaLikes.mediaId, ids))
                  .groupBy(mediaLikes.mediaId)
              : [];
            const likeMap = new Map(
              likeRows.map((row) => [row.mediaId, row.value]),
            );
            return items.map((item) => ({
              id: item.id,
              filename: item.filename,
              mimeType: item.mimeType,
              width: item.width,
              height: item.height,
              caption: item.caption,
              uploadedAt: item.uploadedAt,
              url: getMediaProxyUrl(item.id),
              thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
              likeCount: likeMap.get(item.id) ?? 0,
              event: item.event
                ? {
                    id: item.event.id,
                    name: item.event.name,
                    slug: item.event.slug,
                  }
                : null,
            }));
          }),
      }),
      users: t.router({
        search: protectedProcedure
          .input(z.object({ query: z.string().min(2).max(80) }))
          .query(async ({ input }) => searchUsers(input.query)),
        updateProfile: protectedProcedure
          .input(
            z.object({
              preferredName: z.string().max(80),
              handle: z.string().min(3).max(20),
              bio: z.string().max(500),
              socialLinks: z.record(z.string(), z.string().max(200)),
            }),
          )
          .mutation(async ({ ctx, input }) =>
            updateUserProfile(ctx.session.id, input),
          ),
        deleteAccount: protectedProcedure.mutation(async () => deleteAccount()),
        byHandle: protectedProcedure
          .input(z.object({ handle: z.string().min(1).max(40) }))
          .query(async ({ ctx, input }) => {
            const user = await db.query.users.findFirst({
              where: eq(users.handle, input.handle),
              columns: {
                id: true,
                name: true,
                handle: true,
                preferredName: true,
                slackId: true,
                isGlobalAdmin: true,
                isBanned: true,
                bio: true,
                socialLinks: true,
                createdAt: true,
              },
            });
            if (!user || user.isBanned) {
              throw new TRPCError({ code: "NOT_FOUND" });
            }
            const privacy = await db.query.facePrivacyPreferences.findFirst({
              where: eq(facePrivacyPreferences.userId, user.id),
            });
            const privilegedViewer =
              ctx.session.id === user.id ||
              (await getUserContext(ctx.session.id))?.isGlobalAdmin === true;
            if (privacy?.hideProfile && !privilegedViewer) {
              throw new TRPCError({ code: "NOT_FOUND" });
            }

            const withEvent = {
              with: {
                event: { columns: { id: true, name: true, slug: true } },
              },
            } as const;

            const [rawUploads, rawLikeRows, rawMentionRows, rawParticipations] =
              await Promise.all([
                db.query.media.findMany({
                  ...withEvent,
                  where: eq(media.uploadedById, user.id),
                  orderBy: desc(media.uploadedAt),
                  limit: 500,
                }),
                db.query.mediaLikes.findMany({
                  where: eq(mediaLikes.userId, user.id),
                  orderBy: desc(mediaLikes.createdAt),
                  limit: 500,
                  with: {
                    media: {
                      columns: {
                        id: true,
                        filename: true,
                        mimeType: true,
                        width: true,
                        height: true,
                        caption: true,
                        uploadedAt: true,
                      },
                      with: {
                        event: {
                          columns: { id: true, name: true, slug: true },
                        },
                      },
                    },
                  },
                }),
                db.query.mediaMentions.findMany({
                  where: eq(mediaMentions.userId, user.id),
                  orderBy: desc(mediaMentions.createdAt),
                  limit: 500,
                  with: {
                    media: {
                      columns: {
                        id: true,
                        filename: true,
                        mimeType: true,
                        width: true,
                        height: true,
                        caption: true,
                        uploadedAt: true,
                      },
                      with: {
                        event: {
                          columns: { id: true, name: true, slug: true },
                        },
                      },
                    },
                  },
                }),
                db.query.eventParticipants.findMany({
                  where: eq(eventParticipants.userId, user.id),
                  orderBy: desc(eventParticipants.joinedAt),
                  limit: 200,
                  with: {
                    event: true,
                  },
                }),
              ]);

            const accessibleEventIds = new Set(
              await getAccessibleEventIdsForUser(ctx.session.id),
            );
            const uploads = rawUploads.filter((item) =>
              accessibleEventIds.has(item.eventId),
            );
            const likeRows = rawLikeRows.filter((item) =>
              item.media ? accessibleEventIds.has(item.media.event.id) : false,
            );
            const mentionRows =
              privacy?.hideMentions && !privilegedViewer
                ? []
                : rawMentionRows.filter((item) =>
                    item.media
                      ? accessibleEventIds.has(item.media.event.id)
                      : false,
                  );
            const participations = rawParticipations.filter((item) =>
              accessibleEventIds.has(item.eventId),
            );

            const likes = likeRows
              .map((r) => r.media)
              .filter((m): m is NonNullable<typeof m> => !!m);
            const mentions = mentionRows
              .map((r) => r.media)
              .filter((m): m is NonNullable<typeof m> => !!m);

            const ids = [
              ...new Set([...uploads, ...likes, ...mentions].map((m) => m.id)),
            ];
            const likeRows2 = ids.length
              ? await db
                  .select({ mediaId: mediaLikes.mediaId, value: count() })
                  .from(mediaLikes)
                  .where(inArray(mediaLikes.mediaId, ids))
                  .groupBy(mediaLikes.mediaId)
              : [];
            const likeMap = new Map(
              likeRows2.map((row) => [row.mediaId, row.value]),
            );

            const mapMedia = (list: (typeof uploads)[number][]) =>
              list.map((item) => ({
                id: item.id,
                filename: item.filename,
                mimeType: item.mimeType,
                width: item.width,
                height: item.height,
                caption: item.caption,
                uploadedAt: item.uploadedAt,
                url: getMediaProxyUrl(item.id),
                thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
                likeCount: likeMap.get(item.id) ?? 0,
                event: item.event
                  ? {
                      id: item.event.id,
                      name: item.event.name,
                      slug: item.event.slug,
                    }
                  : null,
              }));

            const mapLikeMedia = (
              list: {
                id: string;
                filename: string;
                mimeType: string;
                width: number | null;
                height: number | null;
                caption: string | null;
                uploadedAt: Date;
                event: { id: string; name: string; slug: string } | null;
              }[],
            ) =>
              list.map((item) => ({
                id: item.id,
                filename: item.filename,
                mimeType: item.mimeType,
                width: item.width,
                height: item.height,
                caption: item.caption,
                uploadedAt: item.uploadedAt,
                url: getMediaProxyUrl(item.id),
                thumbnailUrl: getMediaProxyUrl(item.id, "thumbnail"),
                likeCount: likeMap.get(item.id) ?? 0,
                event: item.event,
              }));

            return {
              user: toPublicUser({
                id: user.id,
                preferredName: user.preferredName,
                handle: user.handle,
                slackId: user.slackId,
                isGlobalAdmin: user.isGlobalAdmin,
              }),
              bio: user.bio ?? null,
              socialLinks: user.socialLinks ?? null,
              createdAt: user.createdAt,
              stats: {
                photos: uploads.filter((m) => m.mimeType.startsWith("image/"))
                  .length,
                videos: uploads.filter((m) => m.mimeType.startsWith("video/"))
                  .length,
                likes: likes.length,
                mentions: mentions.length,
                events: participations.length,
              },
              uploads: mapMedia(uploads),
              likes: mapLikeMedia(likes as any),
              mentions: mapLikeMedia(mentions as any),
              events: participations.map((p) => {
                const ev = p.event;
                return {
                  id: ev.id,
                  name: ev.name,
                  slug: ev.slug,
                  description: ev.description,
                  eventDate: ev.eventDate,
                  location: ev.location,
                  locationCity: ev.locationCity,
                  visibility: ev.visibility,
                  bannerUrl: ev.bannerS3Key
                    ? getAssetProxyUrl("event-banner", ev.id)
                    : null,
                };
              }),
            };
          }),
      }),
      social: t.router({
        like: protectedProcedure
          .input(z.object({ mediaId: z.string().uuid() }))
          .mutation(async ({ input }) => {
            return await toggleMediaLike(input.mediaId);
          }),
        comments: t.router({
          list: protectedProcedure
            .input(z.object({ mediaId: z.string().uuid() }))
            .query(async ({ input }) => {
              return await getMediaComments(input.mediaId);
            }),
          create: protectedProcedure
            .input(
              z.object({
                mediaId: z.string().uuid(),
                content: z.string().min(1).max(1000),
                parentCommentId: z.string().uuid().optional(),
              }),
            )
            .mutation(async ({ input }) => {
              return await createComment(
                input.mediaId,
                input.content,
                input.parentCommentId,
              );
            }),
          delete: protectedProcedure
            .input(z.object({ commentId: z.string().uuid() }))
            .mutation(async ({ input }) => deleteComment(input.commentId)),
          like: protectedProcedure
            .input(z.object({ commentId: z.string().uuid() }))
            .mutation(async ({ input }) => toggleCommentLike(input.commentId)),
        }),
      }),
      share: t.router({
        create: protectedProcedure
          .input(z.object({ mediaId: z.string().uuid() }))
          .mutation(async ({ input }) => {
            const res = await createShareLink(input.mediaId, "view");
            if (!res.success) return { success: false, error: res.error };
            return { success: true, url: `${APP_URL}/share/${res.token}` };
          }),
        // Public: anyone with a valid share token can view the media.
        byToken: t.procedure
          .input(z.object({ token: z.string().min(1).max(64) }))
          .query(async ({ input }) => {
            const res = await getSharedMedia(input.token);
            if (!res.success || !res.link) {
              throw new TRPCError({ code: "NOT_FOUND" });
            }
            const mediaItem = res.link.media;
            return {
              id: mediaItem.id,
              filename: mediaItem.filename,
              mimeType: mediaItem.mimeType,
              caption: mediaItem.caption,
              width: mediaItem.width,
              height: mediaItem.height,
              uploadedAt: mediaItem.uploadedAt,
              url: getMediaProxyUrl(mediaItem.id),
              thumbnailUrl: getMediaProxyUrl(mediaItem.id, "thumbnail"),
              uploadedBy: toPublicUser(mediaItem.uploadedBy),
              event: mediaItem.event
                ? {
                    id: mediaItem.event.id,
                    name: mediaItem.event.name,
                    slug: mediaItem.event.slug,
                  }
                : null,
            };
          }),
      }),
      reports: t.router({
        create: protectedProcedure
          .input(
            z.object({
              mediaId: z.string().uuid(),
              reason: z.string().min(1).max(500),
            }),
          )
          .mutation(async ({ input }) => {
            return await createReport(input.mediaId, input.reason);
          }),
      }),
      privacy: t.router({
        overview: protectedProcedure.query(async () => getPrivacyOverview()),
        update: protectedProcedure
          .input(
            z.object({
              matchingEnabled: z.boolean(),
              autoSuggestionsEnabled: z.boolean(),
              hideProfile: z.boolean(),
              hideMentions: z.boolean(),
              hideAiSuggestions: z.boolean(),
            }),
          )
          .mutation(async ({ input }) => updatePrivacyPreferences(input)),
        deleteFaceData: protectedProcedure.mutation(async () =>
          deleteAllFaceData(),
        ),
      }),
      dataExport: t.router({
        latest: protectedProcedure.query(async () => {
          const result = await getLatestExport();
          if (!result.success || !result.export) return result;
          return {
            ...result,
            export: {
              ...result.export,
              downloadUrl:
                result.export.status === "completed" && result.export.s3Key
                  ? await getSignedDownloadUrl(result.export.s3Key)
                  : null,
            },
          };
        }),
        request: protectedProcedure.mutation(async () => requestDataExport()),
        cancel: protectedProcedure
          .input(z.object({ exportId: z.string().uuid() }))
          .mutation(async ({ input }) => cancelDataExport(input.exportId)),
        delete: protectedProcedure
          .input(z.object({ exportId: z.string().uuid() }))
          .mutation(async ({ input }) => deleteExport(input.exportId)),
      }),
      upload: t.router({
        presign: protectedProcedure
          .input(
            z.object({
              filename: z.string().min(1),
              mimeType: z.string().min(1),
              size: z.number().min(1),
              eventId: z.string().uuid(),
            }),
          )
          .mutation(async ({ input }) => {
            const result = await getPresignedUrl(
              input.eventId,
              input.filename,
              input.mimeType,
              input.size,
            );
            if (!result.success) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: result.error ?? "Could not start upload",
              });
            }
            return {
              mediaId: result.mediaId,
              s3Key: result.s3Key,
              uploadUrl: result.uploadUrl,
              thumbnailS3Key: result.thumbnailS3Key,
              thumbnailUploadUrl: result.thumbnailUploadUrl,
              eventId: input.eventId,
            };
          }),
        complete: protectedProcedure
          .input(
            z.object({
              mediaId: z.string().uuid(),
              s3Key: z.string().min(1),
              eventId: z.string().uuid(),
              filename: z.string().min(1),
              mimeType: z.string().min(1),
              size: z.number().min(1),
              caption: z.string().max(500).optional(),
            }),
          )
          .mutation(async ({ input }) => {
            const result = await finalizeUpload(
              input.mediaId,
              input.eventId,
              {
                filename: input.filename,
                fileSize: input.size,
                mimeType: input.mimeType,
                width: null,
                height: null,
                takenAt: null,
                exifData: null,
                s3Key: input.s3Key,
                thumbnailS3Key: null,
                thumbnailFailed: true,
                thumbnailError: "Mobile client requested server processing",
              },
              true,
            );
            if (!result.success || !result.media) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: result.error ?? "Could not process upload",
              });
            }
            return { success: true, media: { id: result.media.id } };
          }),
      }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
