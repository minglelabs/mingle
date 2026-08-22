-- Per-member selected translation-target languages for shared (2+-member)
-- rooms. The language-selection screen shows the union of every member's
-- own selection with per-language attribution, so one member deselecting a
-- language doesn't remove it while another member still wants it.
ALTER TABLE "app_conversation_channel_members" ADD COLUMN "selected_languages" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: every existing member row belongs to a channel with exactly one
-- member today, so copying the channel's current selectedLanguages onto it
-- is lossless and keeps existing rooms behaving identically post-migration.
UPDATE "app_conversation_channel_members" AS m
SET "selected_languages" = c."selected_languages"
FROM "app_conversation_channels" AS c
WHERE c."id" = m."channel_id";
