-- Optional photo on a post comment.
ALTER TABLE "app"."app_post_comments" ADD COLUMN "image_object_key" TEXT;
ALTER TABLE "app"."app_post_comments" ADD COLUMN "image_width" INTEGER;
ALTER TABLE "app"."app_post_comments" ADD COLUMN "image_height" INTEGER;
