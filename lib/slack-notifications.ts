import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  media,
  mediaComments,
  mediaMentions,
  slackNotificationPreferences,
  slackNotificationQueue,
  users,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getUserDisplayName } from "@/lib/user-display";

const BATCH_DELAY_MS = 10 * 60 * 1000;
const MAX_BATCH_ITEMS = 8;
const MAX_LINKED_ITEMS_IN_MESSAGE = 10;
const PHOTOS_FEED_CHANNEL =
  process.env.SLACK_PHOTOS_FEED_CHANNEL_ID || "#photos-feed";

export const SLACK_NOTIFICATION_CATEGORIES = [
  {
    key: "mention",
    label: "Tagged in photos",
    description: "When someone tags you in photos.",
    defaultEnabled: true,
  },
  {
    key: "comment_on_upload",
    label: "Comments on your uploads",
    description: "When someone comments on a photo you uploaded.",
    defaultEnabled: true,
  },
  {
    key: "comment_on_mention",
    label: "Comments on photos you are in",
    description: "When someone comments on a photo you were tagged in.",
    defaultEnabled: true,
  },
  {
    key: "reply_to_comment",
    label: "Replies to your comments",
    description: "When someone replies to a comment you wrote.",
    defaultEnabled: true,
  },
  {
    key: "like_on_upload",
    label: "Likes on your uploads",
    description: "When someone likes a photo you uploaded.",
    defaultEnabled: true,
  },
  {
    key: "like_on_mention",
    label: "Likes on photos you are in",
    description:
      "When someone likes a photo you were tagged in. Off by default.",
    defaultEnabled: false,
  },
  {
    key: "comment_like",
    label: "Likes on your comments",
    description: "When someone likes a comment you wrote.",
    defaultEnabled: true,
  },
] as const;

type PersonalCategory = (typeof SLACK_NOTIFICATION_CATEGORIES)[number]["key"];
type FeedCategory =
  | "feed_upload"
  | "feed_comment"
  | "feed_mention"
  | "feed_like"
  | "feed_comment_like";
type Category = PersonalCategory | FeedCategory;
type SlackBlock = Record<string, unknown>;

type QueueMetadata = {
  eventName?: string;
  eventSlug?: string;
  actorName?: string;
  actorHandle?: string | null;
  actorSlackId?: string | null;
  recipientSlackId?: string | null;
  mediaFilename?: string;
  commentPreview?: string;
  uploadCount?: number;
};

type QueueRow = typeof slackNotificationQueue.$inferSelect & {
  metadata: QueueMetadata | null;
};

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "https://photos.hackclub.com"
  ).replace(/\/$/, "");
}

function eventUrl(slug?: string | null, id?: string | null) {
  return `${appBaseUrl()}/events/${encodeURIComponent(slug || id || "")}`;
}

function mediaUrl(row: QueueRow) {
  const url = new URL(eventUrl(row.metadata?.eventSlug, row.eventId));
  if (row.mediaId) url.searchParams.set("media", row.mediaId);
  return url.toString();
}

function profileUrl(user: { handle?: string | null; id?: string | null }) {
  const key = user.handle || user.id || "";
  return `${appBaseUrl()}/users/${encodeURIComponent(key)}`;
}

function slackUser(slackId?: string | null) {
  return slackId ? `<@${slackId}>` : null;
}

function linked(text: string, url: string) {
  return `<${url}|${sanitizeSlackText(text)}>`;
}

