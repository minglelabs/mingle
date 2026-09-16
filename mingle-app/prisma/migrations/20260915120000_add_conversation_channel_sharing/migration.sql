-- Public read-only "spectate" link for a conversation. shareToken is minted
-- once and kept stable across re-shares; sharedAt is the snapshot cutoff
-- (messages up to that moment), refreshed to now() each time someone
-- (re-)shares — there's no on/off state, a link just exists or doesn't.
ALTER TABLE "app"."app_conversation_channels"
ADD COLUMN "share_token" TEXT,
ADD COLUMN "shared_by_user_id" TEXT,
ADD COLUMN "shared_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "app_conversation_channels_share_token_key" ON "app"."app_conversation_channels"("share_token");
