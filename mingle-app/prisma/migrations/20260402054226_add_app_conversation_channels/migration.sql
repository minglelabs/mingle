-- AlterTable
ALTER TABLE "app_client_version_policies" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_event_logs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_message_contents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_messages" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_password_reset_tokens" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "used_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "app_users" ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "email_verified" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "auth_sessions" ALTER COLUMN "expires" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "auth_verification_tokens" ALTER COLUMN "expires" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "app_conversation_channels" (
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
CREATE UNIQUE INDEX "app_conversation_channels_session_key_key" ON "app_conversation_channels"("session_key");

-- CreateIndex
CREATE INDEX "app_conversation_channels_owner_updated_at_idx" ON "app_conversation_channels"("owner_user_id", "updated_at");

-- CreateIndex
CREATE INDEX "app_conversation_channels_owner_status_idx" ON "app_conversation_channels"("owner_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "app_conversation_channels_owner_sequence_uidx" ON "app_conversation_channels"("owner_user_id", "sequence_number");

-- AddForeignKey
ALTER TABLE "app_conversation_channels" ADD CONSTRAINT "app_conversation_channels_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
