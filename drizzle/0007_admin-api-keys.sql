ALTER TABLE "api_keys" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "global_admin_only_delete" boolean DEFAULT false NOT NULL;