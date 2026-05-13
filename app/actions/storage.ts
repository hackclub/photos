"use server";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { APP_URL } from "@/lib/constants";
import { getDetailedStorageStats } from "@/lib/media/s3";
import { can, getUserContext } from "@/lib/policy";
import { getDatabaseStorageStats } from "@/lib/storage";

export async function getStorageStats() {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (!(await can(user, "manage", "storage", null))) {
    return { success: false, error: "Forbidden" };
  }
  const s3Stats = await getDetailedStorageStats();
  const dbStats = await getDatabaseStorageStats();
  return {
    success: true,
    stats: {
      totalSize: s3Stats.totalSize,
      totalFiles: s3Stats.totalFiles,
      breakdown: s3Stats.breakdown,
      eventBreakdown: dbStats.eventBreakdown,
      userBreakdown: dbStats.userBreakdown.map((u) => ({
        id: u.id,
        name: u.name ? `${u.name} (${u.email})` : u.email,
        size: u.size,
        count: u.count,
        storageLimit: u.storageLimit,
        isGlobalAdmin: u.isGlobalAdmin,
      })),
    },
  };
}
export async function cleanupGhostFiles(cursor?: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!(await can(user, "manage", "storage", null))) {
    return { success: false, error: "Forbidden" };
  }
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      throw new Error("CRON_SECRET is not configured");
    }
    const baseUrl = APP_URL;
    const url = new URL(`${baseUrl}/api/cron/cleanup-ghost-files`);
    url.searchParams.set("force", "true");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cleanup failed: ${response.status} ${errorText}`);
    }
    const result = await response.json();
    await auditLog(user.id, "delete", "storage", "ghost_files", {
      force: true,
      result,
    });
    return { success: true, ...result };
  } catch (error) {
    console.error("Manual ghost file cleanup failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Cleanup failed",
    };
  }
}

export async function repairThumbnails(cursor?: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (!(await can(user, "manage", "storage", null))) {
    return { success: false, error: "Forbidden" };
  }
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) throw new Error("CRON_SECRET is not configured");
    const url = new URL(`${APP_URL}/api/cron/repair-thumbnails`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        `Thumbnail repair failed: ${response.status} ${await response.text()}`,
      );
    }
    const result = await response.json();
    await auditLog(user.id, "update", "storage", "thumbnails", { result });
    return { success: true, ...result };
  } catch (error) {
    console.error("Manual thumbnail repair failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Thumbnail repair failed",
    };
  }
}
