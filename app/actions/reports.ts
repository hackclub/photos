"use server";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
export async function createReport(mediaId: string, reason: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!reason.trim()) {
    return { success: false, error: "Reason is required" };
  }
  try {
    const [newReport] = await db
      .insert(reports)
      .values({
        mediaId,
        reporterId: user.id,
        reason: reason.trim(),
      })
      .returning();
    await auditLog(user.id, "create", "report", newReport.id, {
      mediaId,
      reason,
    });
    return { success: true };
  } catch (error) {
    console.error("Error creating report:", error);
    return { success: false, error: "Failed to submit report" };
  }
}
export async function getReports() {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!(await can(user, "manage", "report", null))) {
    return { success: false, error: "Forbidden" };
  }
  try {
    const allReports = await db.query.reports.findMany({
      with: {
        media: {
          with: {
            uploadedBy: true,
          },
        },
        reporter: true,
        resolvedBy: true,
      },
      orderBy: [desc(reports.createdAt)],
    });
    return { success: true, reports: allReports };
  } catch (error) {
    console.error("Error fetching reports:", error);
    return { success: false, error: "Failed to fetch reports" };
  }
}
export async function resolveReport(
  reportId: string,
  status: "resolved" | "ignored",
  notes?: string,
) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!(await can(user, "manage", "report", null))) {
    return { success: false, error: "Forbidden" };
  }
  try {
    await db
      .update(reports)
      .set({
        status,
        resolvedAt: new Date(),
        resolvedById: user.id,
        resolutionNotes: notes,
      })
      .where(eq(reports.id, reportId));
    await auditLog(user.id, "update", "report", reportId, { status, notes });
    revalidatePath("/admin/reports");
    revalidatePath("/users/[username]", "page");
    return { success: true };
  } catch (error) {
    console.error("Error resolving report:", error);
    return { success: false, error: "Failed to resolve report" };
  }
}
export async function getUserReports() {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const userReports = await db.query.reports.findMany({
      where: eq(reports.reporterId, user.id),
      with: {
        media: true,
      },
      orderBy: [desc(reports.createdAt)],
    });
    return { success: true, reports: userReports };
  } catch (error) {
    console.error("Error fetching user reports:", error);
    return { success: false, error: "Failed to fetch reports" };
  }
}
