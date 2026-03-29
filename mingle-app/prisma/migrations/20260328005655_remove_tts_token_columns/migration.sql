ALTER TABLE "app"."app_messages"
  DROP COLUMN IF EXISTS "tts_input_tokens",
  DROP COLUMN IF EXISTS "tts_output_tokens",
  DROP COLUMN IF EXISTS "tts_total_tokens";
