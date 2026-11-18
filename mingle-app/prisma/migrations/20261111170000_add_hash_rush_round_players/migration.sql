-- Hash Rush rounds as the game server reports them, one row per person per
-- round, for the rankings. Additive: one new table.
CREATE TABLE "app"."app_hash_rush_round_players" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "user_id" TEXT NOT NULL,
    "won" BOOLEAN NOT NULL,
    "seeds" INTEGER NOT NULL DEFAULT 0,
    "bonks" INTEGER NOT NULL DEFAULT 0,
    "bonked" INTEGER NOT NULL DEFAULT 0,
    "teams" BOOLEAN NOT NULL DEFAULT false,
    "map" TEXT,
    "played_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_hash_rush_round_players_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_hash_rush_round_players_match_id_user_id_key" ON "app"."app_hash_rush_round_players"("match_id", "user_id");
CREATE INDEX "app_hash_rush_round_players_user_id_idx" ON "app"."app_hash_rush_round_players"("user_id");
CREATE INDEX "app_hash_rush_round_players_channel_id_user_id_idx" ON "app"."app_hash_rush_round_players"("channel_id", "user_id");
