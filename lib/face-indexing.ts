import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  blurRequests,
  eventFaceIndexes,
  eventParticipants,
  events,
  faceBlurSubscriptions,
  faceMatchSuggestions,
  facePrivacyPreferences,
  faceScans,
  faceSystemSettings,
  media,
  mediaFaceDetections,
  mediaFaceScans,
} from "@/lib/db/schema";
import { decryptFaceTemplate, encryptFaceTemplate } from "@/lib/face-crypto";
import { logger } from "@/lib/logger";
import {
  cancelVisionJob,
  createFaceDetectionJob,
  createVisionGallery,
  deleteVisionGallery,
  enrollVisionTemplate,
  getVisionJob,
  searchVisionGallery,
  type VisionFace,
  VisionRequestError,
} from "@/lib/vision-client";

export async function getFaceSystemSettings() {
  await db
    .insert(faceSystemSettings)
    .values({ id: "global" })
    .onConflictDoNothing();
  return (await db.query.faceSystemSettings.findFirst({
    where: eq(faceSystemSettings.id, "global"),
  }))!;
}

export async function ensureEventFaceIndex(
  eventId: string,
  options: { enableDisabled?: boolean } = {},
) {
  const existing = await db.query.eventFaceIndexes.findFirst({
    where: eq(eventFaceIndexes.eventId, eventId),
  });
  if (existing?.galleryId) {
    if (!existing.enabled && options.enableDisabled) {
      await db
        .update(eventFaceIndexes)
        .set({ enabled: true, status: "queued", updatedAt: new Date() })
        .where(eq(eventFaceIndexes.eventId, eventId));
    }
    return {
      ...existing,
      enabled: existing.enabled || options.enableDisabled === true,
    };
  }
  if (existing && !existing.enabled && !options.enableDisabled) return existing;

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: { id: true, name: true },
  });
  if (!event) throw new Error("Event not found");
  const settings = await getFaceSystemSettings();
  const { galleryId } = await createVisionGallery(
    `event:${event.id}:${event.name}`,
  );
  await db
    .insert(eventFaceIndexes)
    .values({
      eventId,
      enabled: true,
      status: "queued",
      galleryId,
      algorithm: settings.algorithm,
      maxFaces: settings.maxFaces,
      suggestionThreshold: settings.suggestionThreshold,
      blurThreshold: settings.blurThreshold,
      requestedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: eventFaceIndexes.eventId,
      set: {
        enabled: options.enableDisabled ?? true,
        status: "queued",
        galleryId,
        updatedAt: new Date(),
      },
    });
  return (await db.query.eventFaceIndexes.findFirst({
    where: eq(eventFaceIndexes.eventId, eventId),
  }))!;
}

