import "server-only";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  eventParticipants,
  facePrivacyPreferences,
  faceScans,
} from "@/lib/db/schema";
import { decryptFaceTemplate, encryptFaceTemplate } from "@/lib/face-crypto";
import {
  ensureEventFaceIndex,
  prepareJoinedEventFaceMatching,
  queuePendingFaceMedia,
} from "@/lib/face-indexing";
import { logger } from "@/lib/logger";
import { can, type UserContext } from "@/lib/policy";
import {
  compareVisionTemplates,
  verifyFaceLiveness,
} from "@/lib/vision-client";

export class FaceScanError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

export async function createFaceScanForUser(input: {
  user: UserContext;
  eventId: string;
  frames: Buffer[];
  highQuality: boolean;
  autoSuggestions: boolean;
}) {
  if (!(await can(input.user, "view", "event", input.eventId))) {
    throw new FaceScanError("Event not found", 404);
  }

  const verification = await verifyFaceLiveness(
    input.frames.map((frame) => frame.toString("base64")),
    input.highQuality,
  );
  if (!verification.ok) {
    throw new FaceScanError(
      "Face capture did not pass verification",
      422,
      verification.reason,
    );
  }

  const activeScan = await db.query.faceScans.findFirst({
    where: and(
      eq(faceScans.userId, input.user.id),
      eq(faceScans.isActive, true),
      eq(faceScans.status, "ready"),
    ),
  });
  if (activeScan?.templateEncrypted) {
    const comparison = await compareVisionTemplates(
      decryptFaceTemplate(activeScan.templateEncrypted),
      verification.template,
    );
    if (comparison.similarity < 0.55) {
      throw new FaceScanError(
        "This capture does not match your existing face scan",
        422,
        "FACE_MISMATCH",
      );
    }
  }

  const scan = await db.transaction(async (tx) => {
    await tx
      .update(faceScans)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(faceScans.userId, input.user.id));
    const [created] = await tx
      .insert(faceScans)
      .values({
        userId: input.user.id,
        status: "ready",
        isActive: true,
        highQuality: input.highQuality,
        templateEncrypted: encryptFaceTemplate(verification.template),
        quality: verification.face.quality,
        spoof: verification.spoof,
        spoofQuality: verification.spoofQuality,
        completedAt: new Date(),
      })
      .returning({
        id: faceScans.id,
        quality: faceScans.quality,
        highQuality: faceScans.highQuality,
        createdAt: faceScans.createdAt,
      });
    await tx
      .insert(facePrivacyPreferences)
      .values({
        userId: input.user.id,
        matchingEnabled: true,
        autoSuggestionsEnabled: input.autoSuggestions,
        consentedAt: new Date(),
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: facePrivacyPreferences.userId,
        set: {
          matchingEnabled: true,
          autoSuggestionsEnabled: input.autoSuggestions,
          consentedAt: new Date(),
          revokedAt: null,
          updatedAt: new Date(),
        },
      });
    return created!;
  });

  after(async () => {
    try {
      await auditLog(input.user.id, "create", "face_scan", scan.id, {
        highQuality: input.highQuality,
        autoSuggestions: input.autoSuggestions,
      });
      const eventIndex = await ensureEventFaceIndex(input.eventId);
      if (eventIndex.enabled) {
        await queuePendingFaceMedia({ eventId: input.eventId, limit: 500 });
      }
      const joinedEvents = await db.query.eventParticipants.findMany({
        where: eq(eventParticipants.userId, input.user.id),
        columns: { eventId: true },
      });
      for (const joined of joinedEvents) {
        await prepareJoinedEventFaceMatching(
          joined.eventId,
          input.user.id,
        ).catch((error) =>
          logger.error("Failed to refresh face suggestions", error),
        );
      }
    } catch (error) {
      logger.error("Failed to schedule work after face enrollment", error);
    }
  });

  return scan;
}
