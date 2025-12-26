import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, media, users } from "@/lib/db/schema";
import { getUserContext } from "@/lib/policy";
export const DEFAULT_STORAGE_LIMIT = 20 * 1024 * 1024 * 1024;
export const UNLIMITED_STORAGE = -1;
export async function getUserStorageUsage(userId: string): Promise<number> {
  const result = await db
    .select({
      totalSize: sql<number>`coalesce(sum(${media.fileSize}), 0)`,
    })
    .from(media)
    .where(eq(media.uploadedById, userId));
  return Number(result[0]?.totalSize || 0);
}
export async function checkStorageLimit(
  userId: string,
  newFileSize: number,
): Promise<{
  allowed: boolean;
  currentUsage: number;
  limit: number;
  isUnlimited: boolean;
}> {
  const userContext = await getUserContext(userId);
  if (!userContext) {
    throw new Error("User not found");
  }
  if (userContext.isBanned) {
    return {
      allowed: false,
      currentUsage: 0,
      limit: 0,
      isUnlimited: false,
    };
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      storageLimit: true,
    },
  });
  if (!user) {
    throw new Error("User not found");
  }
  if (userContext.isGlobalAdmin) {
    return {
      allowed: true,
      currentUsage: 0,
      limit: UNLIMITED_STORAGE,
      isUnlimited: true,
    };
  }
  const limit = user.storageLimit;
  const isUnlimited = limit === UNLIMITED_STORAGE;
  if (isUnlimited) {
    return {
      allowed: true,
      currentUsage: 0,
      limit: UNLIMITED_STORAGE,
      isUnlimited: true,
    };
  }
  const currentUsage = await getUserStorageUsage(userId);
  if (currentUsage + newFileSize > limit) {
    return { allowed: false, currentUsage, limit, isUnlimited: false };
  }
  return { allowed: true, currentUsage, limit, isUnlimited: false };
}
export async function getDatabaseStorageStats() {
  const totalStats = await db
    .select({
      totalSize: sql<number>`coalesce(sum(${media.fileSize}), 0)`,
      totalFiles: sql<number>`count(*)`,
    })
    .from(media);
  const eventStats = await db
    .select({
      id: events.id,
      name: events.name,
      size: sql<number>`coalesce(sum(${media.fileSize}), 0)`,
      count: sql<number>`count(${media.id})`,
    })
    .from(media)
    .innerJoin(events, eq(media.eventId, events.id))
    .groupBy(events.id, events.name)
    .orderBy(desc(sql`sum(${media.fileSize})`));
  const userStats = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      storageLimit: users.storageLimit,
      isGlobalAdmin: users.isGlobalAdmin,
      size: sql<number>`coalesce(sum(${media.fileSize}), 0)`,
      count: sql<number>`count(${media.id})`,
    })
    .from(media)
    .innerJoin(users, eq(media.uploadedById, users.id))
    .groupBy(
      users.id,
      users.name,
      users.email,
      users.storageLimit,
      users.isGlobalAdmin,
    )
    .orderBy(desc(sql`sum(${media.fileSize})`));
  return {
    totalSize: Number(totalStats[0]?.totalSize || 0),
    totalFiles: Number(totalStats[0]?.totalFiles || 0),
    eventBreakdown: eventStats.map((e) => ({
      ...e,
      size: Number(e.size),
      count: Number(e.count),
    })),
    userBreakdown: userStats.map((u) => ({
      ...u,
      size: Number(u.size),
      count: Number(u.count),
      storageLimit: Number(u.storageLimit),
    })),
  };
}
