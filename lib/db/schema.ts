import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
export const shareTypeEnum = pgEnum("share_type", ["view", "raw"]);
export const visibilityEnum = pgEnum("visibility", [
  "public",
  "auth_required",
  "unlisted",
]);
export const roleEnum = pgEnum("role", ["user", "admin"]);
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
export const blurRequestStatusEnum = pgEnum("blur_request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const faceAlgorithmEnum = pgEnum("face_algorithm", [
  "fast",
  "accurate",
  "very-accurate",
]);
export const faceJobStatusEnum = pgEnum("face_job_status", [
  "queued",
  "processing",
  "ready",
  "failed",
  "cancelled",
  "skipped",
]);
export const faceIndexStatusEnum = pgEnum("face_index_status", [
  "disabled",
  "queued",
  "indexing",
  "ready",
  "failed",
  "paused",
]);
export const faceMatchStatusEnum = pgEnum("face_match_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const blurRequestSourceEnum = pgEnum("blur_request_source", [
  "manual",
  "face",
  "automatic_face",
]);
export const slackNotificationCategoryEnum = pgEnum(
  "slack_notification_category",
  [
    "mention",
    "comment_on_upload",
    "comment_on_mention",
    "reply_to_comment",
    "like_on_upload",
    "like_on_mention",
    "comment_like",
    "feed_upload",
    "feed_comment",
    "feed_mention",
    "feed_like",
    "feed_comment_like",
  ],
);
export const slackNotificationStatusEnum = pgEnum("slack_notification_status", [
  "pending",
  "sending",
  "sent",
  "failed",
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
  "merge",
]);
export const userMigrationModeEnum = pgEnum("user_migration_mode", [
  "notify",
  "alias",
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
  socialLinks: jsonb("social_links"),
  isGlobalAdmin: boolean("is_global_admin").notNull().default(false),
  storageLimit: bigint("storage_limit", { mode: "number" })
    .notNull()
    .default(53687091200),
  isBanned: boolean("is_banned").notNull().default(false),
  bannedAt: timestamp("banned_at"),
  bannedById: uuid("banned_by_id").references((): AnyPgColumn => users.id),
  banReason: text("ban_reason"),
  migratedToUserId: uuid("migrated_to_user_id").references(
    (): AnyPgColumn => users.id,
    { onDelete: "set null" },
  ),
  migrationMode: userMigrationModeEnum("migration_mode"),
  migrationMessage: text("migration_message"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const slackNotificationPreferences = pgTable(
  "slack_notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: slackNotificationCategoryEnum("category").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.category] }),
  }),
);
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
export const events = pgTable(
  "events",
  {
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
  },
  (t) => ({
    visibilityIdx: index("events_visibility_idx").on(t.visibility),
    createdByCreatedAtIdx: index("events_created_by_created_at_idx").on(
      t.createdById,
      t.createdAt.desc(),
    ),
  }),
);
export const media = pgTable(
  "media",
  {
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
    originalS3Key: text("original_s3_key"),
    originalThumbnailS3Key: text("original_thumbnail_s3_key"),
    blurredS3Key: text("blurred_s3_key"),
    blurredThumbnailS3Key: text("blurred_thumbnail_s3_key"),
    blurStatus: blurRequestStatusEnum("blur_status"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    duration: doublePrecision("duration"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    exifData: jsonb("exif_data"),
    metadata: jsonb("metadata"),
    globalAdminOnlyDelete: boolean("global_admin_only_delete")
      .notNull()
      .default(false),
    takenAt: timestamp("taken_at"),
    caption: text("caption"),
    apiKeyId: uuid("api_key_id").references((): AnyPgColumn => apiKeys.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  },
  (t) => ({
    eventUploadedAtIdx: index("media_event_uploaded_at_idx").on(
      t.eventId,
      t.uploadedAt.desc(),
    ),
    uploadedByIdIdx: index("media_uploaded_by_id_idx").on(t.uploadedById),
    apiKeyIdIdx: index("media_api_key_id_idx").on(t.apiKeyId),
  }),
);
export const eventParticipants = pgTable(
  "event_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => ({
    userJoinedAtIdx: index("event_participants_user_joined_at_idx").on(
      t.userId,
      t.joinedAt.desc(),
    ),
    userEventIdx: index("event_participants_user_event_idx").on(
      t.userId,
      t.eventId,
    ),
  }),
);
export const seriesAdmins = pgTable(
  "series_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (t) => ({
    userSeriesIdx: index("series_admins_user_series_idx").on(
      t.userId,
      t.seriesId,
    ),
  }),
);
export const eventAdmins = pgTable(
  "event_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (t) => ({
    userEventIdx: index("event_admins_user_event_idx").on(t.userId, t.eventId),
  }),
);
export const pendingSeriesAdmins = pgTable("pending_series_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  seriesId: uuid("series_id")
    .notNull()
    .references(() => series.id, { onDelete: "cascade" }),
  slackId: text("slack_id").notNull(),
  grantedById: uuid("granted_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  claimedById: uuid("claimed_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  claimedAt: timestamp("claimed_at"),
});
export const pendingEventAdmins = pgTable("pending_event_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  slackId: text("slack_id").notNull(),
  grantedById: uuid("granted_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  claimedById: uuid("claimed_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  claimedAt: timestamp("claimed_at"),
});
export const pendingMediaOwnership = pgTable("pending_media_ownership", {
  id: uuid("id").primaryKey().defaultRandom(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "cascade" }),
  slackId: text("slack_id"),
  hackclubId: text("hackclub_id"),
  showPlaceholder: boolean("show_placeholder").notNull().default(false),
  previousOwnerId: uuid("previous_owner_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedById: uuid("resolved_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
});
export const mediaLikes = pgTable(
  "media_likes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userMediaIdx: index("media_likes_user_media_idx").on(t.userId, t.mediaId),
  }),
);
export const mediaComments = pgTable(
  "media_comments",
  {
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
  },
  (t) => ({
    mediaCreatedAtIdx: index("media_comments_media_created_at_idx").on(
      t.mediaId,
      t.createdAt.desc(),
    ),
  }),
);
export const slackNotificationQueue = pgTable(
  "slack_notification_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    channelId: text("channel_id"),
    category: slackNotificationCategoryEnum("category").notNull(),
    actionKey: text("action_key").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    mediaId: uuid("media_id").references(() => media.id, {
      onDelete: "cascade",
    }),
    commentId: uuid("comment_id").references(() => mediaComments.id, {
      onDelete: "cascade",
    }),
    metadata: jsonb("metadata"),
    status: slackNotificationStatusEnum("status").notNull().default("pending"),
    scheduledFor: timestamp("scheduled_for").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    sentAt: timestamp("sent_at"),
    error: text("error"),
  },
  (t) => ({
    dueIdx: index("slack_notification_queue_due_idx").on(
      t.status,
      t.scheduledFor,
    ),
    recipientBatchIdx: index("slack_notification_queue_recipient_batch_idx").on(
      t.recipientUserId,
      t.category,
      t.actionKey,
      t.status,
    ),
    channelBatchIdx: index("slack_notification_queue_channel_batch_idx").on(
      t.channelId,
      t.category,
      t.actionKey,
      t.status,
    ),
  }),
);
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
export const faceSystemSettings = pgTable("face_system_settings", {
  id: text("id").primaryKey().default("global"),
  scanNewUploads: boolean("scan_new_uploads").notNull().default(true),
  autoSuggestions: boolean("auto_suggestions").notNull().default(true),
  paused: boolean("paused").notNull().default(false),
  algorithm: faceAlgorithmEnum("algorithm").notNull().default("accurate"),
  maxFaces: integer("max_faces").notNull().default(300),
  suggestionThreshold: doublePrecision("suggestion_threshold")
    .notNull()
    .default(0.62),
  blurThreshold: doublePrecision("blur_threshold").notNull().default(0.82),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const facePrivacyPreferences = pgTable("face_privacy_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  matchingEnabled: boolean("matching_enabled").notNull().default(false),
  autoSuggestionsEnabled: boolean("auto_suggestions_enabled")
    .notNull()
    .default(true),
  hideProfile: boolean("hide_profile").notNull().default(false),
  hideMentions: boolean("hide_mentions").notNull().default(false),
  hideAiSuggestions: boolean("hide_ai_suggestions").notNull().default(false),
  consentedAt: timestamp("consented_at"),
  revokedAt: timestamp("revoked_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const faceScans = pgTable(
  "face_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: faceJobStatusEnum("status").notNull().default("queued"),
    isActive: boolean("is_active").notNull().default(false),
    highQuality: boolean("high_quality").notNull().default(false),
    algorithm: faceAlgorithmEnum("algorithm").notNull().default("accurate"),
    modelVersion: text("model_version").notNull().default("roc-3.15.0"),
    templateEncrypted: text("template_encrypted"),
    quality: doublePrecision("quality"),
    spoof: doublePrecision("spoof"),
    spoofQuality: doublePrecision("spoof_quality"),
    error: text("error"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userCreatedAtIdx: index("face_scans_user_created_at_idx").on(
      t.userId,
      t.createdAt.desc(),
    ),
    activeUserIdx: uniqueIndex("face_scans_active_user_idx")
      .on(t.userId)
      .where(sql`${t.isActive} = true`),
  }),
);
export const eventFaceIndexes = pgTable(
  "event_face_indexes",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => events.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    status: faceIndexStatusEnum("status").notNull().default("disabled"),
    galleryId: text("gallery_id"),
    algorithm: faceAlgorithmEnum("algorithm").notNull().default("accurate"),
    modelVersion: text("model_version").notNull().default("roc-3.15.0"),
    revision: integer("revision").notNull().default(1),
    maxFaces: integer("max_faces").notNull().default(300),
    minQuality: doublePrecision("min_quality"),
    suggestionThreshold: doublePrecision("suggestion_threshold")
      .notNull()
      .default(0.62),
    blurThreshold: doublePrecision("blur_threshold").notNull().default(0.82),
    requestedAt: timestamp("requested_at"),
    startedAt: timestamp("started_at"),
    indexedAt: timestamp("indexed_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    galleryIdx: uniqueIndex("event_face_indexes_gallery_idx").on(t.galleryId),
    statusIdx: index("event_face_indexes_status_idx").on(t.status, t.updatedAt),
  }),
);
export const mediaFaceScans = pgTable(
  "media_face_scans",
  {
    mediaId: uuid("media_id")
      .primaryKey()
      .references(() => media.id, { onDelete: "cascade" }),
    status: faceJobStatusEnum("status").notNull().default("queued"),
    eventIndexRevision: integer("event_index_revision").notNull().default(1),
    algorithm: faceAlgorithmEnum("algorithm").notNull().default("accurate"),
    modelVersion: text("model_version").notNull().default("roc-3.15.0"),
    sourceS3Key: text("source_s3_key").notNull(),
    workerJobId: text("worker_job_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    workerJobIdx: uniqueIndex("media_face_scans_worker_job_idx").on(
      t.workerJobId,
    ),
    statusIdx: index("media_face_scans_status_idx").on(t.status, t.updatedAt),
  }),
);
export const mediaFaceDetections = pgTable(
  "media_face_detections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaFaceScans.mediaId, { onDelete: "cascade" }),
    faceIndex: integer("face_index").notNull(),
    boxX: doublePrecision("box_x").notNull(),
    boxY: doublePrecision("box_y").notNull(),
    boxWidth: doublePrecision("box_width").notNull(),
    boxHeight: doublePrecision("box_height").notNull(),
    rotation: doublePrecision("rotation"),
    confidence: doublePrecision("confidence"),
    quality: doublePrecision("quality"),
    templateEncrypted: text("template_encrypted").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    mediaFaceIdx: uniqueIndex("media_face_detections_media_face_idx").on(
      t.mediaId,
      t.faceIndex,
    ),
  }),
);
export const faceBlurSubscriptions = pgTable(
  "face_blur_subscriptions",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    faceScanId: uuid("face_scan_id").references(() => faceScans.id, {
      onDelete: "set null",
    }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.userId] }),
    userActiveIdx: index("face_blur_subscriptions_user_active_idx").on(
      t.userId,
      t.active,
    ),
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
  isAdmin: boolean("is_admin").notNull().default(false),
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
export const blurRequests = pgTable(
  "blur_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: blurRequestStatusEnum("status").notNull().default("pending"),
    source: blurRequestSourceEnum("source").notNull().default("manual"),
    faceScanId: uuid("face_scan_id").references(() => faceScans.id, {
      onDelete: "set null",
    }),
    faceDetectionId: uuid("face_detection_id").references(
      () => mediaFaceDetections.id,
      { onDelete: "set null" },
    ),
    regions: jsonb("regions").notNull(),
    blurredS3Key: text("blurred_s3_key").notNull(),
    blurredThumbnailS3Key: text("blurred_thumbnail_s3_key"),
    resolvedAt: timestamp("resolved_at"),
    resolvedById: uuid("resolved_by_id").references(() => users.id),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    activeRequesterMediaIdx: uniqueIndex(
      "blur_requests_active_requester_media_idx",
    )
      .on(t.requesterId, t.mediaId)
      .where(sql`${t.status} in ('pending', 'approved')`),
  }),
);
export const faceMatchSuggestions = pgTable(
  "face_match_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    faceScanId: uuid("face_scan_id")
      .notNull()
      .references(() => faceScans.id, { onDelete: "cascade" }),
    detectionId: uuid("detection_id")
      .notNull()
      .references(() => mediaFaceDetections.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    similarity: doublePrecision("similarity").notNull(),
    status: faceMatchStatusEnum("status").notNull().default("pending"),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userDetectionIdx: uniqueIndex(
      "face_match_suggestions_user_detection_idx",
    ).on(t.userId, t.detectionId),
    userStatusIdx: index("face_match_suggestions_user_status_idx").on(
      t.userId,
      t.status,
      t.similarity.desc(),
    ),
    mediaStatusIdx: index("face_match_suggestions_media_status_idx").on(
      t.mediaId,
      t.status,
    ),
  }),
);
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
  pendingAdmins: many(pendingSeriesAdmins),
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
  pendingAdmins: many(pendingEventAdmins),
  faceIndex: one(eventFaceIndexes),
  faceBlurSubscriptions: many(faceBlurSubscriptions),
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
  blurRequests: many(blurRequests),
  faceScan: one(mediaFaceScans),
  faceMatchSuggestions: many(faceMatchSuggestions),
  apiKey: one(apiKeys, {
    fields: [media.apiKeyId],
    references: [apiKeys.id],
  }),
  pendingOwnerships: many(pendingMediaOwnership),
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
export const pendingSeriesAdminsRelations = relations(
  pendingSeriesAdmins,
  ({ one }) => ({
    series: one(series, {
      fields: [pendingSeriesAdmins.seriesId],
      references: [series.id],
    }),
    grantedBy: one(users, {
      fields: [pendingSeriesAdmins.grantedById],
      references: [users.id],
      relationName: "pending_series_admin_granter",
    }),
    claimedBy: one(users, {
      fields: [pendingSeriesAdmins.claimedById],
      references: [users.id],
      relationName: "pending_series_admin_claimant",
    }),
  }),
);
export const pendingEventAdminsRelations = relations(
  pendingEventAdmins,
  ({ one }) => ({
    event: one(events, {
      fields: [pendingEventAdmins.eventId],
      references: [events.id],
    }),
    grantedBy: one(users, {
      fields: [pendingEventAdmins.grantedById],
      references: [users.id],
      relationName: "pending_event_admin_granter",
    }),
    claimedBy: one(users, {
      fields: [pendingEventAdmins.claimedById],
      references: [users.id],
      relationName: "pending_event_admin_claimant",
    }),
  }),
);
export const pendingMediaOwnershipRelations = relations(
  pendingMediaOwnership,
  ({ one }) => ({
    media: one(media, {
      fields: [pendingMediaOwnership.mediaId],
      references: [media.id],
    }),
    previousOwner: one(users, {
      fields: [pendingMediaOwnership.previousOwnerId],
      references: [users.id],
      relationName: "pending_media_ownership_previous_owner",
    }),
    createdBy: one(users, {
      fields: [pendingMediaOwnership.createdById],
      references: [users.id],
      relationName: "pending_media_ownership_creator",
    }),
    resolvedBy: one(users, {
      fields: [pendingMediaOwnership.resolvedById],
      references: [users.id],
      relationName: "pending_media_ownership_resolver",
    }),
  }),
);
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
export const blurRequestsRelations = relations(blurRequests, ({ one }) => ({
  media: one(media, {
    fields: [blurRequests.mediaId],
    references: [media.id],
  }),
  requester: one(users, {
    fields: [blurRequests.requesterId],
    references: [users.id],
    relationName: "blur_requester",
  }),
  resolvedBy: one(users, {
    fields: [blurRequests.resolvedById],
    references: [users.id],
    relationName: "blur_resolver",
  }),
  faceScan: one(faceScans, {
    fields: [blurRequests.faceScanId],
    references: [faceScans.id],
  }),
  faceDetection: one(mediaFaceDetections, {
    fields: [blurRequests.faceDetectionId],
    references: [mediaFaceDetections.id],
  }),
}));
export const facePrivacyPreferencesRelations = relations(
  facePrivacyPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [facePrivacyPreferences.userId],
      references: [users.id],
    }),
  }),
);
export const faceScansRelations = relations(faceScans, ({ one, many }) => ({
  user: one(users, {
    fields: [faceScans.userId],
    references: [users.id],
  }),
  suggestions: many(faceMatchSuggestions),
  blurSubscriptions: many(faceBlurSubscriptions),
}));
export const eventFaceIndexesRelations = relations(
  eventFaceIndexes,
  ({ one }) => ({
    event: one(events, {
      fields: [eventFaceIndexes.eventId],
      references: [events.id],
    }),
  }),
);
export const mediaFaceScansRelations = relations(
  mediaFaceScans,
  ({ one, many }) => ({
    media: one(media, {
      fields: [mediaFaceScans.mediaId],
      references: [media.id],
    }),
    detections: many(mediaFaceDetections),
  }),
);
export const mediaFaceDetectionsRelations = relations(
  mediaFaceDetections,
  ({ one, many }) => ({
    media: one(media, {
      fields: [mediaFaceDetections.mediaId],
      references: [media.id],
    }),
    mediaScan: one(mediaFaceScans, {
      fields: [mediaFaceDetections.mediaId],
      references: [mediaFaceScans.mediaId],
    }),
    suggestions: many(faceMatchSuggestions),
    blurRequests: many(blurRequests),
  }),
);
export const faceMatchSuggestionsRelations = relations(
  faceMatchSuggestions,
  ({ one }) => ({
    user: one(users, {
      fields: [faceMatchSuggestions.userId],
      references: [users.id],
      relationName: "face_suggestion_user",
    }),
    reviewedBy: one(users, {
      fields: [faceMatchSuggestions.reviewedById],
      references: [users.id],
      relationName: "face_suggestion_reviewer",
    }),
    faceScan: one(faceScans, {
      fields: [faceMatchSuggestions.faceScanId],
      references: [faceScans.id],
    }),
    detection: one(mediaFaceDetections, {
      fields: [faceMatchSuggestions.detectionId],
      references: [mediaFaceDetections.id],
    }),
    media: one(media, {
      fields: [faceMatchSuggestions.mediaId],
      references: [media.id],
    }),
  }),
);
export const faceBlurSubscriptionsRelations = relations(
  faceBlurSubscriptions,
  ({ one }) => ({
    event: one(events, {
      fields: [faceBlurSubscriptions.eventId],
      references: [events.id],
    }),
    user: one(users, {
      fields: [faceBlurSubscriptions.userId],
      references: [users.id],
    }),
    faceScan: one(faceScans, {
      fields: [faceBlurSubscriptions.faceScanId],
      references: [faceScans.id],
    }),
  }),
);
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
export const usersRelations = relations(users, ({ one, many }) => ({
  createdSeries: many(series),
  createdEvents: many(events),
  uploadedMedia: many(media),
  eventParticipations: many(eventParticipants),
  seriesAdminRoles: many(seriesAdmins),
  eventAdminRoles: many(eventAdmins),
  pendingSeriesAdminGrants: many(pendingSeriesAdmins, {
    relationName: "pending_series_admin_granter",
  }),
  claimedPendingSeriesAdminGrants: many(pendingSeriesAdmins, {
    relationName: "pending_series_admin_claimant",
  }),
  pendingEventAdminGrants: many(pendingEventAdmins, {
    relationName: "pending_event_admin_granter",
  }),
  claimedPendingEventAdminGrants: many(pendingEventAdmins, {
    relationName: "pending_event_admin_claimant",
  }),
  pendingMediaOwnershipGrants: many(pendingMediaOwnership, {
    relationName: "pending_media_ownership_creator",
  }),
  pendingMediaOwnershipPrevOwners: many(pendingMediaOwnership, {
    relationName: "pending_media_ownership_previous_owner",
  }),
  resolvedPendingMediaOwnerships: many(pendingMediaOwnership, {
    relationName: "pending_media_ownership_resolver",
  }),
  mediaLikes: many(mediaLikes),
  mediaComments: many(mediaComments),
  commentLikes: many(commentLikes),
  shareLinks: many(shareLinks),
  mentions: many(mediaMentions),
  apiKeys: many(apiKeys),
  dataExports: many(dataExports),
  reports: many(reports, { relationName: "reporter" }),
  resolvedReports: many(reports, { relationName: "resolver" }),
  blurRequests: many(blurRequests, { relationName: "blur_requester" }),
  resolvedBlurRequests: many(blurRequests, { relationName: "blur_resolver" }),
  facePrivacyPreference: one(facePrivacyPreferences),
  faceScans: many(faceScans),
  faceSuggestions: many(faceMatchSuggestions, {
    relationName: "face_suggestion_user",
  }),
  reviewedFaceSuggestions: many(faceMatchSuggestions, {
    relationName: "face_suggestion_reviewer",
  }),
  faceBlurSubscriptions: many(faceBlurSubscriptions),
}));
