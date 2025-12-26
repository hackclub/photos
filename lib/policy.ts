import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  eventAdmins,
  eventParticipants,
  events,
  seriesAdmins,
  users,
} from "@/lib/db/schema";
export type Action =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "manage"
  | "upload"
  | "download"
  | "join"
  | "leave"
  | "ban"
  | "promote"
  | "impersonate"
  | "interact";
export type ResourceType =
  | "user"
  | "series"
  | "event"
  | "media"
  | "comment"
  | "report"
  | "admin"
  | "tag"
  | "api_key"
  | "mention"
  | "share_link"
  | "storage";
export interface UserContext {
  id: string;
  isGlobalAdmin: boolean;
  isBanned: boolean;
  seriesAdmins: {
    seriesId: string;
  }[];
  eventAdmins: {
    eventId: string;
  }[];
}
export async function can(
  user: UserContext | undefined | null,
  action: Action,
  resourceType: ResourceType,
  resource?: any,
): Promise<boolean> {
  if (!user) {
    if (action === "view") {
      if (resourceType === "event")
        return checkEventPermission(null, action, resource);
      if (resourceType === "media")
        return checkMediaPermission(null, action, resource);
      if (resourceType === "mention")
        return checkMentionPermission(null, action, resource);
      if (resource?.visibility === "public") return true;
    }
    return false;
  }
  if (user.isBanned) {
    return false;
  }
  if (user.isGlobalAdmin) {
    return true;
  }
  switch (resourceType) {
    case "series":
      return checkSeriesPermission(user, action, resource);
    case "event":
      return checkEventPermission(user, action, resource);
    case "media":
      return checkMediaPermission(user, action, resource);
    case "user":
      return checkUserPermission(user, action, resource);
    case "admin":
      return false;
    case "tag":
      return false;
    case "api_key":
      return checkApiKeyPermission(user, action, resource);
    case "mention":
      return checkMentionPermission(user, action, resource);
    case "share_link":
      return checkShareLinkPermission(user, action, resource);
    case "storage":
      return false;
    case "comment":
      return checkCommentPermission(user, action, resource);
    default:
      return false;
  }
}
async function checkShareLinkPermission(
  user: UserContext,
  action: Action,
  resource?: any,
): Promise<boolean> {
  if (!resource) return false;
  if (action === "create") {
    const mediaItem = resource.media || resource;
    if (mediaItem.event && mediaItem.event.allowPublicSharing === false) {
      if (!user.isGlobalAdmin) return false;
    }
    return checkEventPermission(user, "view", mediaItem.eventId);
  }
  if (action === "delete") {
    if (resource.createdById === user.id) return true;
    if (user.isGlobalAdmin) return true;
    return false;
  }
  return false;
}
async function checkMentionPermission(
  user: UserContext | undefined | null,
  action: Action,
  resource?: any,
): Promise<boolean> {
  if (!resource) return false;
  const mediaItem = resource.media || resource;
  const targetUserId = resource.targetUserId;
  if (action === "create") {
    if (!user) return false;
    return checkEventPermission(user, "view", mediaItem.eventId);
  }
  if (action === "delete") {
    if (!user) return false;
    if (mediaItem.uploadedById === user.id) return true;
    if (targetUserId === user.id) return true;
    return checkEventPermission(user, "manage", mediaItem.eventId);
  }
  if (action === "view") {
    return checkEventPermission(user, "view", mediaItem.eventId);
  }
  return false;
}
async function checkApiKeyPermission(
  user: UserContext,
  action: Action,
  resource?: any,
): Promise<boolean> {
  if (!resource) {
    if (action === "create") return true;
    if (action === "view") return true;
    return false;
  }
  if (resource.userId === user.id) {
    if (["view", "delete", "update", "manage"].includes(action)) return true;
  }
  return false;
}
async function checkSeriesPermission(
  user: UserContext,
  action: Action,
  resource?: any,
): Promise<boolean> {
  if (!resource) {
    if (action === "create") return true;
    return false;
  }
  const seriesId = typeof resource === "string" ? resource : resource.id;
  const adminRecord = await db.query.seriesAdmins.findFirst({
    where: and(
      eq(seriesAdmins.userId, user.id),
      eq(seriesAdmins.seriesId, seriesId),
    ),
  });
  const isSeriesAdmin = !!adminRecord;
  if (action === "view") {
    if (resource.visibility === "public") return true;
    if (resource.visibility === "auth_required") return true;
    if (resource.visibility === "unlisted") return isSeriesAdmin;
    return false;
  }
  if (["update", "delete", "manage"].includes(action)) {
    return isSeriesAdmin;
  }
  return false;
}
async function checkEventPermission(
  user: UserContext | undefined | null,
  action: Action,
  resource?: any,
): Promise<boolean> {
  if (!resource) {
    if (action === "create") return !!user;
    return false;
  }
  const eventId = typeof resource === "string" ? resource : resource.id;
  let eventData = resource;
  if (typeof resource === "string" || !resource.seriesId) {
    const fetched = await db.query.events.findFirst({
      where: eq(events.id, eventId),
      columns: {
        id: true,
        seriesId: true,
        visibility: true,
        createdById: true,
      },
    });
    if (!fetched) return false;
    eventData = fetched;
  }

  let isEventAdmin = false;
  if (user) {
    const eventAdmin = await db.query.eventAdmins.findFirst({
      where: and(
        eq(eventAdmins.userId, user.id),
        eq(eventAdmins.eventId, eventId),
      ),
    });
    let isSeriesAdmin = false;
    if (eventData.seriesId) {
      const seriesAdmin = await db.query.seriesAdmins.findFirst({
        where: and(
          eq(seriesAdmins.userId, user.id),
          eq(seriesAdmins.seriesId, eventData.seriesId),
        ),
      });
      isSeriesAdmin = !!seriesAdmin;
    }
    isEventAdmin = !!eventAdmin || isSeriesAdmin;
  }

  if (action === "view") {
    if (eventData.visibility === "public") return true;
    if (eventData.visibility === "auth_required") return !!user;
    if (eventData.visibility === "unlisted") {
      if (isEventAdmin) return true;
      if (!user) return false;
      const participant = await db.query.eventParticipants.findFirst({
        where: and(
          eq(eventParticipants.userId, user.id),
          eq(eventParticipants.eventId, eventId),
        ),
      });
      return !!participant;
    }
    return false;
  }
  if (["update", "delete", "manage"].includes(action)) {
    return isEventAdmin;
  }
  if (action === "join") {
    return !!user;
  }
  if (action === "upload") {
    if (!user) return false;
    if (isEventAdmin) return true;
    const participant = await db.query.eventParticipants.findFirst({
      where: and(
        eq(eventParticipants.userId, user.id),
        eq(eventParticipants.eventId, eventId),
      ),
    });
    return !!participant;
  }
  return false;
}
async function checkMediaPermission(
  user: UserContext | undefined | null,
  action: Action,
  resource?: any,
): Promise<boolean> {
  if (!resource) return false;
  const isOwner = user ? resource.uploadedById === user.id : false;
  if (action === "delete") {
    if (!user) return false;
    if (isOwner) return true;
    return checkEventPermission(user, "manage", resource.eventId);
  }
  if (action === "view" || action === "interact") {
    return checkEventPermission(user, "view", resource.eventId);
  }
  return false;
}
async function checkUserPermission(
  user: UserContext,
  action: Action,
  resource?: any,
): Promise<boolean> {
  if (resource && resource.id === user.id) {
    if (["update", "delete"].includes(action)) return true;
  }
  return false;
}
async function checkCommentPermission(
  user: UserContext,
  action: Action,
  resource?: any,
): Promise<boolean> {
  if (!resource) return false;
  if (action === "create") {
    const mediaItem = resource.media || resource;
    return checkMediaPermission(user, "interact", mediaItem);
  }
  if (action === "delete") {
    if (resource.userId === user.id) return true;
    if (resource.media?.event) {
      return checkEventPermission(user, "manage", resource.media.event.id);
    }
    return false;
  }
  if (action === "interact") {
    if (resource.media) {
      return checkMediaPermission(user, "interact", resource.media);
    }
    return false;
  }
  return false;
}
export async function getUserContext(
  userId: string | undefined,
): Promise<UserContext | null> {
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      isGlobalAdmin: true,
      isBanned: true,
    },
    with: {
      seriesAdminRoles: {
        columns: { seriesId: true },
      },
      eventAdminRoles: {
        columns: { eventId: true },
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    isGlobalAdmin: user.isGlobalAdmin,
    isBanned: user.isBanned || false,
    seriesAdmins: user.seriesAdminRoles,
    eventAdmins: user.eventAdminRoles,
  };
}
export async function filterDeletableMedia<
  T extends {
    eventId: string;
    uploadedById: string;
  },
