-- AlterTable
ALTER TABLE "app_users"
ADD COLUMN "demo_translate_model" TEXT;

-- AlterTable
ALTER TABLE "app_messages"
ADD COLUMN "translation_provider" TEXT,
ADD COLUMN "translation_model" TEXT;