export async function queueMediaForFaceIndexing(
  mediaId: string,
  options: { force?: boolean } = {},
) {
  const settings = await getFaceSystemSettings();
  if (settings.paused) return { queued: false, reason: "paused" as const };
  const item = await db.query.media.findFirst({
    where: eq(media.id, mediaId),
    columns: { id: true, eventId: true, mimeType: true, s3Key: true },
  });
  if (!item?.mimeType.startsWith("image/")) {
    return { queued: false, reason: "not_image" as const };
  }

  let eventIndex = await db.query.eventFaceIndexes.findFirst({
    where: eq(eventFaceIndexes.eventId, item.eventId),
  });
  if (!eventIndex?.enabled) {
    if (eventIndex && !eventIndex.enabled) {
      return { queued: false, reason: "disabled" as const };
    }
    if (!options.force && !settings.scanNewUploads) {
      return { queued: false, reason: "disabled" as const };
    }
    eventIndex = await ensureEventFaceIndex(item.eventId);
    if (!eventIndex.enabled) {
      return { queued: false, reason: "disabled" as const };
    }
  }

  const existing = await db.query.mediaFaceScans.findFirst({
    where: eq(mediaFaceScans.mediaId, item.id),
  });
  if (!options.force && (existing?.attemptCount ?? 0) >= 3) {
    return { queued: false, reason: "retry_limit" as const };
  }
  if (
    !options.force &&
    existing?.status === "ready" &&
    existing.eventIndexRevision === eventIndex.revision
  ) {
    return { queued: false, reason: "ready" as const };
  }

  const attempt = (existing?.attemptCount ?? 0) + 1;
  const sourceHash = createHash("sha256")
    .update(item.s3Key)
    .digest("hex")
    .slice(0, 12);
  const requestedJobId = `face-${item.id}-${eventIndex.revision}-${attempt}-${sourceHash}`;
  const { jobId } = await createFaceDetectionJob({
    jobId: requestedJobId,
    s3Key: item.s3Key,
    algorithm: eventIndex.algorithm,
    maxFaces: eventIndex.maxFaces,
    minQuality: eventIndex.minQuality,
  });
  await db
    .insert(mediaFaceScans)
    .values({
      mediaId: item.id,
      status: "queued",
      eventIndexRevision: eventIndex.revision,
      algorithm: eventIndex.algorithm,
      sourceS3Key: item.s3Key,
      workerJobId: jobId,
      attemptCount: attempt,
    })
    .onConflictDoUpdate({
      target: mediaFaceScans.mediaId,
      set: {
        status: "queued",
        eventIndexRevision: eventIndex.revision,
        algorithm: eventIndex.algorithm,
        sourceS3Key: item.s3Key,
        workerJobId: jobId,
        attemptCount: attempt,
        lastError: null,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    });
  await db
    .update(eventFaceIndexes)
    .set({ status: "indexing", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(eventFaceIndexes.eventId, item.eventId));
  return { queued: true, jobId };
}

export async function queuePendingFaceMedia(options: {
  eventId?: string;
  force?: boolean;
  limit?: number;
}) {
  const conditions = [sql`${media.mimeType} like 'image/%'`];
  if (options.eventId) conditions.push(eq(media.eventId, options.eventId));
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .leftJoin(mediaFaceScans, eq(mediaFaceScans.mediaId, media.id))
    .where(
      and(
        ...conditions,
        options.force
          ? undefined
          : sql`${mediaFaceScans.mediaId} is null or ${mediaFaceScans.status} in ('failed', 'cancelled')`,
      ),
    )
    .limit(options.limit ?? 500);

  let queued = 0;
  for (const row of rows) {
    try {
      const result = await queueMediaForFaceIndexing(row.id, {
        force: options.force ?? false,
      });
      if (result.queued) queued++;
    } catch (error) {
      logger.error(`Failed to queue face indexing for ${row.id}`, error);
    }
  }
  return { queued, found: rows.length };
}

export async function rebuildEventFaceIndex(eventId: string) {
  const [index, event] = await Promise.all([
    db.query.eventFaceIndexes.findFirst({
      where: eq(eventFaceIndexes.eventId, eventId),
    }),
    db.query.events.findFirst({
      where: eq(events.id, eventId),
      columns: { id: true, name: true },
    }),
  ]);
  if (!index?.enabled) return { queued: 0, found: 0 };
  if (!event) throw new Error("Event not found");
  const replacement = await createVisionGallery(
    `event:${event.id}:${event.name}:revision-${index.revision + 1}`,
  );
  const eventMedia = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.eventId, eventId));
  try {
    await db.transaction(async (tx) => {
      if (eventMedia.length > 0) {
        await tx.delete(mediaFaceScans).where(
          inArray(
            mediaFaceScans.mediaId,
            eventMedia.map((item) => item.id),
          ),
        );
      }
      const [swapped] = await tx
        .update(eventFaceIndexes)
        .set({
          galleryId: replacement.galleryId,
          status: "queued",
          revision: index.revision + 1,
          indexedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(eventFaceIndexes.eventId, eventId),
            eq(eventFaceIndexes.revision, index.revision),
          ),
        )
        .returning({ eventId: eventFaceIndexes.eventId });
      if (!swapped) throw new Error("Face index changed during rebuild");
    });
  } catch (error) {
    await deleteVisionGallery(replacement.galleryId).catch(() => undefined);
    throw error;
  }
  if (index.galleryId) {
    await deleteVisionGallery(index.galleryId).catch((error) =>
      logger.error(
        `Failed to delete stale face gallery ${index.galleryId}`,
        error,
      ),
    );
  }
  return queuePendingFaceMedia({ eventId, limit: 500 });
}

