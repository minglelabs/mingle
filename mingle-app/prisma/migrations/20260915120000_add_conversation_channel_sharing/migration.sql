-- Public read-only "spectate" link for a conversation. shareToken is minted
-- once and kept stable across on/off toggles; shareEnabled is the live gate
-- every read path checks, so turning sharing off blocks new views
-- immediately without needing a separate revocation list.
ALTER TABLE "app"."app_conversation_channels"
ADD COLUMN "share_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "share_token" TEXT,
ADD COLUMN "shared_by_user_id" TEXT,
ADD COLUMN "shared_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "app_conversation_channels_share_token_key" ON "app"."app_conversation_channels"("share_token");
