import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
export const shareTypeEnum = pgEnum("share_type", ["view", "raw"]);
export const visibilityEnum = pgEnum("visibility", [
  "public",
  "auth_required",
  "unlisted",
]);
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const avatarSourceEnum = pgEnum("avatar_source", [
  "upload",
  "slack",
  "gravatar",
  "libravatar",
  "dicebear",
]);
export const exportStatusEnum = pgEnum("export_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "resolved",
  "ignored",
]);
export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "view",
  "download",
  "upload",
  "login",
  "logout",
  "ban",
  "unban",
  "promote",
  "demote",
  "impersonate",
  "join",
  "leave",
]);
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  hackclubId: text("hackclub_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  preferredName: text("preferred_name"),
  handle: text("handle").unique(),
  slackId: text("slack_id"),
  verificationStatus: text("verification_status"),
  hcaAccessToken: text("hca_access_token"),
  hcaRefreshToken: text("hca_refresh_token"),
  bio: text("bio"),
  avatarS3Key: text("avatar_s3_key"),
  avatarSource: avatarSourceEnum("avatar_source").notNull().default("dicebear"),
  socialLinks: jsonb("social_links"),
  isGlobalAdmin: boolean("is_global_admin").notNull().default(false),
  storageLimit: bigint("storage_limit", { mode: "number" })
    .notNull()
    .default(21474836480),
  isBanned: boolean("is_banned").notNull().default(false),
  bannedAt: timestamp("banned_at"),
  bannedById: uuid("banned_by_id").references((): AnyPgColumn => users.id),
  banReason: text("ban_reason"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const series = pgTable("series", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  bannerS3Key: text("banner_s3_key"),
  visibility: visibilityEnum("visibility").notNull().default("auth_required"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  bannerS3Key: text("banner_s3_key"),
  seriesId: uuid("series_id").references(() => series.id, {
    onDelete: "set null",
  }),
  visibility: visibilityEnum("visibility").notNull().default("auth_required"),
  allowPublicSharing: boolean("allow_public_sharing").notNull().default(true),
  requiresInvite: boolean("requires_invite").notNull().default(false),
  inviteCode: text("invite_code").unique(),
  eventDate: timestamp("event_date"),
  location: text("location"),
  locationCity: text("location_city"),
  locationCountry: text("location_country"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  uploadedById: uuid("uploaded_by_id")
    .notNull()
    .references(() => users.id),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  thumbnailS3Key: text("thumbnail_s3_key"),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  exifData: jsonb("exif_data"),
  takenAt: timestamp("taken_at"),
  caption: text("caption"),
  apiKeyId: uuid("api_key_id").references((): AnyPgColumn => apiKeys.id, {
    onDelete: "set null",
  }),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});
export const eventParticipants = pgTable("event_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});
export const seriesAdmins = pgTable("series_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  seriesId: uuid("series_id")
    .notNull()
    .references(() => series.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
});
export const eventAdmins = pgTable("event_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
});
export const mediaLikes = pgTable("media_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const mediaComments = pgTable("media_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  parentCommentId: uuid("parent_comment_id").references(
    (): AnyPgColumn => mediaComments.id,
    { onDelete: "cascade" },
  ),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const commentLikes = pgTable("comment_likes", {
  id: uuid("id").primaryKey().defaultRandom(),
  commentId: uuid("comment_id")
    .notNull()
    .references(() => mediaComments.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").default("blue"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const mediaTags = pgTable(
  "media_tags",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.mediaId, t.tagId] }),
  }),
);
export const mediaMentions = pgTable(
  "media_mentions",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.mediaId, t.userId] }),
  }),
);
export const shareLinks = pgTable("share_links", {
  token: text("token").primaryKey(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: shareTypeEnum("type").notNull().default("view"),
  views: integer("views").notNull().default(0),
  isRevoked: boolean("is_revoked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name"),
  note: text("note"),
  lastUsedAt: timestamp("last_used_at"),
  rateLimitWindowStart: timestamp("rate_limit_window_start"),
  rateLimitRequestCount: integer("rate_limit_request_count").default(0),
  isRevoked: boolean("is_revoked").notNull().default(false),
  canUpload: boolean("can_upload").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const dataExports = pgTable("data_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: exportStatusEnum("status").notNull().default("pending"),
  s3Key: text("s3_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: reportStatusEnum("status").notNull().default("pending"),
  resolvedAt: timestamp("resolved_at"),
  resolvedById: uuid("resolved_by_id").references(() => users.id),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: auditActionEnum("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const seriesRelations = relations(series, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [series.createdById],
    references: [users.id],
  }),
  events: many(events),
  admins: many(seriesAdmins),
}));
export const eventsRelations = relations(events, ({ one, many }) => ({
  series: one(series, {
    fields: [events.seriesId],
    references: [series.id],
  }),
  createdBy: one(users, {
    fields: [events.createdById],
    references: [users.id],
  }),
  media: many(media),
  participants: many(eventParticipants),
  admins: many(eventAdmins),
}));
export const mediaRelations = relations(media, ({ one, many }) => ({
  event: one(events, {
    fields: [media.eventId],
    references: [events.id],
  }),
  uploadedBy: one(users, {
    fields: [media.uploadedById],
    references: [users.id],
  }),
  likes: many(mediaLikes),
  comments: many(mediaComments),
  tags: many(mediaTags),
  shareLinks: many(shareLinks),
  mentions: many(mediaMentions),
  reports: many(reports),
  apiKey: one(apiKeys, {
    fields: [media.apiKeyId],
    references: [apiKeys.id],
  }),
}));
export const eventParticipantsRelations = relations(
  eventParticipants,
  ({ one }) => ({
    event: one(events, {
      fields: [eventParticipants.eventId],
      references: [events.id],
    }),
    user: one(users, {
      fields: [eventParticipants.userId],
      references: [users.id],
    }),
  }),
);
export const seriesAdminsRelations = relations(seriesAdmins, ({ one }) => ({
  series: one(series, {
    fields: [seriesAdmins.seriesId],
    references: [series.id],
  }),
  user: one(users, {
    fields: [seriesAdmins.userId],
    references: [users.id],
  }),
}));
export const eventAdminsRelations = relations(eventAdmins, ({ one }) => ({
  event: one(events, {
    fields: [eventAdmins.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventAdmins.userId],
    references: [users.id],
  }),
}));
export const mediaLikesRelations = relations(mediaLikes, ({ one }) => ({
  media: one(media, {
    fields: [mediaLikes.mediaId],
    references: [media.id],
  }),
  user: one(users, {
    fields: [mediaLikes.userId],
    references: [users.id],
  }),
}));
export const mediaCommentsRelations = relations(
  mediaComments,
  ({ one, many }) => ({
    media: one(media, {
      fields: [mediaComments.mediaId],
      references: [media.id],
    }),
    user: one(users, {
      fields: [mediaComments.userId],
      references: [users.id],
    }),
    parentComment: one(mediaComments, {
      fields: [mediaComments.parentCommentId],
      references: [mediaComments.id],
      relationName: "commentReplies",
    }),
    replies: many(mediaComments, {
      relationName: "commentReplies",
    }),
    likes: many(commentLikes),
  }),
);
export const commentLikesRelations = relations(commentLikes, ({ one }) => ({
  comment: one(mediaComments, {
    fields: [commentLikes.commentId],
    references: [mediaComments.id],
  }),
  user: one(users, {
    fields: [commentLikes.userId],
    references: [users.id],
  }),
}));
export const mediaMentionsRelations = relations(mediaMentions, ({ one }) => ({
  media: one(media, {
    fields: [mediaMentions.mediaId],
    references: [media.id],
  }),
  user: one(users, {
    fields: [mediaMentions.userId],
    references: [users.id],
  }),
}));
export const tagsRelations = relations(tags, ({ many }) => ({
  media: many(mediaTags),
}));
export const mediaTagsRelations = relations(mediaTags, ({ one }) => ({
  media: one(media, {
    fields: [mediaTags.mediaId],
    references: [media.id],
  }),
  tag: one(tags, {
    fields: [mediaTags.tagId],
    references: [tags.id],
  }),
}));
export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  media: one(media, {
    fields: [shareLinks.mediaId],
    references: [media.id],
  }),
  createdBy: one(users, {
    fields: [shareLinks.createdById],
    references: [users.id],
  }),
}));
export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));
export const dataExportsRelations = relations(dataExports, ({ one }) => ({
  user: one(users, {
    fields: [dataExports.userId],
    references: [users.id],
  }),
}));
export const reportsRelations = relations(reports, ({ one }) => ({
  media: one(media, {
    fields: [reports.mediaId],
    references: [media.id],
  }),
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
    relationName: "reporter",
  }),
  resolvedBy: one(users, {
    fields: [reports.resolvedById],
    references: [users.id],
    relationName: "resolver",
  }),
}));
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
export const usersRelations = relations(users, ({ many }) => ({
  createdSeries: many(series),
  createdEvents: many(events),
  uploadedMedia: many(media),
  eventParticipations: many(eventParticipants),
  seriesAdminRoles: many(seriesAdmins),
  eventAdminRoles: many(eventAdmins),
  mediaLikes: many(mediaLikes),
  mediaComments: many(mediaComments),
  commentLikes: many(commentLikes),
  shareLinks: many(shareLinks),
  mentions: many(mediaMentions),
  apiKeys: many(apiKeys),
  dataExports: many(dataExports),
  reports: many(reports, { relationName: "reporter" }),
  resolvedReports: many(reports, { relationName: "resolver" }),
}));
