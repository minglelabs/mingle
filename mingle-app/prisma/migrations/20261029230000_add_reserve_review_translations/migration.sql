-- Translations staff read while reviewing a latent post, reused as its default translations when it is published.
ALTER TABLE "app"."app_operator_post_reserve" ADD COLUMN "translations" JSONB;