function sanitizeSlackText(text: string) {
  return [...text]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function actorLabel(row: QueueRow, mention: boolean) {
  const name = row.metadata?.actorName || "Someone";
  if (mention && row.metadata?.actorSlackId)
    return slackUser(row.metadata.actorSlackId) || sanitizeSlackText(name);
  return linked(
    name,
    profileUrl({ handle: row.metadata?.actorHandle, id: row.actorUserId }),
  );
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function describeLinkedItems(
  count: number,
  singular: string,
  plural: string,
  links: string[],
) {
  if (count === 1) return links[0] || `a ${singular}`;
  if (count > MAX_LINKED_ITEMS_IN_MESSAGE) return `${count} ${plural}`;
  return `several ${plural}: ${links.slice(0, count).join(" ")}`;
}

function describeCount(count: number, singular: string, plural: string) {
  if (count === 1) return `a ${singular}`;
  if (count > MAX_LINKED_ITEMS_IN_MESSAGE) return `${count} ${plural}`;
  return `several ${plural}`;
}

function isFeedCategory(category: string) {
  return category.startsWith("feed_");
}

function isFeedRow(row: QueueRow) {
  return Boolean(row.channelId) || isFeedCategory(row.category);
}

function quoteCommentPreview(text?: string) {
  const preview = text?.trim();
  return preview ? `: “${sanitizeSlackText(preview)}”` : "";
}

function canPostToSlackFeed(event: { visibility: string }) {
  return event.visibility === "public" || event.visibility === "auth_required";
}

async function slackApi(method: string, body: Record<string, unknown>) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (!json.ok) throw new Error(json.error || `Slack ${method} failed`);
  return json;
}

export async function verifySlackRequest(req: Request, rawBody: string) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return false;
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!timestamp || !signature || !Number.isFinite(age) || age > 60 * 5)
    return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", secret).update(base).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function isEnabled(userId: string, category: Category) {
  const pref = await db.query.slackNotificationPreferences.findFirst({
    where: and(
      eq(slackNotificationPreferences.userId, userId),
      eq(slackNotificationPreferences.category, category),
    ),
  });
  const defaultEnabled = SLACK_NOTIFICATION_CATEGORIES.find(
    (item) => item.key === category,
  )?.defaultEnabled;
  return pref?.enabled ?? defaultEnabled ?? false;
}

async function enqueue(values: {
  recipientUserId?: string;
  channelId?: string;
  category: Category;
  actionKey: string;
  actorUserId?: string | null;
  eventId?: string | null;
  mediaId?: string | null;
  commentId?: string | null;
  metadata?: QueueMetadata;
}) {
  if (!values.recipientUserId && !values.channelId) return;
  const scheduledFor = new Date(Date.now() + BATCH_DELAY_MS);
  await db.insert(slackNotificationQueue).values({
    recipientUserId: values.recipientUserId || null,
    channelId: values.channelId || null,
    category: values.category,
    actionKey: values.actionKey,
    actorUserId: values.actorUserId || null,
    eventId: values.eventId || null,
    mediaId: values.mediaId || null,
    commentId: values.commentId || null,
    metadata: values.metadata || null,
    scheduledFor,
  });
  await db
    .update(slackNotificationQueue)
    .set({ scheduledFor, updatedAt: new Date() })
    .where(
      and(
        eq(slackNotificationQueue.status, "pending"),
        eq(slackNotificationQueue.category, values.category),
        eq(slackNotificationQueue.actionKey, values.actionKey),
        values.recipientUserId
          ? eq(slackNotificationQueue.recipientUserId, values.recipientUserId)
          : eq(slackNotificationQueue.channelId, values.channelId || ""),
      ),
    );
}

export async function notifyMention(
  mediaId: string,
  mentionedUserId: string,
  actorUserId: string,
) {
  if (
    mentionedUserId === actorUserId ||
    !(await isEnabled(mentionedUserId, "mention"))
  )
    return;
  const item = await db.query.media.findFirst({
    where: eq(media.id, mediaId),
    with: { event: true, uploadedBy: true },
  });
  const [actor, recipient] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, actorUserId) }),
    db.query.users.findFirst({ where: eq(users.id, mentionedUserId) }),
  ]);
  if (!item || !actor || !recipient) return;
  await enqueue({
    recipientUserId: mentionedUserId,
    category: "mention",
    actionKey: "tagged_you",
    actorUserId,
    eventId: item.eventId,
    mediaId,
    metadata: {
      eventName: item.event.name,
      eventSlug: item.event.slug,
      actorName: getUserDisplayName(actor),
      actorHandle: actor.handle,
      actorSlackId: actor.slackId,
      recipientSlackId: recipient.slackId,
      mediaFilename: item.filename,
    },
  });
  await notifyMentionForFeed(mediaId, mentionedUserId, actorUserId);
}

