import { and, eq, isNull } from "drizzle-orm";
import { auditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  eventAdmins,
  pendingEventAdmins,
  pendingSeriesAdmins,
  seriesAdmins,
} from "@/lib/db/schema";

async function ensureEventAdmin(eventId: string, userId: string) {
  const existing = await db.query.eventAdmins.findFirst({
    where: and(
      eq(eventAdmins.eventId, eventId),
      eq(eventAdmins.userId, userId),
    ),
    columns: { id: true },
  });
  if (!existing) {
    await db.insert(eventAdmins).values({ eventId, userId });
  }
}

async function ensureSeriesAdmin(seriesId: string, userId: string) {
  const existing = await db.query.seriesAdmins.findFirst({
    where: and(
      eq(seriesAdmins.seriesId, seriesId),
      eq(seriesAdmins.userId, userId),
    ),
    columns: { id: true },
  });
  if (!existing) {
    await db.insert(seriesAdmins).values({ seriesId, userId });
  }
}

export async function claimPendingAdminGrantsForUser(user: {
  id: string;
  slackId?: string | null;
}) {
  if (!user.slackId) return;

  const pendingEvents = await db.query.pendingEventAdmins.findMany({
    where: and(
      eq(pendingEventAdmins.slackId, user.slackId),
      isNull(pendingEventAdmins.claimedAt),
    ),
  });
  const pendingSeries = await db.query.pendingSeriesAdmins.findMany({
    where: and(
      eq(pendingSeriesAdmins.slackId, user.slackId),
      isNull(pendingSeriesAdmins.claimedAt),
    ),
  });

  for (const grant of pendingEvents) {
    await ensureEventAdmin(grant.eventId, user.id);
    await db
      .update(pendingEventAdmins)
      .set({ claimedById: user.id, claimedAt: new Date() })
      .where(eq(pendingEventAdmins.id, grant.id));
    await auditLog(user.id, "update", "event", grant.eventId, {
      action: "claim_pending_admin",
      pendingGrantId: grant.id,
      slackId: user.slackId,
    });
  }

  for (const grant of pendingSeries) {
    await ensureSeriesAdmin(grant.seriesId, user.id);
    await db
      .update(pendingSeriesAdmins)
      .set({ claimedById: user.id, claimedAt: new Date() })
      .where(eq(pendingSeriesAdmins.id, grant.id));
    await auditLog(user.id, "update", "series", grant.seriesId, {
      action: "claim_pending_admin",
      pendingGrantId: grant.id,
      slackId: user.slackId,
    });
  }
}
