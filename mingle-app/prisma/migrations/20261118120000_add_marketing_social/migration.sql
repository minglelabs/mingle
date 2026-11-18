-- Marketing video cross-posting from the admin tool (/admin/social):
-- connected platform accounts (encrypted tokens), uploaded videos, and one
-- target row per platform post. Additive only: three new tables.

-- CreateTable
CREATE TABLE "app"."app_marketing_social_accounts" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "username" TEXT,
    "display_name" TEXT,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "last_error" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_marketing_social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_marketing_social_accounts_platform_key" ON "app"."app_marketing_social_accounts"("platform");

-- CreateTable
CREATE TABLE "app"."app_marketing_videos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "video_object_key" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "video_bytes" INTEGER NOT NULL,
    "duration_ms" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "cover_object_key" TEXT,
    "cover_url" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_marketing_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_marketing_videos_created_at_idx" ON "app"."app_marketing_videos"("created_at" DESC);

-- CreateTable
CREATE TABLE "app"."app_marketing_video_targets" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "options" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "container_id" TEXT,
    "external_post_id" TEXT,
    "permalink" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "metrics" JSONB,
    "metrics_fetched_at" TIMESTAMP(3),
    "metrics_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_marketing_video_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_marketing_video_targets_video_platform_key" ON "app"."app_marketing_video_targets"("video_id", "platform");

-- CreateIndex
CREATE INDEX "app_marketing_video_targets_status_next_idx" ON "app"."app_marketing_video_targets"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "app"."app_marketing_video_targets" ADD CONSTRAINT "app_marketing_video_targets_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "app"."app_marketing_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
