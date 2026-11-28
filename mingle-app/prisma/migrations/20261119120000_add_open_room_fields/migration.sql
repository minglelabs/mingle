-- Open rooms (public rooms listed under Explore): a topic tag and an optional password.
-- Additive only: two nullable columns and one index.
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN "topic" TEXT;
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN "password_hash" TEXT;

-- The Explore list reads every public room, newest activity first.
CREATE INDEX "app_conversation_channels_public_updated_at_idx" ON "app"."app_conversation_channels"("is_public", "updated_at");
