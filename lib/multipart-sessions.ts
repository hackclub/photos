import { getRedisClient } from "@/lib/rate-limit";

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

export type MultipartUploadSession = {
  userId: string;
  eventId: string;
  s3Key: string;
  expiresAt: number;
};

const localSessions = new Map<string, MultipartUploadSession>();

function sessionKey(s3Key: string, uploadId: string) {
  return `multipart_upload:${s3Key}:${uploadId}`;
}

function pruneLocalSessions() {
  const now = Date.now();
  for (const [key, session] of localSessions) {
    if (session.expiresAt <= now) localSessions.delete(key);
  }
}

function requireLocalFallback() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "REDIS_URL is required for multipart uploads in production",
    );
  }
}

export async function rememberMultipartSession(
  s3Key: string,
  uploadId: string,
  userId: string,
  eventId: string,
) {
  const session: MultipartUploadSession = {
    userId,
    eventId,
    s3Key,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  const redis = getRedisClient();
  if (redis) {
    await redis.set(
      sessionKey(s3Key, uploadId),
      JSON.stringify(session),
      "PX",
      SESSION_TTL_MS,
    );
    return;
  }
  requireLocalFallback();
  pruneLocalSessions();
  localSessions.set(sessionKey(s3Key, uploadId), session);
}

export async function getMultipartSession(
  s3Key: string,
  uploadId: string,
  userId: string,
) {
  const redis = getRedisClient();
  const key = sessionKey(s3Key, uploadId);
  let session: MultipartUploadSession | null = null;
  if (redis) {
    const value = await redis.get(key);
    if (value) {
      try {
        session = JSON.parse(value) as MultipartUploadSession;
      } catch {
        await redis.del(key);
      }
    }
  } else {
    requireLocalFallback();
    pruneLocalSessions();
    session = localSessions.get(key) ?? null;
  }
  if (
    !session ||
    session.expiresAt <= Date.now() ||
    session.userId !== userId ||
    session.s3Key !== s3Key
  ) {
    return null;
  }
  return session;
}

export async function forgetMultipartSession(s3Key: string, uploadId: string) {
  const key = sessionKey(s3Key, uploadId);
  const redis = getRedisClient();
  if (redis) {
    await redis.del(key);
    return;
  }
  localSessions.delete(key);
}
