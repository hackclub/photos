CREATE TYPE "public"."blur_request_status" AS ENUM('pending', 'approved', 'rejected');

ALTER TABLE "media" ADD COLUMN "original_s3_key" text;
ALTER TABLE "media" ADD COLUMN "original_thumbnail_s3_key" text;
ALTER TABLE "media" ADD COLUMN "blurred_s3_key" text;
ALTER TABLE "media" ADD COLUMN "blurred_thumbnail_s3_key" text;
ALTER TABLE "media" ADD COLUMN "blur_status" "blur_request_status";

CREATE TABLE "blur_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_id" uuid NOT NULL,
  "requester_id" uuid NOT NULL,
  "status" "blur_request_status" DEFAULT 'pending' NOT NULL,
  "regions" jsonb NOT NULL,
  "blurred_s3_key" text NOT NULL,
  "blurred_thumbnail_s3_key" text,
  "resolved_at" timestamp,
  "resolved_by_id" uuid,
  "resolution_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "blur_requests" ADD CONSTRAINT "blur_requests_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "blur_requests" ADD CONSTRAINT "blur_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "blur_requests" ADD CONSTRAINT "blur_requests_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
