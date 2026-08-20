-- Per-member active/paused state for shared (2+-member) rooms. "One active
-- room per account" is a per-person invariant; a single channel-wide status
-- can't represent it once a room has more than one real account in it.
ALTER TABLE "app_conversation_channel_members" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "app_conversation_channel_members" ADD COLUMN "paused_at" TIMESTAMP(3);

-- Backfill: every existing member row belongs to a channel with exactly one
-- member today, so copying the channel's current status/pausedAt onto it is
-- lossless and keeps existing rooms behaving identically post-migration.
UPDATE "app_conversation_channel_members" AS m
SET "status" = c."status",
    "paused_at" = c."paused_at"
FROM "app_conversation_channels" AS c
WHERE c."id" = m."channel_id";
