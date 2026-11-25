-- Hearts on a profile (owner, 2026-11-25): one row per (who sent it, whose profile).
-- Additive only: one new table.
CREATE TABLE "app"."app_profile_likes" (
    "liker_id" TEXT NOT NULL,
    "liked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_profile_likes_pkey" PRIMARY KEY ("liker_id","liked_id")
);

CREATE INDEX "app_profile_likes_liked_id_created_at_idx" ON "app"."app_profile_likes"("liked_id", "created_at");

ALTER TABLE "app"."app_profile_likes" ADD CONSTRAINT "app_profile_likes_liker_id_fkey" FOREIGN KEY ("liker_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."app_profile_likes" ADD CONSTRAINT "app_profile_likes_liked_id_fkey" FOREIGN KEY ("liked_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
