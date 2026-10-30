ALTER TABLE "app"."app_users" ADD COLUMN "interest_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "app"."app_users" ADD COLUMN "interest_language_levels" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
