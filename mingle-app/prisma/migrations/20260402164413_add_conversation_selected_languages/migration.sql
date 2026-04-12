-- AlterTable
ALTER TABLE "app_conversation_channels"
ADD COLUMN "selected_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
