"use server";
import { and, eq, ilike, sql } from "drizzle-orm";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media, mediaTags, tags } from "@/lib/db/schema";
import { can, getUserContext } from "@/lib/policy";
export async function addTag(mediaId: string, tagName: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const normalizedTag = tagName.toLowerCase().trim().replace(/\s+/g, "-");
    if (!normalizedTag) return { success: false, error: "Invalid tag" };
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (
      mediaItem.event &&
      !(await can(user, "view", "event", mediaItem.event))
    ) {
      return { success: false, error: "Unauthorized" };
    }
    let tagId: string;
    const existingTag = await db.query.tags.findFirst({
      where: eq(tags.name, normalizedTag),
    });
    if (existingTag) {
      tagId = existingTag.id;
    } else {
      const [newTag] = await db
        .insert(tags)
        .values({ name: normalizedTag })
        .returning({ id: tags.id });
      tagId = newTag.id;
    }
    const existingLink = await db.query.mediaTags.findFirst({
      where: and(eq(mediaTags.mediaId, mediaId), eq(mediaTags.tagId, tagId)),
    });
    if (existingLink) {
      return { success: false, error: "Tag already added" };
    }
    await db.insert(mediaTags).values({ mediaId, tagId });
    await auditLog(user.id, "create", "tag_link", tagId, { mediaId });
    const fullTag = await db.query.tags.findFirst({
      where: eq(tags.id, tagId),
    });
    return { success: true, tag: fullTag };
  } catch (error) {
    console.error("Failed to add tag:", error);
    return { success: false, error: "Failed to add tag" };
  }
}
export async function removeTag(mediaId: string, tagId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    const isUploader = mediaItem.uploadedById === user.id;
    const canManage = await can(user, "update", "media", mediaItem);
    if (!isUploader && !canManage) {
      return { success: false, error: "Unauthorized" };
    }
    await db
      .delete(mediaTags)
      .where(and(eq(mediaTags.mediaId, mediaId), eq(mediaTags.tagId, tagId)));
    await auditLog(user.id, "delete", "tag_link", tagId, { mediaId });
    return { success: true };
  } catch (error) {
    console.error("Failed to remove tag:", error);
    return { success: false, error: "Failed to remove tag" };
  }
}
export async function searchByTag(query: string) {
  try {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return { success: true, tags: [] };
    const results = await db.query.tags.findMany({
      where: ilike(tags.name, `%${normalizedQuery}%`),
      limit: 10,
    });
    return { success: true, tags: results };
  } catch (error) {
    console.error("Failed to search tags:", error);
    return { success: false, error: "Failed to search tags" };
  }
}
export async function getTagByName(name: string) {
  try {
    const normalizedName = name.toLowerCase().trim();
    const tag = await db.query.tags.findFirst({
      where: eq(tags.name, normalizedName),
    });
    if (!tag) return { success: false, error: "Tag not found" };
    return { success: true, tag };
  } catch (error) {
    console.error("Failed to get tag by name:", error);
    return { success: false, error: "Failed to get tag" };
  }
}
export async function getMediaTags(mediaId: string) {
  try {
    const results = await db.query.mediaTags.findMany({
      where: eq(mediaTags.mediaId, mediaId),
      with: {
        tag: true,
      },
    });
    return { success: true, tags: results.map((r) => r.tag) };
  } catch (error) {
    console.error("Failed to get media tags:", error);
    return { success: false, error: "Failed to get media tags" };
  }
}
export async function getAllTags(
  page = 1,
  limit = 50,
  search?: string,
  sortBy: "name" | "count" | "created" = "count",
) {
  try {
    const offset = (page - 1) * limit;
    const _whereClause = search
      ? ilike(tags.name, `%${search.toLowerCase()}%`)
      : undefined;
    let orderByClause = "count DESC";
    if (sortBy === "name") orderByClause = "t.name ASC";
    if (sortBy === "created") orderByClause = "t.created_at DESC";
    const searchClause = search
      ? `WHERE t.name ILIKE '%${search.toLowerCase()}%'`
      : "";
    const query = sql.raw(`
   SELECT
    t.*,
    COUNT(mt.media_id) as count,
    (
     SELECT m.id
     FROM media_tags mt2
     JOIN media m ON mt2.media_id = m.id
     WHERE mt2.tag_id = t.id
     ORDER BY m.uploaded_at DESC
     LIMIT 1
    ) as preview_media_id
   FROM tags t
   LEFT JOIN media_tags mt ON t.id = mt.tag_id
   ${searchClause}
   GROUP BY t.id
   ORDER BY ${orderByClause}
   LIMIT ${limit} OFFSET ${offset}
  `);
    const results = await db.execute(query);
    const countQuery = sql.raw(`
   SELECT COUNT(*) as total FROM tags t ${searchClause}
  `);
    const countResult = await db.execute(countQuery);
    const total = Number(countResult[0].total);
    return {
      success: true,
      tags: results.map((row: Record<string, unknown>) => ({
        ...(row as unknown as typeof tags.$inferSelect),
        count: Number(row.count),
        previewMediaId: row.preview_media_id as string | null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("Failed to get all tags:", error);
    return { success: false, error: "Failed to get tags" };
  }
}
export async function updateTag(
  tagId: string,
  data: {
    name?: string;
    color?: string;
  },
) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user || !(await can(user, "manage", "tag", null))) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const updateData: {
      name?: string;
      color?: string;
    } = {};
    if (data.name) {
      updateData.name = data.name.toLowerCase().trim().replace(/\s+/g, "-");
    }
    if (data.color) {
      updateData.color = data.color;
    }
    await db.update(tags).set(updateData).where(eq(tags.id, tagId));
    await auditLog(user.id, "update", "tag", tagId, updateData);
    return { success: true };
  } catch (error) {
    console.error("Failed to update tag:", error);
    return { success: false, error: "Failed to update tag" };
  }
}
export async function deleteTag(tagId: string) {
  const session = await getSession();
  const user = await getUserContext(session?.id);
  if (!user || !(await can(user, "manage", "tag", null))) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    await db.delete(tags).where(eq(tags.id, tagId));
    await auditLog(user.id, "delete", "tag", tagId, {});
    return { success: true };
  } catch (error) {
    console.error("Failed to delete tag:", error);
    return { success: false, error: "Failed to delete tag" };
  }
}