export async function notifyComment(commentId: string) {
  const comment = await db.query.mediaComments.findFirst({
    where: eq(mediaComments.id, commentId),
    with: { user: true, media: { with: { event: true, uploadedBy: true } } },
  });
  if (!comment) return;
  const item = comment.media;
  const actor = comment.user;
  const targets = new Set<string>();
  const targetCategories = new Map<string, Category>();
  if (
    item.uploadedById !== actor.id &&
    (await isEnabled(item.uploadedById, "comment_on_upload"))
  ) {
    targets.add(item.uploadedById);
    targetCategories.set(item.uploadedById, "comment_on_upload");
  }
  if (comment.parentCommentId) {
    const parent = await db.query.mediaComments.findFirst({
      where: eq(mediaComments.id, comment.parentCommentId),
    });
    if (
      parent?.userId &&
      parent.userId !== actor.id &&
      (await isEnabled(parent.userId, "reply_to_comment"))
    ) {
      targets.add(parent.userId);
      targetCategories.set(parent.userId, "reply_to_comment");
    }
  }
  const mentions = await db.query.mediaMentions.findMany({
    where: eq(mediaMentions.mediaId, item.id),
  });
  for (const mention of mentions) {
    if (
      mention.userId !== actor.id &&
      (await isEnabled(mention.userId, "comment_on_mention"))
    ) {
      targets.add(mention.userId);
      if (!targetCategories.has(mention.userId)) {
        targetCategories.set(mention.userId, "comment_on_mention");
      }
    }
  }
  const recipients = targets.size
    ? await db.query.users.findMany({ where: inArray(users.id, [...targets]) })
    : [];
  for (const recipient of recipients) {
    await enqueue({
      recipientUserId: recipient.id,
      category: targetCategories.get(recipient.id) || "comment_on_mention",
      actionKey: "commented",
      actorUserId: actor.id,
      eventId: item.eventId,
      mediaId: item.id,
      commentId,
      metadata: {
        eventName: item.event.name,
        eventSlug: item.event.slug,
        actorName: getUserDisplayName(actor),
        actorHandle: actor.handle,
        actorSlackId: actor.slackId,
        recipientSlackId: recipient.slackId,
        mediaFilename: item.filename,
        commentPreview: comment.content.slice(0, 140),
      },
    });
  }
  await notifyCommentForFeed(commentId);
}

export async function notifyMediaLike(mediaId: string, actorUserId: string) {
  const item = await db.query.media.findFirst({
    where: eq(media.id, mediaId),
    with: { event: true, uploadedBy: true },
  });
  const actor = await db.query.users.findFirst({
    where: eq(users.id, actorUserId),
  });
  if (!item || !actor) return;
  const targets = new Set<string>();
  const targetCategories = new Map<string, Category>();
  if (
    item.uploadedById !== actor.id &&
    (await isEnabled(item.uploadedById, "like_on_upload"))
  ) {
    targets.add(item.uploadedById);
    targetCategories.set(item.uploadedById, "like_on_upload");
  }
  const mentions = await db.query.mediaMentions.findMany({
    where: eq(mediaMentions.mediaId, item.id),
  });
  for (const mention of mentions) {
    if (
      mention.userId !== actor.id &&
      (await isEnabled(mention.userId, "like_on_mention"))
    ) {
      targets.add(mention.userId);
      if (!targetCategories.has(mention.userId)) {
        targetCategories.set(mention.userId, "like_on_mention");
      }
    }
  }
  const recipients = targets.size
    ? await db.query.users.findMany({ where: inArray(users.id, [...targets]) })
    : [];
  for (const recipient of recipients) {
    await enqueue({
      recipientUserId: recipient.id,
      category: targetCategories.get(recipient.id) || "like_on_mention",
      actionKey: "liked_photo",
      actorUserId,
      eventId: item.eventId,
      mediaId: item.id,
      metadata: {
        eventName: item.event.name,
        eventSlug: item.event.slug,
        actorName: getUserDisplayName(actor),
        actorHandle: actor.handle,
        actorSlackId: actor.slackId,
        recipientSlackId: recipient.slackId,
        mediaFilename: item.filename,
      },
    });
  }
  await notifyMediaLikeForFeed(mediaId, actorUserId);
}

