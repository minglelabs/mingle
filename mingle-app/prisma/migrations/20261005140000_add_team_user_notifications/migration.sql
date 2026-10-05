-- AlterTable
ALTER TABLE "app"."app_user_notifications" ALTER COLUMN "actor_id" DROP NOT NULL,
ADD COLUMN     "body" TEXT,
ADD COLUMN     "target_id" TEXT;
