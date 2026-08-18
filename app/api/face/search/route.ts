import { and, count, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventFaceIndexes,
  facePrivacyPreferences,
  faceScans,
  media,
  mediaFaceDetections,
  mediaFaceScans,
} from "@/lib/db/schema";
import {
  ensureEventFaceIndex,
  queuePendingFaceMedia,
  searchFaceScanInEvent,
  syncFaceIndexJobs,
} from "@/lib/face-indexing";
import {
  publishFaceSearchDone,
  publishFaceSearchProgress,
} from "@/lib/face-search-stream";
import { can, getUserContext } from "@/lib/policy";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!session?.id || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await rateLimit(`face_search:${user.id}`, {
    limit: 120,
    window: 10 * 60,
    failOpen: process.env.NODE_ENV !== "production",
  });
  if (!limited.success) {
    return NextResponse.json(
      {
        error: limited.backendAvailable
          ? "Too many face searches"
          : "Face search is temporarily unavailable",
      },
      { status: limited.backendAvailable ? 429 : 503 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    eventId?: string;
    scanId?: string;
    mode?: "filter" | "blur";
    poll?: boolean;
  } | null;
  if (!body?.eventId || !(await can(user, "view", "event", body.eventId))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const scan = body.scanId
    ? await db.query.faceScans.findFirst({
        where: and(
          eq(faceScans.id, body.scanId),
          eq(faceScans.userId, user.id),
          eq(faceScans.status, "ready"),
        ),
      })
    : await db.query.faceScans.findFirst({
        where: and(
          eq(faceScans.userId, user.id),
          eq(faceScans.isActive, true),
          eq(faceScans.status, "ready"),
        ),
      });
  if (!scan)
    return NextResponse.json({ error: "Face scan not found" }, { status: 404 });
  const preferences = await db.query.facePrivacyPreferences.findFirst({
    where: eq(facePrivacyPreferences.userId, user.id),
    columns: { matchingEnabled: true },
  });
  if (!preferences?.matchingEnabled) {
    return NextResponse.json(
      { error: "Face matching is disabled in your privacy settings" },
      { status: 403 },
    );
  }
  if (body.mode === "blur") {
    const age = Date.now() - scan.createdAt.getTime();
    if (!scan.highQuality || age > 30 * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        {
          error: "A high-quality face scan from the last 30 days is required",
          needsScan: true,
        },
        { status: 422 },
      );
    }
  }

  const index = await ensureEventFaceIndex(body.eventId);
  if (!index.enabled) {
    return NextResponse.json(
      { error: "Face indexing is disabled for this event" },
      { status: 409 },
    );
  }
  if (!body.poll) {
    await queuePendingFaceMedia({ eventId: body.eventId, limit: 500 });
  }
  await syncFaceIndexJobs(100);
  const matches = await searchFaceScanInEvent({
    userId: user.id,
    scanId: scan.id,
    eventId: body.eventId,
    minSimilarity:
      body.mode === "blur" ? index.blurThreshold : index.suggestionThreshold,
    persistSuggestions: false,
  });
  const detectionIds = matches.map((match) => match.detectionId);
  const detections = detectionIds.length
    ? await db.query.mediaFaceDetections.findMany({
        where: inArray(mediaFaceDetections.id, detectionIds),
      })
    : [];
  const detectionById = new Map(detections.map((item) => [item.id, item]));

  const [[total], [ready]] = await Promise.all([
    db
      .select({ count: count() })
      .from(media)
      .where(
        and(
          eq(media.eventId, body.eventId),
          sql`${media.mimeType} like 'image/%'`,
        ),
      ),
    db
      .select({ count: count() })
      .from(mediaFaceScans)
      .innerJoin(media, eq(media.id, mediaFaceScans.mediaId))
      .where(
        and(
          eq(media.eventId, body.eventId),
          inArray(mediaFaceScans.status, ["ready", "skipped"]),
        ),
      ),
  ]);
  const currentIndex = await db.query.eventFaceIndexes.findFirst({
    where: eq(eventFaceIndexes.eventId, body.eventId),
  });
  if (!body.poll) {
    await auditLog(user.id, "view", "face_search", scan.id, {
      eventId: body.eventId,
      mode: body.mode ?? "filter",
      matches: matches.length,
    });
  }
  const progress = {
    indexed: ready?.count ?? 0,
    total: total?.count ?? 0,
    status: currentIndex?.status ?? "queued",
  };
  void publishFaceSearchProgress(body.eventId, progress);
  if (progress.total > 0 && progress.indexed >= progress.total) {
    void publishFaceSearchDone(body.eventId);
  }
  return NextResponse.json({
    scanId: scan.id,
    matches: matches.flatMap((match) => {
      const detection = detectionById.get(match.detectionId);
      if (!detection) return [];
      return [
        {
          ...match,
          region: {
            x: detection.boxX,
            y: detection.boxY,
            width: detection.boxWidth,
            height: detection.boxHeight,
          },
        },
      ];
    }),
    progress,
  });
}
