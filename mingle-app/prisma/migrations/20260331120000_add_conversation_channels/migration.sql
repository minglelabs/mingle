-- CreateTable
CREATE TABLE "app"."app_conversation_channels" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "session_key" TEXT NOT NULL,
    "paused_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_conversation_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_conversation_channels_session_key_key"
ON "app"."app_conversation_channels"("session_key");

-- CreateIndex
CREATE UNIQUE INDEX "app_conversation_channels_owner_sequence_uidx"
ON "app"."app_conversation_channels"("owner_user_id", "sequence_number");

-- CreateIndex
CREATE INDEX "app_conversation_channels_owner_updated_at_idx"
ON "app"."app_conversation_channels"("owner_user_id", "updated_at");

-- CreateIndex
CREATE INDEX "app_conversation_channels_owner_status_idx"
ON "app"."app_conversation_channels"("owner_user_id", "status");

-- AddForeignKey
ALTER TABLE "app"."app_conversation_channels"
ADD CONSTRAINT "app_conversation_channels_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
