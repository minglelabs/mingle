-- Contact sync + invite codes. Additive only: four nullable columns, one
-- unique index, one index, a backfill.

-- AlterTable
ALTER TABLE "app"."app_users"
  ADD COLUMN "referral_code" TEXT,
  ADD COLUMN "referred_by_user_id" TEXT,
  ADD COLUMN "referred_at" TIMESTAMP(3),
  ADD COLUMN "contact_sync_prompted_at" TIMESTAMP(3);

ALTER TABLE "app"."app_users" ADD CONSTRAINT "app_users_referral_code_chk" CHECK ("referral_code" IS NULL OR "referral_code" ~ '^[a-z0-9]{5}$');

-- CreateIndex
CREATE UNIQUE INDEX "app_users_referral_code_key" ON "app"."app_users"("referral_code");
CREATE INDEX "app_users_referred_by_user_id_idx" ON "app"."app_users"("referred_by_user_id");

-- The contact-sync screen opens by itself only for people who sign up from
-- now on: everyone who already has an account counts as having seen it.
UPDATE "app"."app_users" SET "contact_sync_prompted_at" = CURRENT_TIMESTAMP;
