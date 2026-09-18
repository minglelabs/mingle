-- Store a per-member read cursor for counterpart-message unread counts.
ALTER TABLE "app"."app_conversation_channel_members"
ADD COLUMN "last_read_at" TIMESTAMP(3);

-- Existing rooms should not surface their entire historical transcript as
-- unread immediately after the feature is deployed.
UPDATE "app"."app_conversation_channel_members"
SET "last_read_at" = CURRENT_TIMESTAMP
WHERE "last_read_at" IS NULL;
