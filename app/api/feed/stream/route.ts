import { randomUUID } from "node:crypto";
import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from "@vercel/functions";
import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  events,
  media,
  mediaComments,
  mediaLikes,
  users,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { can, getUserContext } from "@/lib/policy";
import { getRedisClient } from "@/lib/rate-limit";
import { toPublicUser } from "@/lib/user-display";

type FeedClient = {
  userId?: string;
  heartbeat: ReturnType<typeof setInterval>;
  expires: ReturnType<typeof setTimeout>;
  socket: WebSocket;
};

const feedGlobal = globalThis as typeof globalThis & {
  __photosFeedClients?: Map<WebSocket, FeedClient>;
  __photosFeedRedisSubscriber?: ReturnType<
    NonNullable<ReturnType<typeof getRedisClient>>["duplicate"]
  >;
  __photosFeedRedisSubscriberPromise?: Promise<void>;
};
const clients = feedGlobal.__photosFeedClients ?? new Map();
feedGlobal.__photosFeedClients = clients;
const MAX_FEED_CLIENTS = 1_000;
const MAX_FEED_CONNECTION_AGE_MS = 6 * 60 * 60 * 1000;
const FEED_REDIS_CHANNEL = "photos:feed:updates";
const MAX_SOCKET_BUFFERED_BYTES = 1_000_000;
const instanceId = randomUUID();

function removeClient(socket: WebSocket, close = false) {
  const client = clients.get(socket);
  if (!client) return;
  clearInterval(client.heartbeat);
  clearTimeout(client.expires);
  clients.delete(socket);
  if (close && socket.readyState === socket.OPEN) socket.close(1000);
}

function sendToClient(socket: WebSocket, data: string) {
  if (socket.readyState !== socket.OPEN) {
    removeClient(socket);
    return false;
  }
  if (socket.bufferedAmount > MAX_SOCKET_BUFFERED_BYTES) {
    removeClient(socket, true);
    return false;
  }
  socket.send(data);
  return true;
}

async function sendFeedUpdate(activityData: Record<string, unknown>) {
  const data = JSON.stringify(activityData);
  if (activityData.type === "photo_deleted") {
    for (const [socket] of clients.entries()) {
      try {
        sendToClient(socket, data);
      } catch (err) {
        logger.error("[WebSocket] Error sending to client (removing):", err);
        removeClient(socket);
      }
    }
    return;
  }
  const item = activityData.item as Record<string, any> | undefined;
  const event = item?.event;
  if (!event?.id) {
    return;
  }
  const clientEntries = [...clients.entries()];
  const users = new Map(
    await Promise.all(
      [...new Set(clientEntries.map(([, client]) => client.userId))].map(
        async (userId) => [userId, await getUserContext(userId)] as const,
      ),
    ),
  );
  for (const [socket, client] of clientEntries) {
    try {
      const user = users.get(client.userId);
      if (!user?.isBanned && (await can(user, "view", "event", event))) {
        sendToClient(socket, data);
      }
    } catch (err) {
      logger.error("[WebSocket] Error sending to client (removing):", err);
      removeClient(socket);
    }
  }
}

async function ensureRedisSubscriber() {
  const redis = getRedisClient();
  if (!redis) return;
  if (!feedGlobal.__photosFeedRedisSubscriberPromise) {
    const subscriber = redis.duplicate();
    feedGlobal.__photosFeedRedisSubscriber = subscriber;
    feedGlobal.__photosFeedRedisSubscriberPromise = (async () => {
      if (subscriber.status === "wait") await subscriber.connect();
      await subscriber.subscribe(FEED_REDIS_CHANNEL);
      subscriber.on("message", (_channel, message) => {
        try {
          const envelope = JSON.parse(message) as {
            origin: string;
            activityData: Record<string, unknown>;
          };
          if (envelope.origin !== instanceId) {
            void sendFeedUpdate(envelope.activityData);
          }
        } catch (error) {
          logger.error("[WebSocket] Invalid Redis feed message:", error);
        }
      });
    })().catch((error) => {
      logger.error("[WebSocket] Redis subscriber unavailable:", error);
      feedGlobal.__photosFeedRedisSubscriberPromise = undefined;
    });
  }
  await feedGlobal.__photosFeedRedisSubscriberPromise;
}

