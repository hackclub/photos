"use server";
import { and, eq, sql } from "drizzle-orm";
import { auditLog } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media, mediaTags, tags } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  can,
  getAccessibleEventIdsForUser,
  getUserContext,
} from "@/lib/policy";
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
    const isUploader = mediaItem.uploadedById === user.id;
    const canManage = await can(user, "manage", "event", mediaItem.eventId);
    if (!isUploader && !canManage) {
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
    logger.error("Failed to add tag:", error);
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
    logger.error("Failed to remove tag:", error);
    return { success: false, error: "Failed to remove tag" };
  }
}
export async function searchByTag(query: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) return { success: true, tags: [] };
    const accessibleEventIds = await getAccessibleEventIdsForUser(user?.id);
    if (accessibleEventIds.length === 0) return { success: true, tags: [] };
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return { success: true, tags: [] };
    const escapedEventIds = accessibleEventIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");
    const escapedQuery = normalizedQuery.replace(/'/g, "''");
    const results = (await db.execute(
      sql.raw(`
      SELECT DISTINCT t.*
      FROM tags t
      JOIN media_tags mt ON t.id = mt.tag_id
      JOIN media m ON mt.media_id = m.id
      WHERE m.event_id IN (${escapedEventIds})
      AND t.name ILIKE '%${escapedQuery}%'
      ORDER BY t.name ASC
      LIMIT 10
    `),
    )) as (typeof tags.$inferSelect)[];
    return { success: true, tags: results };
  } catch (error) {
    logger.error("Failed to search tags:", error);
    return { success: false, error: "Failed to search tags" };
  }
}
export async function getTagByName(name: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) return { success: false, error: "Tag not found" };
    const accessibleEventIds = await getAccessibleEventIdsForUser(user?.id);
    if (accessibleEventIds.length === 0) {
      return { success: false, error: "Tag not found" };
    }
    const normalizedName = name.toLowerCase().trim();
    const escapedEventIds = accessibleEventIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");
    const escapedName = normalizedName.replace(/'/g, "''");
    const [tag] = (await db.execute(
      sql.raw(`
      SELECT DISTINCT t.*
      FROM tags t
      JOIN media_tags mt ON t.id = mt.tag_id
      JOIN media m ON mt.media_id = m.id
      WHERE m.event_id IN (${escapedEventIds})
      AND t.name = '${escapedName}'
      LIMIT 1
    `),
    )) as (typeof tags.$inferSelect)[];
    if (!tag) return { success: false, error: "Tag not found" };
    return { success: true, tag };
  } catch (error) {
    logger.error("Failed to get tag by name:", error);
    return { success: false, error: "Failed to get tag" };
  }
}
export async function getMediaTags(mediaId: string) {
  try {
    const session = await getSession();
    const user = await getUserContext(session?.id);
    const mediaItem = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
      with: { event: true },
    });
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }
    if (!(await can(user, "view", "media", mediaItem))) {
      if (!user) return { success: false, error: "Unauthorized" };
      return { success: false, error: "Forbidden" };
    }
    const results = await db.query.mediaTags.findMany({
      where: eq(mediaTags.mediaId, mediaId),
      with: {
        tag: true,
      },
    });
    return { success: true, tags: results.map((r) => r.tag) };
  } catch (error) {
    logger.error("Failed to get media tags:", error);
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
    const session = await getSession();
    const user = await getUserContext(session?.id);
    if (user?.isBanned) {
      return {
        success: true,
        tags: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }
    const accessibleEventIds = await getAccessibleEventIdsForUser(user?.id);
    if (accessibleEventIds.length === 0) {
      return {
        success: true,
        tags: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }
    const safePage = Math.max(
      1,
      Number.isFinite(Number(page)) ? Number(page) : 1,
    );
    const safeLimit = Math.min(
      100,
      Math.max(1, Number.isFinite(Number(limit)) ? Number(limit) : 50),
    );
    const offset = (safePage - 1) * safeLimit;
    let orderByClause = "count DESC";
    if (sortBy === "name") orderByClause = "t.name ASC";
    if (sortBy === "created") orderByClause = "t.created_at DESC";
    const escapedEventIds = accessibleEventIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");
    const searchFilter = search
      ? `AND t.name ILIKE '%${search.toLowerCase().replace(/'/g, "''")}%'`
      : "";
    const query = sql.raw(`
    SELECT
     t.*,
     COUNT(mt.media_id) as count,
     (
      SELECT m2.id
      FROM media_tags mt2
      JOIN media m2 ON mt2.media_id = m2.id
      WHERE mt2.tag_id = t.id
      AND m2.event_id IN (${escapedEventIds})
      ORDER BY m2.uploaded_at DESC
      LIMIT 1
     ) as preview_media_id
    FROM tags t
    JOIN media_tags mt ON t.id = mt.tag_id
    JOIN media m ON mt.media_id = m.id
    WHERE m.event_id IN (${escapedEventIds})
    ${searchFilter}
    GROUP BY t.id
    ORDER BY ${orderByClause}
    LIMIT ${safeLimit} OFFSET ${offset}
   `);
    const results = await db.execute(query);
    const countQuery = sql.raw(`
    SELECT COUNT(*) as total FROM (
     SELECT t.id
     FROM tags t
     JOIN media_tags mt ON t.id = mt.tag_id
     JOIN media m ON mt.media_id = m.id
     WHERE m.event_id IN (${escapedEventIds})
     ${searchFilter}
     GROUP BY t.id
    ) filtered_tags
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
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  } catch (error) {
    logger.error("Failed to get all tags:", error);
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
    logger.error("Failed to update tag:", error);
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
    logger.error("Failed to delete tag:", error);
    return { success: false, error: "Failed to delete tag" };
  }
}
