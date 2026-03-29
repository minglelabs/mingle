-- AlterTable
ALTER TABLE "app"."app_users"
ADD COLUMN "demo_translate_model" TEXT;

-- AlterTable
ALTER TABLE "app"."app_messages"
ADD COLUMN "translation_provider" TEXT,
ADD COLUMN "translation_model" TEXT;