export async function notifyCommentLike(
  commentId: string,
  actorUserId: string,
) {
  const comment = await db.query.mediaComments.findFirst({
    where: eq(mediaComments.id, commentId),
    with: { user: true, media: { with: { event: true } } },
  });
  const actor = await db.query.users.findFirst({
    where: eq(users.id, actorUserId),
  });
  if (!comment || !actor || comment.userId === actor.id) {
    if (comment && actor)
      await notifyCommentLikeForFeed(commentId, actorUserId);
    return;
  }
  if (await isEnabled(comment.userId, "comment_like")) {
    await enqueue({
      recipientUserId: comment.userId,
      category: "comment_like",
      actionKey: "liked_comment",
      actorUserId,
      eventId: comment.media.eventId,
      mediaId: comment.mediaId,
      commentId,
      metadata: {
        eventName: comment.media.event.name,
        eventSlug: comment.media.event.slug,
        actorName: getUserDisplayName(actor),
        actorHandle: actor.handle,
        actorSlackId: actor.slackId,
        recipientSlackId: comment.user.slackId,
        mediaFilename: comment.media.filename,
        commentPreview: comment.content.slice(0, 140),
      },
    });
  }
  await notifyCommentLikeForFeed(commentId, actorUserId);
}

export async function notifyUploadForFeed(mediaId: string) {
  const item = await db.query.media.findFirst({
    where: and(eq(media.id, mediaId), isNull(media.blurStatus)),
    with: { event: true, uploadedBy: true },
  });
  if (!item || !canPostToSlackFeed(item.event)) return;
  await enqueue({
    channelId: PHOTOS_FEED_CHANNEL,
    category: "feed_upload",
    actionKey: `uploaded:${item.uploadedById}`,
    actorUserId: item.uploadedById,
    eventId: item.eventId,
    mediaId,
    metadata: {
      eventName: item.event.name,
      eventSlug: item.event.slug,
      actorName: getUserDisplayName(item.uploadedBy),
      actorHandle: item.uploadedBy.handle,
      actorSlackId: item.uploadedBy.slackId,
      uploadCount: 1,
    },
  });
}

async function notifyCommentForFeed(commentId: string) {
  const comment = await db.query.mediaComments.findFirst({
    where: eq(mediaComments.id, commentId),
    with: { user: true, media: { with: { event: true } } },
  });
  if (!comment || !canPostToSlackFeed(comment.media.event)) return;
  await enqueue({
    channelId: PHOTOS_FEED_CHANNEL,
    category: "feed_comment",
    actionKey: `commented:${comment.userId}`,
    actorUserId: comment.userId,
    eventId: comment.media.eventId,
    mediaId: comment.mediaId,
    commentId,
    metadata: {
      eventName: comment.media.event.name,
      eventSlug: comment.media.event.slug,
      actorName: getUserDisplayName(comment.user),
      actorHandle: comment.user.handle,
      actorSlackId: comment.user.slackId,
      mediaFilename: comment.media.filename,
      commentPreview: comment.content.slice(0, 140),
    },
  });
}

async function notifyMentionForFeed(
  mediaId: string,
  mentionedUserId: string,
  actorUserId: string,
) {
  const item = await db.query.media.findFirst({
    where: and(eq(media.id, mediaId), isNull(media.blurStatus)),
    with: { event: true },
  });
  const [actor, mentioned] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, actorUserId) }),
    db.query.users.findFirst({ where: eq(users.id, mentionedUserId) }),
  ]);
  if (!item || !canPostToSlackFeed(item.event) || !actor || !mentioned) return;
  await enqueue({
    channelId: PHOTOS_FEED_CHANNEL,
    category: "feed_mention",
    actionKey: `tagged:${actorUserId}`,
    actorUserId,
    eventId: item.eventId,
    mediaId,
    metadata: {
      eventName: item.event.name,
      eventSlug: item.event.slug,
      actorName: getUserDisplayName(actor),
      actorHandle: actor.handle,
      actorSlackId: actor.slackId,
      mediaFilename: item.filename,
      commentPreview: getUserDisplayName(mentioned),
    },
  });
}

async function notifyMediaLikeForFeed(mediaId: string, actorUserId: string) {
  const item = await db.query.media.findFirst({
    where: and(eq(media.id, mediaId), isNull(media.blurStatus)),
    with: { event: true },
  });
  const actor = await db.query.users.findFirst({
    where: eq(users.id, actorUserId),
  });
  if (!item || !canPostToSlackFeed(item.event) || !actor) return;
  await enqueue({
    channelId: PHOTOS_FEED_CHANNEL,
    category: "feed_like",
    actionKey: `liked:${actorUserId}`,
    actorUserId,
    eventId: item.eventId,
    mediaId,
    metadata: {
      eventName: item.event.name,
      eventSlug: item.event.slug,
      actorName: getUserDisplayName(actor),
      actorHandle: actor.handle,
      actorSlackId: actor.slackId,
      mediaFilename: item.filename,
    },
  });
}

