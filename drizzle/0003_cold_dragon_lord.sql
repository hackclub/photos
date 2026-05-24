CREATE TABLE "pending_media_ownership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"slack_id" text NOT NULL,
	"show_placeholder" boolean DEFAULT false NOT NULL,
	"previous_owner_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by_id" uuid
);
--> statement-breakpoint
ALTER TABLE "pending_media_ownership" ADD CONSTRAINT "pending_media_ownership_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_media_ownership" ADD CONSTRAINT "pending_media_ownership_previous_owner_id_users_id_fk" FOREIGN KEY ("previous_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_media_ownership" ADD CONSTRAINT "pending_media_ownership_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_media_ownership" ADD CONSTRAINT "pending_media_ownership_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "users" ("id", "hackclub_id", "email", "name", "handle", "slack_id", "is_global_admin", "is_banned") VALUES ('00000000-0000-0000-0000-0000000000ff', 'system:pending-registration', 'system@pending-registration.internal', 'Pending Registration', 'pending_registration', NULL, false, true) ON CONFLICT DO NOTHING;