export async function notifyFeedUpdate(activityData: Record<string, unknown>) {
  await sendFeedUpdate(activityData);
  const redis = getRedisClient();
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.publish(
      FEED_REDIS_CHANNEL,
      JSON.stringify({ origin: instanceId, activityData }),
    );
  } catch (error) {
    logger.error("[WebSocket] Failed to publish feed update:", error);
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (user?.isBanned) {
    return new Response("Forbidden", { status: 403 });
  }
  void ensureRedisSubscriber();
  return experimental_upgradeWebSocket((socket) => {
    while (clients.size >= MAX_FEED_CLIENTS) {
      const oldestSocket = clients.keys().next().value;
      if (!oldestSocket) break;
      removeClient(oldestSocket, true);
    }
    const heartbeat = setInterval(() => {
      try {
        sendToClient(socket, JSON.stringify({ type: "heartbeat" }));
      } catch (error) {
        logger.error("[WebSocket] Heartbeat failed:", error);
        removeClient(socket);
      }
    }, 30_000);
    const expires = setTimeout(
      () => removeClient(socket, true),
      MAX_FEED_CONNECTION_AGE_MS,
    );
    clients.set(socket, { userId: session?.id, heartbeat, expires, socket });
    socket.on("close", () => removeClient(socket));
    socket.on("error", () => removeClient(socket));
    socket.on("message", (_data: WebSocketData) => {});
    sendToClient(socket, JSON.stringify({ type: "connected" }));
  });
}
export async function broadcastNewPhoto(mediaId: string) {
  try {
    const result = await db
      .select({
        id: media.id,
        filename: media.filename,
        s3Url: media.s3Url,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
        thumbnailS3Key: media.thumbnailS3Key,
        exifData: media.exifData,
        uploadedAt: media.uploadedAt,
        uploadedBy: {
          id: users.id,
          handle: users.handle,
          slackId: users.slackId,
        },
        eventId: media.eventId,
        event: {
          id: events.id,
          name: events.name,
          slug: events.slug,
          visibility: events.visibility,
          seriesId: events.seriesId,
        },
        user: {
          id: users.id,
          handle: users.handle,
          slackId: users.slackId,
        },
        likeCount: sql<number>`(SELECT COUNT(*) FROM ${mediaLikes} WHERE ${mediaLikes.mediaId} = ${media.id})::int`,
        commentCount: sql<number>`(SELECT COUNT(*) FROM ${mediaComments} WHERE ${mediaComments.mediaId} = ${media.id} AND ${mediaComments.parentCommentId} IS NULL)::int`,
      })
      .from(media)
      .leftJoin(users, eq(media.uploadedById, users.id))
      .leftJoin(events, eq(media.eventId, events.id))
      .where(eq(media.id, mediaId))
      .limit(1);
    if (result.length > 0) {
      const item = result[0];
      const activityData = {
        type: "new_photo",
        item: {
          id: `photo-${item.id}`,
          type: "photo",
          timestamp: item.uploadedAt,
          event: item.event,
          user: item.user ? toPublicUser(item.user) : null,
          media: {
            id: item.id,
            filename: item.filename,
            s3Url: item.s3Url,
            mimeType: item.mimeType,
            width: item.width,
            height: item.height,
            thumbnailS3Key: item.thumbnailS3Key,
            exifData: item.exifData,
            uploadedAt: item.uploadedAt,
            uploadedBy: item.uploadedBy ? toPublicUser(item.uploadedBy) : null,
            likeCount: item.likeCount,
            commentCount: item.commentCount,
          },
        },
      };
      await notifyFeedUpdate(activityData);
    }
  } catch (error) {
    logger.error("[SSE] Error broadcasting new photo:", error);
  }
}
export async function broadcastPhotoDeleted(mediaId: string) {
  try {
    notifyFeedUpdate({
      type: "photo_deleted",
      mediaId: mediaId,
    });
  } catch (error) {
    logger.error("Error broadcasting photo deletion:", error);
  }
}
export async function broadcastNewComment(commentId: string) {
  try {
    const result = await db
      .select({
        id: mediaComments.id,
        content: mediaComments.content,
        createdAt: mediaComments.createdAt,
        media: {
          id: media.id,
          filename: media.filename,
          s3Url: media.s3Url,
          mimeType: media.mimeType,
          thumbnailS3Key: media.thumbnailS3Key,
        },
        event: {
          id: events.id,
          name: events.name,
          slug: events.slug,
          visibility: events.visibility,
          seriesId: events.seriesId,
        },
        user: {
          id: users.id,
          handle: users.handle,
          slackId: users.slackId,
        },
      })
      .from(mediaComments)
      .innerJoin(media, eq(mediaComments.mediaId, media.id))
      .innerJoin(users, eq(mediaComments.userId, users.id))
      .leftJoin(events, eq(media.eventId, events.id))
      .where(eq(mediaComments.id, commentId))
      .limit(1);
    if (result.length > 0) {
      const item = result[0];
      const activityData = {
        type: "new_comment",
        item: {
          id: `comment-${item.id}`,
          type: "comment",
          timestamp: item.createdAt,
          event: item.event,
          user: toPublicUser(item.user),
          comment: {
            id: item.id,
            content: item.content,
            mediaId: item.media.id,
          },
          media: item.media,
        },
      };
      await notifyFeedUpdate(activityData);
    }
  } catch (error) {
    logger.error("[SSE] Error broadcasting new comment:", error);
  }
}
export async function broadcastNewLike(mediaId: string, userId: string) {
  try {
    const result = await db
      .select({
        id: mediaLikes.id,
        createdAt: mediaLikes.createdAt,
        media: {
          id: media.id,
          filename: media.filename,
          s3Url: media.s3Url,
          mimeType: media.mimeType,
          thumbnailS3Key: media.thumbnailS3Key,
        },
        event: {
          id: events.id,
          name: events.name,
          slug: events.slug,
          visibility: events.visibility,
          seriesId: events.seriesId,
        },
        user: {
          id: users.id,
          handle: users.handle,
          slackId: users.slackId,
        },
      })
      .from(mediaLikes)
      .innerJoin(media, eq(mediaLikes.mediaId, media.id))
      .innerJoin(users, eq(mediaLikes.userId, users.id))
      .leftJoin(events, eq(media.eventId, events.id))
      .where(
        and(eq(mediaLikes.mediaId, mediaId), eq(mediaLikes.userId, userId)),
      )
      .limit(1);
    if (result.length > 0) {
      const item = result[0];
      const activityData = {
        type: "new_like",
        item: {
          id: `like-${item.id}`,
          type: "like",
          timestamp: item.createdAt,
          event: item.event,
          user: toPublicUser(item.user),
          media: item.media,
        },
      };
      await notifyFeedUpdate(activityData);
    }
  } catch (error) {
    logger.error("[SSE] Error broadcasting new like:", error);
  }
}
export async function broadcastBulkUpload(
  eventId: string,
  count: number,
  userId: string,
) {
  try {
    const event = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        handle: true,
        preferredName: true,
        slackId: true,
      },
    });
    if (!event || !user) return;
    notifyFeedUpdate({
      type: "bulk_upload",
      item: {
        id: `bulk-${Date.now()}`,
        type: "bulk_upload",
        timestamp: new Date(),
        event: {
          id: event.id,
          name: event.name,
          slug: event.slug,
          visibility: event.visibility,
          seriesId: event.seriesId,
        },
        user: {
          id: user.id,
          name: toPublicUser(user).name,
          handle: user.handle,
          slackId: user.slackId,
        },
        count,
      },
    });
  } catch (error) {
    logger.error("Error broadcasting bulk upload:", error);
  }
}
