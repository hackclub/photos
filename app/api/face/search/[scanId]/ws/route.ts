import { experimental_upgradeWebSocket } from "@vercel/functions";
import { and, count, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { faceScans, media, mediaFaceScans } from "@/lib/db/schema";
import { faceSearchChannel } from "@/lib/face-search-stream";
import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/rate-limit";

const POLL_INTERVAL_MS = 1500;
const MAX_CONNECTION_MS = 10 * 60 * 1000;

async function getProgress(eventId: string) {
  const [[total], [ready]] = await Promise.all([
    db
      .select({ count: count() })
      .from(media)
      .where(
        and(eq(media.eventId, eventId), sql`${media.mimeType} like 'image/%'`),
      ),
    db
      .select({ count: count() })
      .from(mediaFaceScans)
      .innerJoin(media, eq(media.id, mediaFaceScans.mediaId))
      .where(
        and(eq(media.eventId, eventId), eq(mediaFaceScans.status, "ready")),
      ),
  ]);
  return { indexed: ready?.count ?? 0, total: total?.count ?? 0 };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;
  const session = await getSession();
  if (!session?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    return new Response("Not found", { status: 404 });
  }
  const scan = await db.query.faceScans.findFirst({
    where: and(
      eq(faceScans.id, scanId),
      eq(faceScans.userId, session.id),
      eq(faceScans.status, "ready"),
    ),
    columns: { id: true },
  });
  if (!scan) {
    return new Response("Not found", { status: 404 });
  }

  return experimental_upgradeWebSocket((socket) => {
    const channel = faceSearchChannel(eventId);
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let expiresTimer: ReturnType<typeof setTimeout> | undefined;

    const send = (data: unknown) => {
      if (disposed || socket.readyState !== socket.OPEN) return;
      try {
        socket.send(JSON.stringify(data));
      } catch (error) {
        logger.error("[face-search] send failed", error);
      }
    };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (expiresTimer) clearTimeout(expiresTimer);
      subscriber?.off("message", onMessage);
      if (subscriber && subscriber.status === "ready") {
        subscriber.unsubscribe(channel).catch(() => undefined);
      }
      if (socket.readyState === socket.OPEN) socket.close(1000);
    };

    let subscriber: ReturnType<typeof getRedisClient> | null = null;
    const onMessage = (_chan: string, message: string) => {
      try {
        const data = JSON.parse(message) as { type: string };
        if (data.type === "done") {
          send({ type: "done" });
          dispose();
        }
      } catch (error) {
        logger.error("[face-search] invalid message", error);
      }
    };

    void (async () => {
      const redis = getRedisClient();
      if (redis) {
        subscriber = redis.duplicate();
        subscriber.on("error", () => undefined);
        try {
          if (subscriber.status === "wait") await subscriber.connect();
          await subscriber.subscribe(channel);
          subscriber.on("message", onMessage);
        } catch (error) {
          logger.error("[face-search] redis subscriber unavailable", error);
        }
      }

      const poll = async () => {
        if (disposed) return;
        try {
          const progress = await getProgress(eventId);
          send({ type: "progress", ...progress });
          if (progress.total > 0 && progress.indexed >= progress.total) {
            send({ type: "done" });
            dispose();
          }
        } catch (error) {
          logger.error("[face-search] progress poll failed", error);
        }
      };

      await poll();
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
      expiresTimer = setTimeout(dispose, MAX_CONNECTION_MS);

      socket.on("close", dispose);
      socket.on("error", dispose);
    })();
  });
}
