import "server-only";
import { getRedisClient } from "@/lib/rate-limit";

const FACE_SEARCH_CHANNEL_PREFIX = "photos:face-search:";

export function faceSearchChannel(eventId: string) {
  return `${FACE_SEARCH_CHANNEL_PREFIX}${eventId}`;
}

export async function publishFaceSearchProgress(
  eventId: string,
  progress: { indexed: number; total: number },
) {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.publish(
      faceSearchChannel(eventId),
      JSON.stringify({ type: "progress", ...progress }),
    );
  } catch (_error) {
    // Non-fatal; the WebSocket falls back to its own progress polling.
  }
}

export async function publishFaceSearchDone(eventId: string) {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.publish(
      faceSearchChannel(eventId),
      JSON.stringify({ type: "done" }),
    );
  } catch (_error) {
    // Non-fatal.
  }
}
