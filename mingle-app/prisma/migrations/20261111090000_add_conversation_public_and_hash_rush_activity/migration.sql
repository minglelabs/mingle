-- Public rooms (listed and joinable from the search tab) and when a room's
-- Hash Rush game was last entered. Additive only: two columns with defaults.
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN "hash_rush_active_at" TIMESTAMP(3);

CREATE INDEX "app_conversation_channels_hash_rush_active_at_idx" ON "app"."app_conversation_channels"("hash_rush_active_at");
