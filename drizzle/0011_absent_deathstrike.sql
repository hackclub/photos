CREATE TYPE "public"."blur_request_source" AS ENUM('manual', 'face', 'automatic_face');--> statement-breakpoint
CREATE TYPE "public"."face_algorithm" AS ENUM('fast', 'accurate', 'very-accurate');--> statement-breakpoint
CREATE TYPE "public"."face_index_status" AS ENUM('disabled', 'queued', 'indexing', 'ready', 'failed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."face_job_status" AS ENUM('queued', 'processing', 'ready', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."face_match_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "event_face_indexes" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"status" "face_index_status" DEFAULT 'disabled' NOT NULL,
	"gallery_id" text,
	"algorithm" "face_algorithm" DEFAULT 'accurate' NOT NULL,
	"model_version" text DEFAULT 'roc-3.15.0' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"max_faces" integer DEFAULT 300 NOT NULL,
	"min_quality" double precision,
	"suggestion_threshold" double precision DEFAULT 0.62 NOT NULL,
	"blur_threshold" double precision DEFAULT 0.82 NOT NULL,
	"requested_at" timestamp,
	"started_at" timestamp,
	"indexed_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_blur_subscriptions" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"face_scan_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "face_blur_subscriptions_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "face_match_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"face_scan_id" uuid NOT NULL,
	"detection_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"similarity" double precision NOT NULL,
	"status" "face_match_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_privacy_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"matching_enabled" boolean DEFAULT false NOT NULL,
	"auto_suggestions_enabled" boolean DEFAULT true NOT NULL,
	"hide_profile" boolean DEFAULT false NOT NULL,
	"hide_mentions" boolean DEFAULT false NOT NULL,
	"hide_ai_suggestions" boolean DEFAULT false NOT NULL,
	"consented_at" timestamp,
	"revoked_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "face_job_status" DEFAULT 'queued' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"high_quality" boolean DEFAULT false NOT NULL,
	"algorithm" "face_algorithm" DEFAULT 'accurate' NOT NULL,
	"model_version" text DEFAULT 'roc-3.15.0' NOT NULL,
	"template_encrypted" text,
	"quality" double precision,
	"spoof" double precision,
	"spoof_quality" double precision,
	"error" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face_system_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"scan_new_uploads" boolean DEFAULT true NOT NULL,
	"auto_suggestions" boolean DEFAULT true NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"algorithm" "face_algorithm" DEFAULT 'accurate' NOT NULL,
	"max_faces" integer DEFAULT 300 NOT NULL,
	"suggestion_threshold" double precision DEFAULT 0.62 NOT NULL,
	"blur_threshold" double precision DEFAULT 0.82 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_face_detections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"face_index" integer NOT NULL,
	"box_x" double precision NOT NULL,
	"box_y" double precision NOT NULL,
	"box_width" double precision NOT NULL,
	"box_height" double precision NOT NULL,
	"rotation" double precision,
	"confidence" double precision,
	"quality" double precision,
	"template_encrypted" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_face_scans" (
	"media_id" uuid PRIMARY KEY NOT NULL,
	"status" "face_job_status" DEFAULT 'queued' NOT NULL,
	"event_index_revision" integer DEFAULT 1 NOT NULL,
	"algorithm" "face_algorithm" DEFAULT 'accurate' NOT NULL,
	"model_version" text DEFAULT 'roc-3.15.0' NOT NULL,
	"source_s3_key" text NOT NULL,
	"worker_job_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blur_requests" ADD COLUMN "source" "blur_request_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "blur_requests" ADD COLUMN "face_scan_id" uuid;--> statement-breakpoint
ALTER TABLE "blur_requests" ADD COLUMN "face_detection_id" uuid;--> statement-breakpoint
ALTER TABLE "event_face_indexes" ADD CONSTRAINT "event_face_indexes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_blur_subscriptions" ADD CONSTRAINT "face_blur_subscriptions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_blur_subscriptions" ADD CONSTRAINT "face_blur_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_blur_subscriptions" ADD CONSTRAINT "face_blur_subscriptions_face_scan_id_face_scans_id_fk" FOREIGN KEY ("face_scan_id") REFERENCES "public"."face_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_match_suggestions" ADD CONSTRAINT "face_match_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_match_suggestions" ADD CONSTRAINT "face_match_suggestions_face_scan_id_face_scans_id_fk" FOREIGN KEY ("face_scan_id") REFERENCES "public"."face_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_match_suggestions" ADD CONSTRAINT "face_match_suggestions_detection_id_media_face_detections_id_fk" FOREIGN KEY ("detection_id") REFERENCES "public"."media_face_detections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_match_suggestions" ADD CONSTRAINT "face_match_suggestions_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_match_suggestions" ADD CONSTRAINT "face_match_suggestions_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_privacy_preferences" ADD CONSTRAINT "face_privacy_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_scans" ADD CONSTRAINT "face_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_face_detections" ADD CONSTRAINT "media_face_detections_media_id_media_face_scans_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_face_scans"("media_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_face_scans" ADD CONSTRAINT "media_face_scans_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_face_indexes_gallery_idx" ON "event_face_indexes" USING btree ("gallery_id");--> statement-breakpoint
CREATE INDEX "event_face_indexes_status_idx" ON "event_face_indexes" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "face_blur_subscriptions_user_active_idx" ON "face_blur_subscriptions" USING btree ("user_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "face_match_suggestions_user_detection_idx" ON "face_match_suggestions" USING btree ("user_id","detection_id");--> statement-breakpoint
CREATE INDEX "face_match_suggestions_user_status_idx" ON "face_match_suggestions" USING btree ("user_id","status","similarity" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "face_match_suggestions_media_status_idx" ON "face_match_suggestions" USING btree ("media_id","status");--> statement-breakpoint
CREATE INDEX "face_scans_user_created_at_idx" ON "face_scans" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "face_scans_active_user_idx" ON "face_scans" USING btree ("user_id") WHERE "face_scans"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "media_face_detections_media_face_idx" ON "media_face_detections" USING btree ("media_id","face_index");--> statement-breakpoint
CREATE UNIQUE INDEX "media_face_scans_worker_job_idx" ON "media_face_scans" USING btree ("worker_job_id");--> statement-breakpoint
CREATE INDEX "media_face_scans_status_idx" ON "media_face_scans" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "blur_requests" ADD CONSTRAINT "blur_requests_face_scan_id_face_scans_id_fk" FOREIGN KEY ("face_scan_id") REFERENCES "public"."face_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blur_requests" ADD CONSTRAINT "blur_requests_face_detection_id_media_face_detections_id_fk" FOREIGN KEY ("face_detection_id") REFERENCES "public"."media_face_detections"("id") ON DELETE set null ON UPDATE no action;
