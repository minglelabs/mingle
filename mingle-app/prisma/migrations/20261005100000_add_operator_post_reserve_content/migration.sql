-- Latent posts may be written in a language the account is learning, and may carry a photo to draw at publish time.
ALTER TABLE "app_operator_post_reserve" ADD COLUMN "language" TEXT;
ALTER TABLE "app_operator_post_reserve" ADD COLUMN "image_prompt" TEXT;
