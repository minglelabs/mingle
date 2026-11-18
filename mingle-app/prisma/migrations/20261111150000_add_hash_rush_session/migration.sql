-- The room's running Hash Rush game: which one, and who started it.
-- Additive: two nullable columns.
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN "hash_rush_session_id" TEXT;
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN "hash_rush_started_by_user_id" TEXT;
