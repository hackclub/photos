WITH "ranked_active_blur_requests" AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "requester_id", "media_id"
		ORDER BY CASE WHEN "status" = 'approved' THEN 0 ELSE 1 END, "created_at" DESC
	) AS "position"
	FROM "blur_requests"
	WHERE "status" in ('pending', 'approved')
)
UPDATE "blur_requests"
SET "status" = 'rejected',
	"resolved_at" = now(),
	"resolution_notes" = 'Closed automatically while enforcing one active request per photo',
	"updated_at" = now()
WHERE "id" IN (
	SELECT "id" FROM "ranked_active_blur_requests" WHERE "position" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "blur_requests_active_requester_media_idx" ON "blur_requests" USING btree ("requester_id","media_id") WHERE "blur_requests"."status" in ('pending', 'approved');
