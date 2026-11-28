-- Women-only rooms (owner, 2026-11-25): an open room or a voice room a woman
-- made for women. Everyone sees it in the list; only women can come in.
-- Additive only: one column with a default (no rewrite on Postgres 11+).
ALTER TABLE "app"."app_conversation_channels" ADD COLUMN IF NOT EXISTS "women_only" BOOLEAN NOT NULL DEFAULT false;
