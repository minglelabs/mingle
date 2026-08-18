-- CreateTable
CREATE TABLE "app_conversation_members" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_conversation_members_conversation_user_uidx" ON "app_conversation_members"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "app_conversation_members_user_created_at_idx" ON "app_conversation_members"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "app_conversation_members" ADD CONSTRAINT "app_conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "app_conversation_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_conversation_members" ADD CONSTRAINT "app_conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing channel becomes a one-member room owned by its creator.
INSERT INTO "app_conversation_members" ("id", "conversation_id", "user_id", "role", "created_at", "updated_at")
SELECT
    'cm_' || "id",
    "id",
    "owner_user_id",
    'owner',
    "created_at",
    CURRENT_TIMESTAMP
FROM "app_conversation_channels"
ON CONFLICT DO NOTHING;

-- AlterTable
ALTER TABLE "app_messages" ADD COLUMN "conversation_id" TEXT;
ALTER TABLE "app_messages" ADD COLUMN "sender_id" TEXT;
ALTER TABLE "app_messages" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'speech';

-- Backfill: bind existing messages to their room through the session key that
-- used to be the only link, and treat the tracked user as the sender.
UPDATE "app_messages" AS m
SET "conversation_id" = c."id"
FROM "app_conversation_channels" AS c
WHERE m."session_key" = c."session_key"
  AND m."conversation_id" IS NULL;

UPDATE "app_messages"
SET "sender_id" = "user_id"
WHERE "sender_id" IS NULL
  AND "user_id" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "app_messages_conversation_client_message_uidx" ON "app_messages"("conversation_id", "client_message_id");

-- CreateIndex
CREATE INDEX "app_messages_conversation_created_at_desc_idx" ON "app_messages"("conversation_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "app_messages" ADD CONSTRAINT "app_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "app_conversation_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_messages" ADD CONSTRAINT "app_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