async function notifyCommentLikeForFeed(
  commentId: string,
  actorUserId: string,
) {
  const comment = await db.query.mediaComments.findFirst({
    where: eq(mediaComments.id, commentId),
    with: { media: { with: { event: true } } },
  });
  const actor = await db.query.users.findFirst({
    where: eq(users.id, actorUserId),
  });
  if (!comment || !canPostToSlackFeed(comment.media.event) || !actor) return;
  await enqueue({
    channelId: PHOTOS_FEED_CHANNEL,
    category: "feed_comment_like",
    actionKey: `liked_comment:${actorUserId}`,
    actorUserId,
    eventId: comment.media.eventId,
    mediaId: comment.mediaId,
    commentId,
    metadata: {
      eventName: comment.media.event.name,
      eventSlug: comment.media.event.slug,
      actorName: getUserDisplayName(actor),
      actorHandle: actor.handle,
      actorSlackId: actor.slackId,
      mediaFilename: comment.media.filename,
      commentPreview: comment.content.slice(0, 140),
    },
  });
}

function personalBlocks(rows: QueueRow[]): SlackBlock[] {
  const first = rows[0];
  const count = rows.length;
  const actors = unique(rows.map((r) => actorLabel(r, true))).slice(0, 3);
  const event = linked(
    first.metadata?.eventName || "event",
    eventUrl(first.metadata?.eventSlug, first.eventId),
  );
  const photos = unique(
    rows.map((r) => linked(r.metadata?.mediaFilename || "photo", mediaUrl(r))),
  ).slice(0, MAX_LINKED_ITEMS_IN_MESSAGE);
  const actorText =
    actors.length === 1
      ? actors[0]
      : `${actors.slice(0, -1).join(", ")} and ${actors.at(-1)}`;
  const photoText = describeLinkedItems(count, "photo", "photos", photos);
  const verbByCategory: Record<string, string> = {
    mention: "tagged you in",
    comment_on_upload: "commented on",
    comment_on_mention: "commented on",
    reply_to_comment: "replied to you on",
    like_on_upload: "liked",
    like_on_mention: "liked",
    comment_like: "liked your comment on",
    feed_comment: "commented on",
    feed_mention: "tagged people in",
    feed_like: "liked",
    feed_comment_like: "liked a comment on",
    feed_upload: "uploaded",
  };
  const verb = verbByCategory[first.category] || "did something with";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:ms-camera: ${actorText} ${verb} ${photoText} in ${event}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Batched after 10 quiet minutes. Change this from the app home.",
        },
      ],
    },
  ];
}

