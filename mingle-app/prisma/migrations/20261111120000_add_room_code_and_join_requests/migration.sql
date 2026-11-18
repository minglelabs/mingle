-- Room numbers people type in Search ("482 1937") and join requests for
-- private rooms found by their number. Additive: one new column (backfilled),
-- one function, one new table.

-- A free random 7-digit room number. Random, not sequential, so a room's
-- neighbours cannot be found by counting.
CREATE OR REPLACE FUNCTION "app"."next_room_code"() RETURNS INTEGER
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  candidate INTEGER;
BEGIN
  LOOP
    candidate := 1000000 + floor(random() * 9000000)::INTEGER;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM "app"."app_conversation_channels" WHERE "room_code" = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;

ALTER TABLE "app"."app_conversation_channels" ADD COLUMN "room_code" INTEGER;

-- One row at a time, so each new number sees the ones given before it.
DO $$
DECLARE
  channel RECORD;
BEGIN
  FOR channel IN SELECT "id" FROM "app"."app_conversation_channels" WHERE "room_code" IS NULL ORDER BY "created_at" LOOP
    UPDATE "app"."app_conversation_channels" SET "room_code" = "app"."next_room_code"() WHERE "id" = channel."id";
  END LOOP;
END;
$$;

ALTER TABLE "app"."app_conversation_channels" ALTER COLUMN "room_code" SET NOT NULL;
ALTER TABLE "app"."app_conversation_channels" ALTER COLUMN "room_code" SET DEFAULT "app"."next_room_code"();
CREATE UNIQUE INDEX "app_conversation_channels_room_code_key" ON "app"."app_conversation_channels"("room_code");

-- CreateTable
CREATE TABLE "app"."app_conversation_join_requests" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_conversation_join_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_conversation_join_requests_channel_id_status_idx" ON "app"."app_conversation_join_requests"("channel_id", "status");
CREATE UNIQUE INDEX "app_conversation_join_requests_channel_id_user_id_key" ON "app"."app_conversation_join_requests"("channel_id", "user_id");

ALTER TABLE "app"."app_conversation_join_requests" ADD CONSTRAINT "app_conversation_join_requests_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "app"."app_conversation_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."app_conversation_join_requests" ADD CONSTRAINT "app_conversation_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
