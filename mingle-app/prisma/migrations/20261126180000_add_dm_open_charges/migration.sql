-- Hash a man pays to open a 1:1 room with a woman he has no room with yet
-- (owner, 2026-11-26; src/server/dm-open-charge.ts). One row per room opened
-- that way: what was taken, and when it is given back if she has not written
-- by then. Additive only: one new table, no change to existing rows.
CREATE TABLE "app"."app_dm_open_charges" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "charged_micro" BIGINT NOT NULL,
    "refund_due_at" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3),
    "outcome" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_dm_open_charges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_dm_open_charges_channel_id_key" ON "app"."app_dm_open_charges"("channel_id");
CREATE INDEX "app_dm_open_charges_sender_settled_idx" ON "app"."app_dm_open_charges"("sender_user_id", "settled_at");
