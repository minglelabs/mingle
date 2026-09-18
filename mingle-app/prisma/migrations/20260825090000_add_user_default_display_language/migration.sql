-- Persist the language a user prefers to read by default in newly opened rooms.
ALTER TABLE "app"."app_users"
ADD COLUMN "default_display_language" TEXT;
