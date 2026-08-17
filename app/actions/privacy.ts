"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventParticipants,
  faceBlurSubscriptions,
  faceMatchSuggestions,
  facePrivacyPreferences,
  faceScans,
  mediaMentions,
} from "@/lib/db/schema";
import { prepareJoinedEventFaceMatching } from "@/lib/face-indexing";
import { logger } from "@/lib/logger";

async function requireUser() {
  const session = await getSession();
  if (!session?.id) throw new Error("Unauthorized");
  return session.id;
}

export async function getPrivacyOverview() {
  const userId = await requireUser();
  const [preferences, [scans], [suggestions], [mentions]] = await Promise.all([
    db.query.facePrivacyPreferences.findFirst({
      where: eq(facePrivacyPreferences.userId, userId),
    }),
    db
      .select({ count: count() })
      .from(faceScans)
      .where(eq(faceScans.userId, userId)),
    db
      .select({ count: count() })
      .from(faceMatchSuggestions)
      .where(eq(faceMatchSuggestions.userId, userId)),
    db
      .select({ count: count() })
      .from(mediaMentions)
      .where(eq(mediaMentions.userId, userId)),
  ]);
  return {
    preferences: preferences ?? {
      matchingEnabled: false,
      autoSuggestionsEnabled: true,
      hideProfile: false,
      hideMentions: false,
      hideAiSuggestions: false,
    },
    counts: {
      faceScans: scans?.count ?? 0,
      faceSuggestions: suggestions?.count ?? 0,
      mentions: mentions?.count ?? 0,
    },
  };
}

export async function updatePrivacyPreferences(input: {
  matchingEnabled: boolean;
  autoSuggestionsEnabled: boolean;
  hideProfile: boolean;
  hideMentions: boolean;
  hideAiSuggestions: boolean;
}) {
  const userId = await requireUser();
  const now = new Date();
  const previous = await db.query.facePrivacyPreferences.findFirst({
    where: eq(facePrivacyPreferences.userId, userId),
    columns: { matchingEnabled: true, autoSuggestionsEnabled: true },
  });
  await db.transaction(async (tx) => {
    await tx
      .insert(facePrivacyPreferences)
      .values({
        userId,
        ...input,
        consentedAt: input.matchingEnabled ? now : null,
        revokedAt: input.matchingEnabled ? null : now,
      })
      .onConflictDoUpdate({
        target: facePrivacyPreferences.userId,
        set: {
          ...input,
          consentedAt: input.matchingEnabled ? now : undefined,
          revokedAt: input.matchingEnabled ? null : now,
          updatedAt: now,
        },
      });
    if (!input.matchingEnabled) {
      await tx
        .delete(faceMatchSuggestions)
        .where(
          and(
            eq(faceMatchSuggestions.userId, userId),
            eq(faceMatchSuggestions.status, "pending"),
          ),
        );
      await tx
        .update(faceBlurSubscriptions)
        .set({ active: false, updatedAt: now })
        .where(eq(faceBlurSubscriptions.userId, userId));
    }
  });
  await auditLog(userId, "update", "privacy_preferences", userId, input);
  if (
    input.matchingEnabled &&
    input.autoSuggestionsEnabled &&
    (!previous?.matchingEnabled || !previous.autoSuggestionsEnabled)
  ) {
    after(async () => {
      const joinedEvents = await db.query.eventParticipants.findMany({
        where: eq(eventParticipants.userId, userId),
        columns: { eventId: true },
      });
      for (const event of joinedEvents) {
        await prepareJoinedEventFaceMatching(event.eventId, userId).catch(
          (error) => logger.error("Failed to refresh face suggestions", error),
        );
      }
    });
  }
  revalidatePath("/users/[username]", "page");
  return { success: true };
}

export async function deleteAllFaceData() {
  const userId = await requireUser();
  await db.transaction(async (tx) => {
    await tx
      .delete(faceBlurSubscriptions)
      .where(eq(faceBlurSubscriptions.userId, userId));
    await tx.delete(faceScans).where(eq(faceScans.userId, userId));
    await tx
      .insert(facePrivacyPreferences)
      .values({
        userId,
        matchingEnabled: false,
        autoSuggestionsEnabled: false,
        revokedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: facePrivacyPreferences.userId,
        set: {
          matchingEnabled: false,
          autoSuggestionsEnabled: false,
          revokedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  });
  await auditLog(userId, "delete", "face_data", userId);
  revalidatePath("/users/[username]", "page");
  return { success: true };
}