function feedBlocks(rows: QueueRow[]): SlackBlock[] {
  const first = rows[0];
  const count = rows.length;
  const actor = actorLabel(first, false);
  const event = linked(
    first.metadata?.eventName || "event",
    eventUrl(first.metadata?.eventSlug, first.eventId),
  );
  const commentPreview = quoteCommentPreview(rows[0]?.metadata?.commentPreview);
  const textByCategory: Record<string, string> = {
    feed_upload: `${actor} just uploaded ${count} new ${count === 1 ? "photo" : "photos"} to ${event}`,
    feed_comment: `${actor} commented on ${describeCount(count, "photo", "photos")} in ${event}${count === 1 ? commentPreview : ""}`,
    feed_mention: `${actor} tagged people in ${describeCount(count, "photo", "photos")} from ${event}`,
    feed_like: `${actor} liked ${describeCount(count, "photo", "photos")} from ${event}`,
    feed_comment_like: `${actor} liked ${describeCount(count, "comment", "comments")} in ${event}${count === 1 ? commentPreview : ""}`,
  };
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:ms-camera: ${textByCategory[first.category] || `${actor} did ${count} things in ${event}`}`,
      },
    },
  ];
}

async function destinationFor(rows: QueueRow[]) {
  const first = rows[0];
  if (first.channelId) return first.channelId;
  const user = first.recipientUserId
    ? await db.query.users.findFirst({
        where: eq(users.id, first.recipientUserId),
      })
    : null;
  if (!user?.slackId) return null;
  const opened = (await slackApi("conversations.open", {
    users: user.slackId,
  })) as { channel?: { id?: string } };
  return opened.channel?.id || null;
}

export async function flushSlackNotificationBatches(limit = 50) {
  const due = (await db.query.slackNotificationQueue.findMany({
    where: and(
      eq(slackNotificationQueue.status, "pending"),
      lte(slackNotificationQueue.scheduledFor, new Date()),
    ),
    limit,
  })) as QueueRow[];
  const keys = unique(
    due.map(
      (r) =>
        `${r.recipientUserId || ""}|${r.channelId || ""}|${r.category}|${r.actionKey}`,
    ),
  );
  let sent = 0;
  for (const key of keys) {
    const [recipientUserId, channelId, category, actionKey] = key.split("|");
    const rows = (await db.query.slackNotificationQueue.findMany({
      where: and(
        eq(slackNotificationQueue.status, "pending"),
        eq(slackNotificationQueue.category, category as Category),
        eq(slackNotificationQueue.actionKey, actionKey),
        lte(slackNotificationQueue.scheduledFor, new Date()),
        recipientUserId
          ? eq(slackNotificationQueue.recipientUserId, recipientUserId)
          : eq(slackNotificationQueue.channelId, channelId),
      ),
      limit: MAX_BATCH_ITEMS,
    })) as QueueRow[];
    if (!rows.length) continue;
    const ids = rows.map((r) => r.id);
    await db
      .update(slackNotificationQueue)
      .set({ status: "sending", updatedAt: new Date() })
      .where(inArray(slackNotificationQueue.id, ids));
    try {
      const channel = await destinationFor(rows);
      if (!channel) throw new Error("No Slack destination for batch");
      await slackApi("chat.postMessage", {
        channel,
        text: isFeedRow(rows[0]) ? "Photos feed update" : "Photos notification",
        unfurl_links: false,
        unfurl_media: false,
        blocks: isFeedRow(rows[0]) ? feedBlocks(rows) : personalBlocks(rows),
      });
      await db
        .update(slackNotificationQueue)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(inArray(slackNotificationQueue.id, ids));
      sent++;
    } catch (error) {
      logger.error({ error }, "Failed to send Slack notification batch");
      await db
        .update(slackNotificationQueue)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(inArray(slackNotificationQueue.id, ids));
    }
  }
  return { batches: keys.length, sent };
}

export async function publishSlackAppHome(slackUserId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.slackId, slackUserId),
  });
  const prefs = user
    ? await db.query.slackNotificationPreferences.findMany({
        where: eq(slackNotificationPreferences.userId, user.id),
      })
    : [];
  const enabled = new Map(prefs.map((p) => [p.category, p.enabled]));
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Photos notifications", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":bell: Photos waits until nothing related to you has happened for *10 minutes*, then sends one short summary. Feed posts are also grouped, and private or unlisted events are never posted.",
      },
    },
    { type: "divider" },
    ...SLACK_NOTIFICATION_CATEGORIES.map((category) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${category.label}*\n${category.description}`,
      },
      accessory: {
        type: "checkboxes",
        action_id: "slack_notification_toggle",
        initial_options:
          (enabled.get(category.key) ?? category.defaultEnabled)
            ? [
                {
                  text: { type: "plain_text", text: "On", emoji: true },
                  value: category.key,
                },
              ]
            : [],
        options: [
          {
            text: { type: "plain_text", text: "On", emoji: true },
            value: category.key,
          },
        ],
      },
    })),
  ];
  await slackApi("views.publish", {
    user_id: slackUserId,
    view: { type: "home", blocks },
  });
}

export async function setSlackNotificationPreference(
  slackUserId: string,
  category: Category,
  enabled: boolean,
) {
  const user = await db.query.users.findFirst({
    where: eq(users.slackId, slackUserId),
  });
  if (!user) return;
  await db
    .insert(slackNotificationPreferences)
    .values({ userId: user.id, category, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        slackNotificationPreferences.userId,
        slackNotificationPreferences.category,
      ],
      set: { enabled, updatedAt: new Date() },
    });
}

export function isSlackCategory(value: string): value is PersonalCategory {
  return SLACK_NOTIFICATION_CATEGORIES.some(
    (category) => category.key === value,
  );
}
