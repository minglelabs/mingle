-- Staff review of operator profiles and their pre-written posts.
ALTER TABLE "app"."app_operator_accounts" ADD COLUMN "review_state" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "app"."app_operator_accounts" ADD COLUMN "review_feedback" TEXT;

ALTER TABLE "app"."app_operator_post_reserve" ADD COLUMN "review_feedback" TEXT;
ALTER TABLE "app"."app_operator_post_reserve" ADD COLUMN "image_object_key" TEXT;
ALTER TABLE "app"."app_operator_post_reserve" ADD COLUMN "image_width" INTEGER;
ALTER TABLE "app"."app_operator_post_reserve" ADD COLUMN "image_height" INTEGER;
