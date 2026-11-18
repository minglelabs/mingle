-- Group voice room (Phase 2): voice calls and their participants.
--
-- Scope note: generated with `prisma migrate dev --create-only` and pruned of
-- the same two pre-existing drifts documented in 20260925170000_add_posting_feed
-- (app_users TIMESTAMPTZ columns and the partial app_event_logs usage indexes).
-- Neither belongs to this feature and neither may be rewritten in production.
--
-- Added by hand: a partial unique index so a channel has at most one live call.

-- CreateTable
CREATE TABLE "app_voice_calls" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "livekit_room" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'live',
    "started_by_user_id" TEXT NOT NULL,
    "max_participants" INTEGER NOT NULL DEFAULT 8,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "interpreted_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_voice_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_voice_call_participants" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'speaker',
    "interpret_on" BOOLEAN NOT NULL DEFAULT true,
    "speech_language" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "interpreted_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_voice_call_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_voice_calls_livekit_room_key" ON "app_voice_calls"("livekit_room");

-- CreateIndex
CREATE INDEX "app_voice_calls_channel_status_idx" ON "app_voice_calls"("channel_id", "status");

-- CreateIndex
CREATE INDEX "app_voice_calls_status_started_at_idx" ON "app_voice_calls"("status", "started_at");

-- CreateIndex (hand-written: at most one live call per channel)
CREATE UNIQUE INDEX "app_voice_calls_channel_live_uidx" ON "app_voice_calls"("channel_id") WHERE "status" = 'live';

-- CreateIndex
CREATE INDEX "app_voice_call_participants_user_joined_idx" ON "app_voice_call_participants"("user_id", "joined_at");

-- CreateIndex
CREATE INDEX "app_voice_call_participants_call_left_idx" ON "app_voice_call_participants"("call_id", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_voice_call_participants_call_user_uidx" ON "app_voice_call_participants"("call_id", "user_id");

-- AddForeignKey
ALTER TABLE "app_voice_calls" ADD CONSTRAINT "app_voice_calls_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "app_conversation_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_voice_call_participants" ADD CONSTRAINT "app_voice_call_participants_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "app_voice_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_voice_call_participants" ADD CONSTRAINT "app_voice_call_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
