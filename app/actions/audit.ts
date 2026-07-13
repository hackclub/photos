"use server";
import { count, desc, ilike, or, sql } from "drizzle-orm";
import { getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
export async function searchAuditLogs(query: string, offset = 0, limit = 50) {
  try {
    const { user } = await getUserContext();
    if (!user || !user.isGlobalAdmin) {
      return { success: false, error: "Unauthorized" };
    }
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.floor(limit)))
      : 50;
    const safeOffset = Number.isFinite(offset)
      ? Math.max(0, Math.min(100_000, Math.floor(offset)))
      : 0;
    const searchConditions = query
      ? or(
          sql`cast(${auditLogs.action} as text) ilike ${`%${query}%`}`,
          ilike(auditLogs.resourceType, `%${query}%`),
          ilike(auditLogs.resourceId, `%${query}%`),
          ilike(auditLogs.ipAddress, `%${query}%`),
          ilike(auditLogs.userAgent, `%${query}%`),
          sql`cast(${auditLogs.details} as text) ilike ${`%${query}%`}`,
        )
      : undefined;
    const [totalResult] = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(searchConditions);
    const logs = await db.query.auditLogs.findMany({
      where: searchConditions,
      orderBy: [desc(auditLogs.createdAt)],
      limit: safeLimit,
      offset: safeOffset,
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            handle: true,
            preferredName: true,
            slackId: true,
          },
        },
      },
    });
    return { success: true, logs, totalCount: totalResult.count };
  } catch (error) {
    logger.error("Error searching audit logs:", error);
    return { success: false, error: "Failed to search logs" };
  }
}
