-- Open-room calls have a stage: a listener can raise a hand to ask for it.
-- Additive only: one nullable column.
ALTER TABLE "app"."app_voice_call_participants" ADD COLUMN "hand_raised_at" TIMESTAMP(3);