function normalizeFace(face: VisionFace) {
  const detection = face.detection;
  const imageWidth = detection.image_width || 1;
  const imageHeight = detection.image_height || 1;
  return {
    boxX: Math.max(0, (detection.x - detection.width / 2) / imageWidth),
    boxY: Math.max(0, (detection.y - detection.height / 2) / imageHeight),
    boxWidth: Math.min(1, detection.width / imageWidth),
    boxHeight: Math.min(1, detection.height / imageHeight),
  };
}

async function persistCompletedJob(
  row: typeof mediaFaceScans.$inferSelect,
  faces: VisionFace[],
) {
  const jobId = row.workerJobId;
  if (!jobId) return false;
  const currentScan = await db.query.mediaFaceScans.findFirst({
    where: and(
      eq(mediaFaceScans.mediaId, row.mediaId),
      eq(mediaFaceScans.workerJobId, jobId),
      eq(mediaFaceScans.eventIndexRevision, row.eventIndexRevision),
      eq(mediaFaceScans.sourceS3Key, row.sourceS3Key),
    ),
  });
  if (!currentScan) return false;
  const item = await db.query.media.findFirst({
    where: eq(media.id, row.mediaId),
    columns: { id: true, eventId: true },
  });
  if (!item) return false;
  const eventIndex = await db.query.eventFaceIndexes.findFirst({
    where: eq(eventFaceIndexes.eventId, item.eventId),
  });
  if (
    !eventIndex?.galleryId ||
    !eventIndex.enabled ||
    eventIndex.revision !== row.eventIndexRevision
  ) {
    return false;
  }

  const detections = faces
    .filter((face) => face.template && face.detection)
    .map((face, faceIndex) => ({
      id: randomUUID(),
      mediaId: item.id,
      faceIndex,
      ...normalizeFace(face),
      rotation: face.detection.rotation,
      confidence: face.detection.confidence,
      quality: Number.isFinite(face.quality) ? face.quality : null,
      templateEncrypted: encryptFaceTemplate(face.template),
      template: face.template,
    }));

  await db.transaction(async (tx) => {
    await tx
      .delete(mediaFaceDetections)
      .where(eq(mediaFaceDetections.mediaId, item.id));
    if (detections.length > 0) {
      await tx
        .insert(mediaFaceDetections)
        .values(
          detections.map(({ template: _template, ...detection }) => detection),
        );
    }
    const [claimed] = await tx
      .update(mediaFaceScans)
      .set({
        status: "processing",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaFaceScans.mediaId, item.id),
          eq(mediaFaceScans.workerJobId, jobId),
          eq(mediaFaceScans.eventIndexRevision, row.eventIndexRevision),
        ),
      )
      .returning({ mediaId: mediaFaceScans.mediaId });
    if (!claimed) throw new Error("Stale face indexing job");
  });

  try {
    for (const detection of detections) {
      await enrollVisionTemplate(eventIndex.galleryId, detection.template, {
        detectionId: detection.id,
        mediaId: detection.mediaId,
      });
    }
  } catch (error) {
    await db
      .update(mediaFaceScans)
      .set({
        status: "failed",
        lastError: "Could not enroll detected faces",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaFaceScans.mediaId, item.id),
          eq(mediaFaceScans.workerJobId, jobId),
        ),
      );
    throw error;
  }
  await db
    .update(mediaFaceScans)
    .set({
      status: "ready",
      completedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaFaceScans.mediaId, item.id),
        eq(mediaFaceScans.workerJobId, jobId),
      ),
    );
  const [remaining] = await db
    .select({ count: count() })
    .from(media)
    .leftJoin(mediaFaceScans, eq(mediaFaceScans.mediaId, media.id))
    .where(
      and(
        eq(media.eventId, item.eventId),
        sql`${media.mimeType} like 'image/%'`,
        sql`(${mediaFaceScans.mediaId} is null or ${mediaFaceScans.status} != 'ready' or ${mediaFaceScans.eventIndexRevision} != ${eventIndex.revision})`,
      ),
    );
  if ((remaining?.count ?? 0) === 0) {
    await db
      .update(eventFaceIndexes)
      .set({ status: "ready", indexedAt: new Date(), updatedAt: new Date() })
      .where(eq(eventFaceIndexes.eventId, item.eventId));
    await refreshEventFaceSuggestions(item.eventId);
  }
  return true;
}

