-- Invite tickets: how the invite reached the app, and when the invited pair
-- first talked / talked again (drives the first-chat bonus and funnel events).
-- Additive only: three nullable columns.

-- AlterTable
ALTER TABLE "app"."app_users"
  ADD COLUMN "referral_source" TEXT,
  ADD COLUMN "referral_first_chat_at" TIMESTAMP(3),
  ADD COLUMN "referral_rechat_at" TIMESTAMP(3);
