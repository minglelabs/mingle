-- AlterTable
ALTER TABLE "app"."app_posts" ADD COLUMN     "image_height" INTEGER,
ADD COLUMN     "image_width" INTEGER;

-- AlterTable
ALTER TABLE "app"."app_post_drafts" ADD COLUMN     "image_height" INTEGER,
ADD COLUMN     "image_width" INTEGER;

