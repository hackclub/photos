import type { events, media, series, users } from "@/lib/db/schema";
import { toPublicUser } from "@/lib/user-display";

export type PublicUserRow = Pick<
  typeof users.$inferSelect,
  "id" | "handle" | "preferredName" | "slackId"
>;

export type PublicEvent = Omit<typeof events.$inferSelect, "inviteCode">;

export function publicUser(user: PublicUserRow) {
  return toPublicUser(user);
}

export function publicEvent(event: typeof events.$inferSelect): PublicEvent {
  const { inviteCode: _inviteCode, ...safeEvent } = event;
  return safeEvent;
}

export function publicSeries(item: typeof series.$inferSelect) {
  const {
    bannerS3Key: _bannerS3Key,
    createdById: _createdById,
    ...safe
  } = item;
  return safe;
}

export function publicMedia(item: typeof media.$inferSelect) {
  return {
    id: item.id,
    eventId: item.eventId,
    uploadedById: item.uploadedById,
    filename: item.filename,
    mimeType: item.mimeType,
    fileSize: item.fileSize,
    width: item.width,
    height: item.height,
    latitude: item.latitude,
    longitude: item.longitude,
    exifData: item.exifData,
    metadata: item.metadata,
    globalAdminOnlyDelete: item.globalAdminOnlyDelete,
    takenAt: item.takenAt,
    caption: item.caption,
    uploadedAt: item.uploadedAt,
  };
}
