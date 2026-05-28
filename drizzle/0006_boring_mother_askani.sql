ALTER TABLE "users" ALTER COLUMN "storage_limit" SET DEFAULT 53687091200;
UPDATE "users" SET "storage_limit" = 53687091200 WHERE "storage_limit" = 21474836480;
