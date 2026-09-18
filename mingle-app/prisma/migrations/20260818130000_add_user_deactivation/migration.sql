-- AlterTable
ALTER TABLE "app"."app_users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "app"."app_users" ADD COLUMN "deactivated_at" TIMESTAMP(3);
