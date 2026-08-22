-- AlterTable
ALTER TABLE "app"."app_users"
  ADD COLUMN "demo_endpoint_max_delay_ms" INTEGER DEFAULT 3000,
  ADD COLUMN "demo_endpoint_tuning_step" INTEGER DEFAULT 2;
