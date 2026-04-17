ALTER TABLE "app"."app_conversation_channels"
ADD COLUMN "speech_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
