CREATE TYPE "public"."slack_notification_category" AS ENUM('mention', 'comment_on_upload', 'comment_on_mention', 'reply_to_comment', 'like_on_upload', 'like_on_mention', 'comment_like', 'feed_upload', 'feed_comment', 'feed_mention', 'feed_like', 'feed_comment_like');--> statement-breakpoint
CREATE TYPE "public"."slack_notification_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "slack_notification_preferences" (
	"user_id" uuid NOT NULL,
	"category" "slack_notification_category" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "slack_notification_preferences_user_id_category_pk" PRIMARY KEY("user_id","category")
);
--> statement-breakpoint
CREATE TABLE "slack_notification_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid,
	"channel_id" text,
	"category" "slack_notification_category" NOT NULL,
	"action_key" text NOT NULL,
	"actor_user_id" uuid,
	"event_id" uuid,
	"media_id" uuid,
	"comment_id" uuid,
	"metadata" jsonb,
	"status" "slack_notification_status" DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "slack_notification_preferences" ADD CONSTRAINT "slack_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_notification_queue" ADD CONSTRAINT "slack_notification_queue_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_notification_queue" ADD CONSTRAINT "slack_notification_queue_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_notification_queue" ADD CONSTRAINT "slack_notification_queue_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_notification_queue" ADD CONSTRAINT "slack_notification_queue_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_notification_queue" ADD CONSTRAINT "slack_notification_queue_comment_id_media_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."media_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slack_notification_queue_due_idx" ON "slack_notification_queue" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "slack_notification_queue_recipient_batch_idx" ON "slack_notification_queue" USING btree ("recipient_user_id","category","action_key","status");--> statement-breakpoint
CREATE INDEX "slack_notification_queue_channel_batch_idx" ON "slack_notification_queue" USING btree ("channel_id","category","action_key","status");