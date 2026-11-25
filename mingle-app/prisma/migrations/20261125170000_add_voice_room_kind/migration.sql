-- Voice rooms are a kind of their own (owner, 2026-11-25): an open room that
-- is always in a voice talk, listed on the voice-room tab and shown with the
-- stage. Every existing open room stays an open chat room (false); the lounge
-- is marked by the server on its next read (src/server/voice-lounge.ts).
-- Additive only: one column with a default (no rewrite on Postgres 11+).
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN IF NOT EXISTS "is_voice_room" BOOLEAN NOT NULL DEFAULT false;
