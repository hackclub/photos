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
import { can, getUserContext } from "@/lib/policy";

const clients = new Map<ReadableStreamDefaultController, string | undefined>();
export async function notifyFeedUpdate(activityData: Record<string, unknown>) {
  const data = JSON.stringify(activityData);
  if (activityData.type === "photo_deleted") {
    let _sent = 0;
    for (const [controller] of clients.entries()) {
      try {
        controller.enqueue(`data: ${data}\n\n`);
        _sent++;
      } catch (err) {
        console.error("[SSE] Error sending to client (removing):", err);
        clients.delete(controller);
      }
    }
    return;
  }
  const item = activityData.item as Record<string, any> | undefined;
  const event = item?.event;
  if (!event?.id) {
    return;
  }
  let _sentCount = 0;
  let _skipCount = 0;
  for (const [controller, userId] of clients.entries()) {
    try {
      const user = await getUserContext(userId);
      if (user?.isBanned) {
        _skipCount++;
        continue;
      }
      const hasAccess = await can(user, "view", "event", event);
      if (hasAccess) {
        controller.enqueue(`data: ${data}\n\n`);
        _sentCount++;
      } else {
        _skipCount++;
      }
    } catch (err) {
      console.error("[SSE] Error sending to client (removing):", err);
      clients.delete(controller);
    }
  }
}
export async function GET(request: NextRequest) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (user?.isBanned) {
    return new Response("Forbidden", { status: 403 });
  }
  const stream = new ReadableStream({
    start(controller) {
      clients.set(controller, session?.id);
      controller.enqueue(`: connected\n\n`);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
        } catch (_err) {
          clearInterval(heartbeat);
        }
      }, 30000);
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        clients.delete(controller);
        try {
          controller.close();
        } catch (_err) {}
      });
    },
    cancel() {},
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie, Authorization",
    },
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
          name: users.name,
          handle: users.handle,
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
          email: users.email,
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
          user: item.user,
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
            uploadedBy: item.uploadedBy,
            likeCount: item.likeCount,
            commentCount: item.commentCount,
          },
        },
      };
      await notifyFeedUpdate(activityData);
    }
  } catch (error) {
    console.error("[SSE] Error broadcasting new photo:", error);
  }
}
export async function broadcastPhotoDeleted(mediaId: string) {
  try {
    notifyFeedUpdate({
      type: "photo_deleted",
      mediaId: mediaId,
    });
  } catch (error) {
    console.error("Error broadcasting photo deletion:", error);
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
          name: users.name,
          email: users.email,
          slackId: users.slackId,
          avatarS3Key: users.avatarS3Key,
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
          user: item.user,
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
    console.error("[SSE] Error broadcasting new comment:", error);
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
          name: users.name,
          email: users.email,
          slackId: users.slackId,
          avatarS3Key: users.avatarS3Key,
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
          user: item.user,
          media: item.media,
        },
      };
      await notifyFeedUpdate(activityData);
    }
  } catch (error) {
    console.error("[SSE] Error broadcasting new like:", error);
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
          name: user.name,
          email: user.email,
          slackId: user.slackId,
        },
        count,
      },
    });
  } catch (error) {
    console.error("Error broadcasting bulk upload:", error);
  }
}
