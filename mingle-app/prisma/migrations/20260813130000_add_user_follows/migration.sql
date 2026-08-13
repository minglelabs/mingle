-- CreateTable
CREATE TABLE "app_user_follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_user_follows_follower_created_at_idx" ON "app_user_follows"("follower_id", "created_at");

-- CreateIndex
CREATE INDEX "app_user_follows_following_created_at_idx" ON "app_user_follows"("following_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_follows_follower_following_uidx" ON "app_user_follows"("follower_id", "following_id");

-- AddForeignKey
ALTER TABLE "app_user_follows" ADD CONSTRAINT "app_user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_follows" ADD CONSTRAINT "app_user_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
