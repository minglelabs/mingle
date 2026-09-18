-- Membership join table for multi-member conversation rooms. AppConversationChannel.ownerUserId
-- stays as the creator/admin; this table is what read/write authorization actually checks
-- once a channel can have more than one real account in it.
CREATE TABLE "app_conversation_channel_members" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "display_language" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_conversation_channel_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_conversation_channel_members_user_joined_idx" ON "app_conversation_channel_members"("user_id", "joined_at");

CREATE INDEX "app_conversation_channel_members_channel_idx" ON "app_conversation_channel_members"("channel_id");

CREATE UNIQUE INDEX "app_conversation_channel_members_channel_user_uidx" ON "app_conversation_channel_members"("channel_id", "user_id");

ALTER TABLE "app_conversation_channel_members" ADD CONSTRAINT "app_conversation_channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "app_conversation_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_conversation_channel_members" ADD CONSTRAINT "app_conversation_channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing solo room's owner becomes its first (owner-role) member,
-- so existing rooms keep working once reads/writes are membership-gated.
INSERT INTO "app_conversation_channel_members" ("id", "channel_id", "user_id", "role", "joined_at")
SELECT gen_random_uuid()::text, "id", "owner_user_id", 'owner', "created_at"
FROM "app_conversation_channels";
