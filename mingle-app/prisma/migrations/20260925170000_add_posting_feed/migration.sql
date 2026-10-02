-- Posting / feed feature (Phase 1).
--
-- Scope note: this migration is generated from `prisma migrate diff` and then
-- pruned of two pre-existing drifts that are NOT part of this feature and must
-- not be rewritten in production:
--   1. app_users.withdrawn_at / scheduled_delete_at / deleted_at are TIMESTAMPTZ
--      (created that way by 20260818160000_add_user_withdrawal). Prisma maps
--      DateTime to TIMESTAMP(3), so diff wants to convert them; converting would
--      drop timezone information from live rows.
--   2. app_event_logs_user_usage_created_desc_idx and
--      app_event_logs_user_session_usage_created_desc_idx already exist as
--      PARTIAL indexes (20260918143000). Prisma cannot express a partial index,
--      so diff re-emits them unpartitioned; re-creating them would collide.

-- AlterTable
ALTER TABLE "app_user_notifications" ADD COLUMN     "comment_id" TEXT,
ADD COLUMN     "post_id" TEXT;

-- AlterTable
ALTER TABLE "app_user_reports" ADD COLUMN     "target_comment_id" TEXT,
ADD COLUMN     "target_key" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "target_post_id" TEXT,
ADD COLUMN     "target_type" TEXT NOT NULL DEFAULT 'user';

-- Backfill target_key BEFORE its unique index exists. Every pre-existing row is
-- a user report, so its target is the reported user. Without this, all rows keep
-- target_key = '' and a reporter with two reports violates the unique index.
--
-- Legacy duplicates: before this migration nothing stopped one reporter from
-- reporting the same user several times, so production can hold several rows
-- for the same (reporter_id, reported_user_id). Deleting or merging them would
-- lose reasons, messages, statuses and operator replies, so EVERY row is kept:
--   * the earliest row per (reporter_id, reported_user_id) (created_at, then id
--     as a deterministic tie-break) gets the canonical key 'user:<reported id>',
--     so new-API dedup keeps colliding on it exactly as for a fresh report;
--   * every later duplicate gets 'user:<reported id>#legacy-dup:<row id>'. The
--     row id makes the key unique, and '#' can never appear in a key built by
--     buildReportTargetKey (cuid ids), so no future report can collide with it.
-- Duplicates stay visible to operators in /admin/reports like any other report.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "reporter_id", "reported_user_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "app_user_reports"
  WHERE "target_key" = ''
)
UPDATE "app_user_reports" AS r
SET "target_key" = CASE
  WHEN ranked.rn = 1 THEN 'user:' || r."reported_user_id"
  ELSE 'user:' || r."reported_user_id" || '#legacy-dup:' || r."id"
END
FROM ranked
WHERE r."id" = ranked."id";

-- CreateTable
CREATE TABLE "app_posts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body_version" INTEGER NOT NULL DEFAULT 1,
    "source_text" TEXT,
    "source_language" TEXT,
    "background_key" TEXT,
    "image_object_key" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "archived_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN,
    "deleted_at" TIMESTAMP(3),
    "moderation_hidden_at" TIMESTAMP(3),
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_post_translations" (
    "post_id" TEXT NOT NULL,
    "body_version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_post_translations_pkey" PRIMARY KEY ("post_id","body_version","language")
);

-- CreateTable
CREATE TABLE "app_post_comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "reply_to_user_id" TEXT,
    "body_version" INTEGER NOT NULL DEFAULT 1,
    "source_text" TEXT NOT NULL,
    "source_language" TEXT,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_post_comment_translations" (
    "comment_id" TEXT NOT NULL,
    "body_version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_post_comment_translations_pkey" PRIMARY KEY ("comment_id","body_version","language")
);

-- CreateTable
CREATE TABLE "app_post_likes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_post_comment_likes" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_post_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_post_views" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_post_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_post_hides" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_post_hides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_post_drafts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "source_text" TEXT,
    "background_key" TEXT,
    "image_object_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_post_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_recent_searches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "searched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_recent_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_posts_published_at_idx" ON "app_posts"("published_at");