>(userId: string, mediaItems: T[]): Promise<T[]> {
  const ctx = await getUserContext(userId);
  if (!ctx || ctx.isBanned) return [];
  if (ctx.isGlobalAdmin) {
    return mediaItems;
  }
  const eventIds = [...new Set(mediaItems.map((m) => m.eventId))];
  const eventAdminChecks = await Promise.all(
    eventIds.map(async (eventId) => {
      const isAdmin = await can(ctx, "manage", "event", eventId);
      return { eventId, isAdmin };
    }),
  );
  const eventAdminMap = new Map(
    eventAdminChecks.map(({ eventId, isAdmin }) => [eventId, isAdmin]),
  );
  return mediaItems.filter((item) => {
    const isAdmin = eventAdminMap.get(item.eventId);
    const isOwner = item.uploadedById === userId;
    return isAdmin || isOwner;
  });
}
export async function augmentMediaWithPermissions<
  T extends {
    eventId: string;
    uploadedById: string;
  },
>(
  userId: string | undefined,
  mediaItems: T[],
): Promise<
  (T & {
    canDelete: boolean;
  })[]
> {
  if (!userId) {
    return mediaItems.map((item) => ({ ...item, canDelete: false }));
  }
  const ctx = await getUserContext(userId);
  if (!ctx || ctx.isBanned) {
    return mediaItems.map((item) => ({ ...item, canDelete: false }));
  }
  if (ctx.isGlobalAdmin) {
    return mediaItems.map((item) => ({ ...item, canDelete: true }));
  }
  const eventIds = [...new Set(mediaItems.map((m) => m.eventId))];
  const eventAdminChecks = await Promise.all(
    eventIds.map(async (eventId) => {
      const isAdmin = await can(ctx, "manage", "event", eventId);
      return { eventId, isAdmin };
    }),
  );
  const eventAdminMap = new Map(
    eventAdminChecks.map(({ eventId, isAdmin }) => [eventId, isAdmin]),
  );
  return mediaItems.map((item) => {
    const isAdmin = eventAdminMap.get(item.eventId);
    const isOwner = item.uploadedById === userId;
    return {
      ...item,
      canDelete: !!(isAdmin || isOwner),
    };
  });
}
export async function getAccessibleEventIds(
  userId: string | undefined,
  candidateEvents: {
    id: string;
    visibility: "public" | "auth_required" | "unlisted";
    seriesId?: string | null;
  }[],
): Promise<Set<string>> {
  const accessibleIds = new Set<string>();
  const unlistedEvents: typeof candidateEvents = [];
  for (const event of candidateEvents) {
    if (event.visibility === "public") {
      accessibleIds.add(event.id);
    } else if (event.visibility === "auth_required" && userId) {
      accessibleIds.add(event.id);
    } else if (event.visibility === "unlisted" && userId) {
      unlistedEvents.push(event);
    }
  }
  if (unlistedEvents.length === 0) {
    if (userId) {
      const ctx = await getUserContext(userId);
      if (!ctx || ctx.isBanned) {
        const publicOnly = new Set<string>();
        for (const event of candidateEvents) {
          if (event.visibility === "public") publicOnly.add(event.id);
        }
        return publicOnly;
      }
    }
    return accessibleIds;
  }
  if (!userId) {
    return accessibleIds;
  }
  const ctx = await getUserContext(userId);
  if (!ctx || ctx.isBanned) {
    const publicOnly = new Set<string>();
    for (const event of candidateEvents) {
      if (event.visibility === "public") publicOnly.add(event.id);
    }
    return publicOnly;
  }
  const unlistedIds = unlistedEvents.map((e) => e.id);
  const participations = await db.query.eventParticipants.findMany({
    where: and(
      eq(eventParticipants.userId, userId),
      inArray(eventParticipants.eventId, unlistedIds),
    ),
    columns: { eventId: true },
  });
  for (const p of participations) {
    accessibleIds.add(p.eventId);
  }
  if (ctx.isGlobalAdmin) {
    for (const e of unlistedEvents) {
      accessibleIds.add(e.id);
    }
    return accessibleIds;
  }
  const directAdmins = await db.query.eventAdmins.findMany({
    where: and(
      eq(eventAdmins.userId, userId),
      inArray(eventAdmins.eventId, unlistedIds),
    ),
    columns: { eventId: true },
  });
  for (const a of directAdmins) {
    accessibleIds.add(a.eventId);
  }
  const seriesIds = [
    ...new Set(
      unlistedEvents.map((e) => e.seriesId).filter((id): id is string => !!id),
    ),
  ];
  if (seriesIds.length > 0) {
    const seriesAdminships = await db.query.seriesAdmins.findMany({
      where: and(
        eq(seriesAdmins.userId, userId),
        inArray(seriesAdmins.seriesId, seriesIds),
      ),
      columns: { seriesId: true },
    });
    const adminSeriesIds = new Set(seriesAdminships.map((s) => s.seriesId));
    unlistedEvents.forEach((e) => {
      if (e.seriesId && adminSeriesIds.has(e.seriesId)) {
        accessibleIds.add(e.id);
      }
    });
  }
  return accessibleIds;
}
export async function getAccessibleEventIdsForUser(
  userId: string | undefined,
): Promise<string[]> {
  const allEvents = await db.query.events.findMany({
    columns: {
      id: true,
      visibility: true,
      seriesId: true,
    },
  });
  const accessibleIdsSet = await getAccessibleEventIds(userId, allEvents);
  return Array.from(accessibleIdsSet);
}
