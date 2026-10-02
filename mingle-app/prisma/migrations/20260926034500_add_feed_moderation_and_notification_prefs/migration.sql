-- Posting / feed feature: operator moderation, report workflow and the in-app
-- notification switch.
--
-- Generated with `prisma migrate diff` against the migrated local database and
-- pruned of the same two pre-existing drifts documented in
-- 20260925170000_add_posting_feed (app_users TIMESTAMPTZ columns and the partial
-- app_event_logs indexes). Both must stay out of every migration: rewriting them
-- drops timezone data from live rows or collides with the existing indexes.

-- AlterTable
ALTER TABLE "app_post_comments" ADD COLUMN     "moderation_hidden_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "app_user_reports" ADD COLUMN     "admin_note" TEXT,
ADD COLUMN     "moderation_action" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "in_app_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "moderation_hidden_at" TIMESTAMP(3),
ADD COLUMN     "moderation_restricted_at" TIMESTAMP(3);
