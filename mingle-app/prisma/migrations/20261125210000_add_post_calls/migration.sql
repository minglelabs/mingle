-- 1:1 voice talk from a post (owner, 2026-11-25; src/server/post-calls.ts).
-- A "call" post takes calls; each call rings its author, and an answered one
-- runs in a hidden two-person room (is_duo_call) that no list shows.
-- Additive only: one boolean column with a default (no rewrite) and one new table.
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN IF NOT EXISTS "is_duo_call" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "app"."app_post_calls" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "caller_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    CONSTRAINT "app_post_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_post_calls_author_id_status_idx" ON "app"."app_post_calls"("author_id", "status");
CREATE INDEX "app_post_calls_caller_id_status_idx" ON "app"."app_post_calls"("caller_id", "status");
CREATE INDEX "app_post_calls_channel_id_idx" ON "app"."app_post_calls"("channel_id");

ALTER TABLE "app"."app_post_calls" ADD CONSTRAINT "app_post_calls_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "app"."app_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."app_post_calls" ADD CONSTRAINT "app_post_calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."app_post_calls" ADD CONSTRAINT "app_post_calls_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
