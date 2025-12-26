"use server";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { APP_URL } from "@/lib/constants";
import { can, getUserContext } from "@/lib/policy";
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
