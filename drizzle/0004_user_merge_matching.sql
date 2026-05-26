CREATE TYPE "public"."user_migration_mode" AS ENUM('notify', 'alias');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'merge';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "migrated_to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "migration_mode" "user_migration_mode";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "migration_message" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_migrated_to_user_id_users_id_fk" FOREIGN KEY ("migrated_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;