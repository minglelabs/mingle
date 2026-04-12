-- AlterTable
ALTER TABLE "app_messages"
ADD COLUMN     "is_deleted" BOOLEAN;

-- AlterTable
ALTER TABLE "app_message_contents"
ADD COLUMN     "is_deleted" BOOLEAN;
