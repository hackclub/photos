import { and, eq, isNull } from "drizzle-orm";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { media, pendingMediaOwnership } from "@/lib/db/schema";

export const PENDING_REGISTRATION_USER_ID =
  "00000000-0000-0000-0000-0000000000ff";

export async function claimPendingOwnershipForUser(user: {
  id: string;
  slackId?: string | null;
}) {
  if (!user.slackId) return;

  const pending = await db.query.pendingMediaOwnership.findMany({
    where: and(
      eq(pendingMediaOwnership.slackId, user.slackId),
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
    });
  }
}
