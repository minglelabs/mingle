-- CreateTable
CREATE TABLE "app_message_reactions" (
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_message_reactions_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateIndex
CREATE INDEX "app_message_reactions_user_id_idx" ON "app_message_reactions"("user_id");

-- AddForeignKey
ALTER TABLE "app_message_reactions" ADD CONSTRAINT "app_message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "app_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_message_reactions" ADD CONSTRAINT "app_message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