-- CreateIndex
CREATE INDEX "app_posts_author_published_at_idx" ON "app_posts"("author_id", "published_at");

-- CreateIndex
CREATE INDEX "app_posts_author_created_at_idx" ON "app_posts"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "app_posts_feed_filter_idx" ON "app_posts"("visibility", "is_deleted", "moderation_hidden_at", "published_at");

-- CreateIndex
CREATE INDEX "app_post_comments_post_created_at_idx" ON "app_post_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "app_post_comments_author_created_at_idx" ON "app_post_comments"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "app_post_comments_parent_id_idx" ON "app_post_comments"("parent_id");

-- CreateIndex
CREATE INDEX "app_post_likes_post_id_idx" ON "app_post_likes"("post_id");

-- CreateIndex
CREATE INDEX "app_post_likes_user_created_at_idx" ON "app_post_likes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_post_likes_post_user_uidx" ON "app_post_likes"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "app_post_comment_likes_comment_id_idx" ON "app_post_comment_likes"("comment_id");

-- CreateIndex
CREATE INDEX "app_post_comment_likes_user_created_at_idx" ON "app_post_comment_likes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_post_comment_likes_comment_user_uidx" ON "app_post_comment_likes"("comment_id", "user_id");

-- CreateIndex
CREATE INDEX "app_post_views_user_post_idx" ON "app_post_views"("user_id", "post_id");

-- CreateIndex
CREATE INDEX "app_post_views_user_viewed_at_idx" ON "app_post_views"("user_id", "viewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_post_views_post_user_uidx" ON "app_post_views"("post_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_post_hides_post_user_uidx" ON "app_post_hides"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "app_post_drafts_author_updated_at_idx" ON "app_post_drafts"("author_id", "updated_at");

-- CreateIndex
CREATE INDEX "app_recent_searches_user_searched_at_idx" ON "app_recent_searches"("user_id", "searched_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_recent_searches_user_query_uidx" ON "app_recent_searches"("user_id", "query");

-- CreateIndex
CREATE INDEX "app_user_notifications_post_id_idx" ON "app_user_notifications"("post_id");

-- CreateIndex
CREATE INDEX "app_user_notifications_comment_id_idx" ON "app_user_notifications"("comment_id");

-- CreateIndex
CREATE INDEX "app_user_reports_target_type_status_created_at_idx" ON "app_user_reports"("target_type", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_reports_reporter_target_key_uidx" ON "app_user_reports"("reporter_id", "target_key");

-- AddForeignKey
ALTER TABLE "app_user_notifications" ADD CONSTRAINT "app_user_notifications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "app_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_notifications" ADD CONSTRAINT "app_user_notifications_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "app_post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_reports" ADD CONSTRAINT "app_user_reports_target_post_id_fkey" FOREIGN KEY ("target_post_id") REFERENCES "app_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_reports" ADD CONSTRAINT "app_user_reports_target_comment_id_fkey" FOREIGN KEY ("target_comment_id") REFERENCES "app_post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_posts" ADD CONSTRAINT "app_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_translations" ADD CONSTRAINT "app_post_translations_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "app_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_comments" ADD CONSTRAINT "app_post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "app_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_comments" ADD CONSTRAINT "app_post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_comments" ADD CONSTRAINT "app_post_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "app_post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_comments" ADD CONSTRAINT "app_post_comments_reply_to_user_id_fkey" FOREIGN KEY ("reply_to_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_comment_translations" ADD CONSTRAINT "app_post_comment_translations_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "app_post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_likes" ADD CONSTRAINT "app_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "app_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_likes" ADD CONSTRAINT "app_post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_comment_likes" ADD CONSTRAINT "app_post_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "app_post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_comment_likes" ADD CONSTRAINT "app_post_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_views" ADD CONSTRAINT "app_post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "app_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_views" ADD CONSTRAINT "app_post_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_hides" ADD CONSTRAINT "app_post_hides_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "app_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_hides" ADD CONSTRAINT "app_post_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_post_drafts" ADD CONSTRAINT "app_post_drafts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_recent_searches" ADD CONSTRAINT "app_recent_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