export async function syncFaceIndexJobs(limit = 100) {
  const rows = await db.query.mediaFaceScans.findMany({
    where: inArray(mediaFaceScans.status, ["queued", "processing"]),
    limit,
  });
  const summary = { checked: rows.length, completed: 0, failed: 0 };
  for (const row of rows) {
    const jobId = row.workerJobId;
    if (!jobId) continue;
    try {
      const job = await getVisionJob(jobId);
      if (["active", "waiting", "delayed", "paused"].includes(job.status)) {
        if (job.status === "active") {
          await db
            .update(mediaFaceScans)
            .set({
              status: "processing",
              startedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(mediaFaceScans.mediaId, row.mediaId),
                eq(mediaFaceScans.workerJobId, jobId),
              ),
            );
        }
        continue;
      }
      if (job.status === "failed") {
        await db
          .update(mediaFaceScans)
          .set({
            status: job.error === "Cancelled" ? "cancelled" : "failed",
            lastError: job.error?.slice(0, 500) ?? "Vision job failed",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(mediaFaceScans.mediaId, row.mediaId),
              eq(mediaFaceScans.workerJobId, jobId),
            ),
          );
        summary.failed++;
        continue;
      }
      if (job.status === "completed") {
        const persisted = await persistCompletedJob(
          row,
          job.result?.faces ?? [],
        );
        await cancelVisionJob(jobId).catch(() => undefined);
        if (persisted) summary.completed++;
      }
    } catch (error) {
      if (error instanceof VisionRequestError && error.status === 404) {
        await db
          .update(mediaFaceScans)
          .set({
            status: "failed",
            lastError: "Vision job expired before synchronization",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(mediaFaceScans.mediaId, row.mediaId),
              eq(mediaFaceScans.workerJobId, jobId),
            ),
          );
        summary.failed++;
        continue;
      }
      logger.error(`Failed to synchronize face job ${jobId}`, error);
    }
  }
  return summary;
}

