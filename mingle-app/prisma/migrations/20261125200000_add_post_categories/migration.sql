-- Post categories (owner, 2026-11-25; src/lib/post-category.ts): what kind of
-- post it is ("hour" posts carry the moment they stop being listed, "intro"
-- posts their answers). Additive only: three nullable columns (no rewrite);
-- every existing post stays an ordinary one (NULL).
ALTER TABLE "app"."app_posts" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "app"."app_posts" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
ALTER TABLE "app"."app_posts" ADD COLUMN IF NOT EXISTS "intro" JSONB;
