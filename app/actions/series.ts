"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { series } from "@/lib/db/schema";
import { deleteMediaAndThumbnail } from "@/lib/media/thumbnail";
import { can, getUserContext } from "@/lib/policy";

function isUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
export async function deleteSeries(seriesIdOrSlug: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  const seriesData = await db.query.series.findFirst({
    where: isUUID(seriesIdOrSlug)
      ? eq(series.id, seriesIdOrSlug)
      : eq(series.slug, seriesIdOrSlug),
  });
  if (!seriesData) {
    return { success: false, error: "Series not found" };
  }
  if (!(await can(user, "delete", "series", seriesData))) {
    return { success: false, error: "Forbidden" };
  }
  if (seriesData.bannerS3Key) {
    try {
      await deleteMediaAndThumbnail(seriesData.bannerS3Key, null);
    } catch (error) {
      console.error("Error deleting banner from S3:", error);
      return {
        success: false,
        error: "Failed to delete series banner from S3",
      };
    }
  }
  await db.delete(series).where(eq(series.id, seriesData.id));
  await auditLog(user.id, "delete", "series", seriesData.id);
  revalidatePath("/series");
  revalidatePath("/admin/series");
  return { success: true };
}
interface SeriesInput {
  name: string;
  slug: string;
  description?: string;
  visibility?: "public" | "auth_required" | "unlisted";
}
export async function updateSeries(seriesId: string, data: SeriesInput) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  const seriesData = await db.query.series.findFirst({
    where: eq(series.id, seriesId),
  });
  if (!seriesData) {
    return { success: false, error: "Series not found" };
  }
  if (!(await can(user, "update", "series", seriesData))) {
    return { success: false, error: "Forbidden" };
  }
  const { name, description, visibility, slug } = data;
  try {
    const [updatedSeries] = await db
      .update(series)
      .set({
        name,
        slug,
        description,
        visibility,
        updatedAt: new Date(),
      })
      .where(eq(series.id, seriesData.id))
      .returning();
    await auditLog(user.id, "update", "series", seriesData.id, {
      changes: Object.keys(data),
    });
    revalidatePath(`/series/${updatedSeries.slug}`);
    revalidatePath("/series");
    revalidatePath("/admin/series");
    return { success: true, series: updatedSeries };
  } catch (error: unknown) {
    console.error("Update series error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update series";
    return {
      success: false,
      error: errorMessage,
    };
  }
}
export async function getSeries(seriesId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  const seriesData = await db.query.series.findFirst({
    where: eq(series.id, seriesId),
  });
  if (!seriesData) {
    return { success: false, error: "Series not found" };
  }
  if (!(await can(user, "view", "series", seriesData))) {
    return { success: false, error: "Unauthorized" };
  }
  return { success: true, series: seriesData };
}
export async function getAllSeries() {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    const allSeries = await db.query.series.findMany({
      orderBy: (series, { desc }) => [desc(series.createdAt)],
    });
    const accessibleSeries = [];
    for (const s of allSeries) {
      if (await can(user, "view", "series", s)) {
        accessibleSeries.push(s);
      }
    }
    return { success: true, series: accessibleSeries };
  } catch (error) {
    console.error("Error fetching all series:", error);
    return { success: false, error: "Failed to fetch series" };
  }
}
export async function createSeries(data: SeriesInput) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!(await can(user, "create", "series"))) {
    return { success: false, error: "Forbidden" };
  }
  const { name, description, visibility, slug } = data;
  try {
    const [newSeries] = await db
      .insert(series)
      .values({
        name,
        slug,
        description,
        visibility,
        createdById: user.id,
      })
      .returning();
    const { seriesAdmins } = await import("@/lib/db/schema");
    await db.insert(seriesAdmins).values({
      seriesId: newSeries.id,
      userId: user.id,
    });
    await auditLog(user.id, "create", "series", newSeries.id, {
      name,
      slug,
    });
    revalidatePath("/series");
    revalidatePath("/admin/series");
    return { success: true, series: newSeries };
  } catch (error: unknown) {
    console.error("Create series error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create series";
    return {
      success: false,
      error: errorMessage,
    };
  }
}
