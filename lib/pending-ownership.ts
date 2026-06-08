import { and, eq, isNull, or } from "drizzle-orm";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { media, pendingMediaOwnership } from "@/lib/db/schema";

export const PENDING_REGISTRATION_USER_ID =
  "00000000-0000-0000-0000-0000000000ff";

export async function claimPendingOwnershipForUser(user: {
  id: string;
  hackclubId?: string | null;
  slackId?: string | null;
}) {
  if (!user.slackId && !user.hackclubId) return;

  const pending = await db.query.pendingMediaOwnership.findMany({
    where: and(
      or(
        user.slackId
          ? eq(pendingMediaOwnership.slackId, user.slackId)
          : undefined,
        user.hackclubId
          ? eq(pendingMediaOwnership.hackclubId, user.hackclubId)
          : undefined,
      ),
      isNull(pendingMediaOwnership.resolvedAt),
    ),
  });

  for (const grant of pending) {
    await db
      .update(media)
      .set({ uploadedById: user.id })
      .where(eq(media.id, grant.mediaId));

    await db
      .update(pendingMediaOwnership)
      .set({ resolvedAt: new Date(), resolvedById: user.id })
      .where(eq(pendingMediaOwnership.id, grant.id));

    await auditLog(user.id, "update", "media", grant.mediaId, {
      action: "claim_pending_ownership",
      pendingGrantId: grant.id,
      slackId: user.slackId,
      hackclubId: user.hackclubId,
    });
  }
}
