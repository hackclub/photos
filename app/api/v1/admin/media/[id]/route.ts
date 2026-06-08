import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { auditLog } from "@/lib/audit";
import { unauthorizedResponse, validateAdminApiKey } from "@/lib/auth-api";
import { db } from "@/lib/db";
import { events, media, pendingMediaOwnership, users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { deleteMediaAndThumbnail } from "@/lib/media/thumbnail";
import { PENDING_REGISTRATION_USER_ID } from "@/lib/pending-ownership";
import { publicMedia } from "@/lib/public-data";
import { isValidSlackId, normalizeSlackId } from "@/lib/slack-id";

async function getMedia(id: string) {
  return db.query.media.findFirst({ where: eq(media.id, id) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateAdminApiKey();
  if (!auth) return unauthorizedResponse();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Invalid media id" }, { status: 400 });
  }
  try {
    const item = await getMedia(id);
    if (!item) return Response.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    const updates: Partial<typeof media.$inferInsert> = {};

    if ("caption" in body) updates.caption = body.caption || null;
    if ("metadata" in body) {
      if (
        !body.metadata ||
        typeof body.metadata !== "object" ||
        Array.isArray(body.metadata)
      ) {
        return Response.json(
          { error: "metadata must be an object" },
          { status: 400 },
        );
      }
      updates.metadata = {
        ...(item.metadata as object | null),
        ...body.metadata,
      };
    }
    if ("globalAdminOnlyDelete" in body) {
      updates.globalAdminOnlyDelete = body.globalAdminOnlyDelete === true;
    }
    if (body.eventId) {
      const event = await db.query.events.findFirst({
        where: eq(events.id, body.eventId),
        columns: { id: true },
      });
      if (!event)
        return Response.json({ error: "Event not found" }, { status: 404 });
      updates.eventId = event.id;
    }
    if (body.uploadedById) {
      let newUploadedById: string;
      let pendingOwnerSlackId: string | null = null;
      let pendingOwnerHackclubId: string | null = null;
      if (/^[0-9a-f-]{36}$/i.test(body.uploadedById)) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, body.uploadedById),
          columns: { id: true, isBanned: true },
        });
        if (!user || user.isBanned) {
          return Response.json({ error: "User not found" }, { status: 404 });
        }
        newUploadedById = user.id;
      } else if (isValidSlackId(body.uploadedById)) {
        const slackId = normalizeSlackId(body.uploadedById);
        const user = await db.query.users.findFirst({
          where: eq(users.slackId, slackId),
          columns: { id: true, isBanned: true },
        });
        if (user?.isBanned) {
          return Response.json({ error: "User is banned" }, { status: 404 });
        }
        newUploadedById = user?.id ?? PENDING_REGISTRATION_USER_ID;
        pendingOwnerSlackId = user ? null : slackId;
      } else {
        const hackclubId = String(body.uploadedById).trim();
        if (!hackclubId || hackclubId.length > 200) {
          return Response.json(
            {
              error:
                "uploadedById must be a user UUID, Slack user ID, or Hack Club ID",
            },
            { status: 400 },
          );
        }
        const user = await db.query.users.findFirst({
          where: eq(users.hackclubId, hackclubId),
          columns: { id: true, isBanned: true },
        });
        if (user?.isBanned) {
          return Response.json({ error: "User is banned" }, { status: 404 });
        }
        newUploadedById = user?.id ?? PENDING_REGISTRATION_USER_ID;
        pendingOwnerHackclubId = user ? null : hackclubId;
      }
      updates.uploadedById = newUploadedById;
      updates.metadata = {
        ...((updates.metadata as object | undefined) ??
          (item.metadata as object | null) ??
          {}),
        reassignedByApi: true,
        reassignedByUserId: auth.user.id,
        pendingOwnerSlackId,
        pendingOwnerHackclubId,
      };
      if (pendingOwnerSlackId || pendingOwnerHackclubId) {
        const existingPending = await db.query.pendingMediaOwnership.findFirst({
          where: and(
            eq(pendingMediaOwnership.mediaId, item.id),
            isNull(pendingMediaOwnership.resolvedAt),
          ),
        });
        if (existingPending) {
          await db
            .update(pendingMediaOwnership)
            .set({
              slackId: pendingOwnerSlackId,
              hackclubId: pendingOwnerHackclubId,
              showPlaceholder: true,
            })
            .where(eq(pendingMediaOwnership.id, existingPending.id));
        } else {
          await db.insert(pendingMediaOwnership).values({
            mediaId: item.id,
            slackId: pendingOwnerSlackId,
            hackclubId: pendingOwnerHackclubId,
            showPlaceholder: true,
            previousOwnerId: item.uploadedById,
            createdById: auth.user.id,
          });
        }
      } else {
        await db
          .delete(pendingMediaOwnership)
          .where(
            and(
              eq(pendingMediaOwnership.mediaId, item.id),
              isNull(pendingMediaOwnership.resolvedAt),
            ),
          );
      }
    }

    const [updated] = await db
      .update(media)
      .set(updates)
      .where(eq(media.id, id))
      .returning();
    await auditLog(auth.user.id, "update", "media", id, {
      viaAdminApiKey: true,
      apiKeyId: auth.apiKeyId,
      fields: Object.keys(updates),
    });
    revalidatePath(`/events/${updated.eventId}`);
    return Response.json({ data: publicMedia(updated) });
  } catch (error) {
    logger.error("Error updating media via admin API:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateAdminApiKey();
  if (!auth) return unauthorizedResponse();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Invalid media id" }, { status: 400 });
  }
  try {
    const item = await getMedia(id);
    if (!item) return Response.json({ error: "Not found" }, { status: 404 });
    await deleteMediaAndThumbnail(item.s3Key, item.thumbnailS3Key);
    await db.delete(media).where(eq(media.id, id));
    await auditLog(auth.user.id, "delete", "media", id, {
      viaAdminApiKey: true,
      apiKeyId: auth.apiKeyId,
      globalAdminOnlyDelete: item.globalAdminOnlyDelete,
    });
    revalidatePath(`/events/${item.eventId}`);
    return Response.json({ success: true });
  } catch (error) {
    logger.error("Error deleting media via admin API:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
