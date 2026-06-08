ALTER TABLE "pending_media_ownership" ALTER COLUMN "slack_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_media_ownership" ADD COLUMN "hackclub_id" text;