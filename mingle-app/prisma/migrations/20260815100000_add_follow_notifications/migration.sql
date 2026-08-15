-- CreateTable
CREATE TABLE "app_user_notifications" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'follow',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_user_notifications_recipient_read_created_idx" ON "app_user_notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "app_user_notifications_actor_created_at_idx" ON "app_user_notifications"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "app_user_notifications" ADD CONSTRAINT "app_user_notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_notifications" ADD CONSTRAINT "app_user_notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
