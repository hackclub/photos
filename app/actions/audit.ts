"use server";
import { count, desc, ilike, or, sql } from "drizzle-orm";
import { getUserContext } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
export async function searchAuditLogs(query: string, offset = 0, limit = 50) {
  try {
    const { user } = await getUserContext();
    if (!user || !user.isGlobalAdmin) {
      return { success: false, error: "Unauthorized" };
    }
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
      limit,
      offset,
      with: {
        user: true,
      },
    });
    return { success: true, logs, totalCount: totalResult.count };
  } catch (error) {
    console.error("Error searching audit logs:", error);
    return { success: false, error: "Failed to search logs" };
  }
}