export async function searchFaceScanInEvent(options: {
  userId: string;
  scanId: string;
  eventId: string;
  minSimilarity?: number;
  persistSuggestions?: boolean;
  maxPhotoAgeYears?: number;
}) {
  const [scan, eventIndex] = await Promise.all([
    db.query.faceScans.findFirst({
      where: and(
        eq(faceScans.id, options.scanId),
        eq(faceScans.userId, options.userId),
        eq(faceScans.status, "ready"),
      ),
    }),
    db.query.eventFaceIndexes.findFirst({
      where: and(
        eq(eventFaceIndexes.eventId, options.eventId),
        eq(eventFaceIndexes.enabled, true),
      ),
    }),
  ]);
  if (!scan?.templateEncrypted) throw new Error("Face scan not found");
  if (!eventIndex?.galleryId) return [];
  const result = await searchVisionGallery(
    eventIndex.galleryId,
    decryptFaceTemplate(scan.templateEncrypted),
    {
      minSimilarity: options.minSimilarity ?? eventIndex.suggestionThreshold,
      maxResults: 5000,
    },
  );
  let matches = result.candidates.flatMap((candidate) => {
    const detectionId = candidate.metadata?.detectionId;
    const mediaId = candidate.metadata?.mediaId;
    if (!detectionId || !mediaId) return [];
    return [{ detectionId, mediaId, similarity: candidate.similarity }];
  });

  if (options.maxPhotoAgeYears && matches.length > 0) {
    const mediaDates = await db.query.media.findMany({
      where: inArray(
        media.id,
        matches.map((match) => match.mediaId),
      ),
      columns: { id: true, takenAt: true, uploadedAt: true },
    });
    const dateByMediaId = new Map(
      mediaDates.map((item) => [item.id, item.takenAt ?? item.uploadedAt]),
    );
    const maxAge = options.maxPhotoAgeYears * 365.25 * 24 * 60 * 60 * 1000;
    matches = matches.filter((match) => {
      const capturedAt = dateByMediaId.get(match.mediaId);
      return capturedAt
        ? Math.abs(scan.createdAt.getTime() - capturedAt.getTime()) <= maxAge
        : false;
    });
  }

  if (options.persistSuggestions !== false) {
    const pendingSuggestions = await db
      .select({
        id: faceMatchSuggestions.id,
        detectionId: faceMatchSuggestions.detectionId,
      })
      .from(faceMatchSuggestions)
      .innerJoin(media, eq(media.id, faceMatchSuggestions.mediaId))
      .where(
        and(
          eq(faceMatchSuggestions.userId, options.userId),
          eq(faceMatchSuggestions.status, "pending"),
          eq(media.eventId, options.eventId),
        ),
      );
    const currentDetectionIds = new Set(
      matches.map((match) => match.detectionId),
    );
    const staleSuggestionIds = pendingSuggestions
      .filter((suggestion) => !currentDetectionIds.has(suggestion.detectionId))
      .map((suggestion) => suggestion.id);
    if (staleSuggestionIds.length > 0) {
      await db
        .delete(faceMatchSuggestions)
        .where(inArray(faceMatchSuggestions.id, staleSuggestionIds));
    }
    for (const match of matches) {
      await db
        .insert(faceMatchSuggestions)
        .values({
          userId: options.userId,
          faceScanId: scan.id,
          detectionId: match.detectionId,
          mediaId: match.mediaId,
          similarity: match.similarity,
        })
        .onConflictDoUpdate({
          target: [
            faceMatchSuggestions.userId,
            faceMatchSuggestions.detectionId,
          ],
          set: {
            faceScanId: scan.id,
            similarity: match.similarity,
            updatedAt: new Date(),
          },
        });
    }
  }
  return matches;
}

export async function refreshEventFaceSuggestions(
  eventId: string,
  onlyUserId?: string,
) {
  const settings = await getFaceSystemSettings();
  const eventIndex = await db.query.eventFaceIndexes.findFirst({
    where: eq(eventFaceIndexes.eventId, eventId),
  });
  if (!eventIndex) return { users: 0, matches: 0 };
  const participants = await db
    .select({
      userId: eventParticipants.userId,
      scanId: faceScans.id,
      autoSuggestionsEnabled: facePrivacyPreferences.autoSuggestionsEnabled,
    })
    .from(eventParticipants)
    .innerJoin(
      faceScans,
      and(
        eq(faceScans.userId, eventParticipants.userId),
        eq(faceScans.isActive, true),
        eq(faceScans.status, "ready"),
      ),
    )
    .innerJoin(
      facePrivacyPreferences,
      and(
        eq(facePrivacyPreferences.userId, eventParticipants.userId),
        eq(facePrivacyPreferences.matchingEnabled, true),
      ),
    )
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        onlyUserId ? eq(eventParticipants.userId, onlyUserId) : undefined,
      ),
    );

  let matches = 0;
  for (const participant of participants) {
    try {
      const userMatches = await searchFaceScanInEvent({
        userId: participant.userId,
        scanId: participant.scanId,
        eventId,
        maxPhotoAgeYears: 2,
        persistSuggestions:
          settings.autoSuggestions && participant.autoSuggestionsEnabled,
      });
      matches += userMatches.length;
      await createAutomaticFaceBlurRequests({
        eventId,
        userId: participant.userId,
        scanId: participant.scanId,
        blurThreshold: eventIndex.blurThreshold,
      });
    } catch (error) {
      logger.error(
        `Failed to refresh face suggestions for ${participant.userId}`,
        error,
      );
    }
  }
  return { users: participants.length, matches };
}

