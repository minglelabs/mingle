-- Persist the user's preferred message-bubble presentation mode.
ALTER TABLE "app"."app_users"
ADD COLUMN "demo_bubble_display_mode" TEXT DEFAULT 'expanded';
