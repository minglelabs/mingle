ALTER TABLE "app"."app_users"
ADD COLUMN "primary_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "default_conversation_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
