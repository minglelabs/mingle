-- A new profile photo of a live operator account waits for staff review.
ALTER TABLE "app"."app_operator_accounts"
  ADD COLUMN "pending_image" TEXT,
  ADD COLUMN "pending_image_object_key" TEXT,
  ADD COLUMN "pending_avatar_spec" JSONB,
  ADD COLUMN "pending_drawing_at" TIMESTAMP(3);
