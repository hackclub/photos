import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getRedisClient } from "@/lib/rate-limit";

const SESSION_TTL_SECONDS = 10 * 60;

export type FaceCaptureSession = {
  userId: string;
  eventId: string;
  eventName: string;
  mode: "filter" | "blur";
  autoSuggestions: boolean;
  status: "created" | "opened" | "processing" | "completed" | "failed";
  createdAt: number;
  expiresAt: number;
  scanId?: string;
  error?: string;
};

function redisOrThrow() {
  const redis = getRedisClient();
  if (!redis) throw new Error("Phone capture is temporarily unavailable");
  return redis;
}

function sessionKey(token: string) {
  const digest = createHash("sha256").update(token).digest("hex");
  return `face_capture:${digest}`;
}

function lockKey(token: string) {
  return `${sessionKey(token)}:lock`;
}

async function writeSession(token: string, session: FaceCaptureSession) {
  const redis = redisOrThrow();
  const remaining = Math.max(
    1,
    Math.ceil((session.expiresAt - Date.now()) / 1000),
  );
  await redis.set(sessionKey(token), JSON.stringify(session), "EX", remaining);
}

export async function createFaceCaptureSession(input: {
  userId: string;
  eventId: string;
  eventName: string;
  mode: "filter" | "blur";
  autoSuggestions: boolean;
}) {
  const redis = redisOrThrow();
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const session: FaceCaptureSession = {
    ...input,
    status: "created",
    createdAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };
  await redis.set(
    sessionKey(token),
    JSON.stringify(session),
    "EX",
    SESSION_TTL_SECONDS,
    "NX",
  );
  return { token, session };
}

export async function getFaceCaptureSession(token: string) {
  if (!token || token.length > 128) return null;
  const value = await redisOrThrow().get(sessionKey(token));
  if (!value) return null;
  const session = JSON.parse(value) as FaceCaptureSession;
  if (session.expiresAt <= Date.now()) return null;
  return session;
}

export async function markFaceCaptureOpened(token: string) {
  await redisOrThrow().eval(
    `local raw = redis.call('GET', KEYS[1])
     if not raw then return 0 end
     local session = cjson.decode(raw)
     if session.status == 'created' then
       session.status = 'opened'
       redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
     end
     return 1`,
    1,
    sessionKey(token),
  );
  return getFaceCaptureSession(token);
}

export async function claimFaceCaptureSession(token: string) {
  const redis = redisOrThrow();
  const lease = randomBytes(24).toString("base64url");
  const acquired = await redis.set(lockKey(token), lease, "EX", 10 * 60, "NX");
  if (acquired !== "OK") return null;
  const session = await getFaceCaptureSession(token);
  if (!session || session.status === "completed") {
    await redis.del(lockKey(token));
    return null;
  }
  session.status = "processing";
  session.error = undefined;
  session.expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await writeSession(token, session);
  return { session, lease };
}

export async function completeFaceCaptureSession(
  token: string,
  scanId: string,
  lease: string,
) {
  return (
    Number(
      await redisOrThrow().eval(
        `if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
         local raw = redis.call('GET', KEYS[1])
         if not raw then redis.call('DEL', KEYS[2]); return 0 end
         local session = cjson.decode(raw)
         if session.status ~= 'processing' then return 0 end
         session.status = 'completed'
         session.scanId = ARGV[2]
         session.error = nil
         redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
         redis.call('DEL', KEYS[2])
         return 1`,
        2,
        sessionKey(token),
        lockKey(token),
        lease,
        scanId,
      ),
    ) === 1
  );
}

export async function failFaceCaptureSession(
  token: string,
  error: string,
  lease: string,
) {
  await redisOrThrow().eval(
    `if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
     local raw = redis.call('GET', KEYS[1])
     if not raw then redis.call('DEL', KEYS[2]); return 0 end
     local session = cjson.decode(raw)
     if session.status == 'processing' then
       session.status = 'failed'
       session.error = ARGV[2]
       redis.call('SET', KEYS[1], cjson.encode(session), 'KEEPTTL')
     end
     redis.call('DEL', KEYS[2])
     return 1`,
    2,
    sessionKey(token),
    lockKey(token),
    lease,
    error.slice(0, 160),
  );
}

export async function revokeFaceCaptureSession(token: string, userId: string) {
  const session = await getFaceCaptureSession(token);
  if (!session || session.userId !== userId) return false;
  await redisOrThrow().del(sessionKey(token), lockKey(token));
  return true;
}