export async function prepareJoinedEventFaceMatching(
  eventId: string,
  userId: string,
) {
  const [scan, preferences, blurSubscription] = await Promise.all([
    db.query.faceScans.findFirst({
      where: and(
        eq(faceScans.userId, userId),
        eq(faceScans.isActive, true),
        eq(faceScans.status, "ready"),
      ),
      columns: { id: true },
    }),
    db.query.facePrivacyPreferences.findFirst({
      where: eq(facePrivacyPreferences.userId, userId),
    }),
    db.query.faceBlurSubscriptions.findFirst({
      where: and(
        eq(faceBlurSubscriptions.eventId, eventId),
        eq(faceBlurSubscriptions.userId, userId),
        eq(faceBlurSubscriptions.active, true),
      ),
      columns: { userId: true },
    }),
  ]);
  if (
    !scan ||
    !preferences?.matchingEnabled ||
    (!preferences.autoSuggestionsEnabled && !blurSubscription)
  ) {
    return;
  }
  await ensureEventFaceIndex(eventId);
  const queued = await queuePendingFaceMedia({ eventId, limit: 500 });
  if (queued.queued === 0) await refreshEventFaceSuggestions(eventId, userId);
}

async function createAutomaticFaceBlurRequests(options: {
  eventId: string;
  userId: string;
  scanId: string;
  blurThreshold: number;
}) {
  const subscription = await db.query.faceBlurSubscriptions.findFirst({
    where: and(
      eq(faceBlurSubscriptions.eventId, options.eventId),
      eq(faceBlurSubscriptions.userId, options.userId),
      eq(faceBlurSubscriptions.active, true),
    ),
  });
  if (!subscription) return;
  const matches = await searchFaceScanInEvent({
    userId: options.userId,
    scanId: options.scanId,
    eventId: options.eventId,
    minSimilarity: options.blurThreshold,
    persistSuggestions: false,
  });
  const eligible = matches.filter(
    (match) => match.similarity >= options.blurThreshold,
  );
  if (eligible.length === 0) return;
  const [detections, mediaRows] = await Promise.all([
    db.query.mediaFaceDetections.findMany({
      where: inArray(
        mediaFaceDetections.id,
        eligible.map((match) => match.detectionId),
      ),
    }),
    db.query.media.findMany({
      where: inArray(
        media.id,
        eligible.map((match) => match.mediaId),
      ),
    }),
  ]);
  const detectionById = new Map(detections.map((item) => [item.id, item]));
  const mediaById = new Map(mediaRows.map((item) => [item.id, item]));
  for (const match of eligible) {
    const detection = detectionById.get(match.detectionId);
    const item = mediaById.get(match.mediaId);
    if (!detection || !item || item.uploadedAt <= subscription.createdAt) {
      continue;
    }
    const existing = await db.query.blurRequests.findFirst({
      where: and(
        eq(blurRequests.requesterId, options.userId),
        eq(blurRequests.mediaId, item.id),
      ),
      columns: { id: true },
    });
    if (existing) continue;
    const region = expandedDetectionRegion(detection);
    await db
      .insert(blurRequests)
      .values({
        id: randomUUID(),
        mediaId: item.id,
        requesterId: options.userId,
        status: "pending",
        source: "automatic_face",
        faceScanId: options.scanId,
        faceDetectionId: detection.id,
        regions: [region],
        // Pending automatic requests do not need a duplicate preview artifact.
        // Approval renders the final blur from the current source image.
        blurredS3Key: item.s3Key,
        blurredThumbnailS3Key: item.thumbnailS3Key,
      })
      .onConflictDoNothing();
  }
}

function expandedDetectionRegion(detection: {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
}) {
  const margin = detection.boxWidth < 0.08 ? 0.38 : 0.24;
  const x = Math.max(0, detection.boxX - detection.boxWidth * margin);
  const y = Math.max(0, detection.boxY - detection.boxHeight * (margin + 0.12));
  const right = Math.min(1, detection.boxX + detection.boxWidth * (1 + margin));
  const bottom = Math.min(
    1,
    detection.boxY + detection.boxHeight * (1 + margin + 0.08),
  );
  return { x, y, width: right - x, height: bottom - y };
}
