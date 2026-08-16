"use server";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { APP_URL } from "@/lib/constants";
import { logger, serializeError } from "@/lib/logger";
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
    logger.error(
      { userId: user.id, cursor, error: serializeError(error) },
      "manual ghost file cleanup failed",
    );
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
    logger.error(
      { userId: user.id, cursor, error: serializeError(error) },
      "manual thumbnail repair failed",
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Thumbnail repair failed",
    };
  }
}

export async function repairExifData(cursor?: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) return { success: false, error: "Unauthorized" };
  if (!(await can(user, "manage", "storage", null))) {
    return { success: false, error: "Forbidden" };
  }
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) throw new Error("CRON_SECRET is not configured");
    const url = new URL(`${APP_URL}/api/cron/repair-exif`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });
    const responseText = await response.text();
    if (!response.ok) {
      const isTimeout = response.status === 524 || response.status === 504;
      throw new Error(
        isTimeout
          ? "EXIF repair request timed out before returning progress. The repair job is now smaller-batched; retry from the same cursor."
          : `EXIF repair failed: ${response.status} ${responseText.slice(0, 500)}`,
      );
    }
    let result: unknown;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(
        `EXIF repair returned an unexpected response: ${responseText.slice(0, 500)}`,
      );
    }
    const payload = result as Record<string, unknown>;
    await auditLog(user.id, "update", "storage", "exif", { result: payload });
    return {
      success: true,
      checked: Number(payload.checked ?? 0),
      scanned: Number(payload.scanned ?? 0),
      skipped: Number(payload.skipped ?? 0),
      repaired: Number(payload.repaired ?? 0),
      failed: Number(payload.failed ?? 0),
      nextCursor:
        typeof payload.nextCursor === "string" ? payload.nextCursor : undefined,
      completed: payload.completed === true,
    };
  } catch (error) {
    logger.error(
      { userId: user.id, cursor, error: serializeError(error) },
      "manual EXIF repair failed",
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "EXIF repair failed",
    };
  }
}
