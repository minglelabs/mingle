ALTER TABLE "app"."app_conversation_channels"
  ADD COLUMN "user_edited_title_at" TIMESTAMP(3),
  ADD COLUMN "auto_title_generated_at" TIMESTAMP(3);
