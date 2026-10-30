-- The place staff give an account or a latent post in the review queue; null keeps the default order.
ALTER TABLE "app"."app_operator_accounts" ADD COLUMN "review_rank" INTEGER;
ALTER TABLE "app"."app_operator_post_reserve" ADD COLUMN "review_rank" INTEGER;
