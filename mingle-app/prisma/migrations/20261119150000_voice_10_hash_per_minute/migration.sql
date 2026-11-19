-- Voice goes from 8 to 10 Hash per minute (margin 1.5 included). Measured cost
-- per voice hour (Soniox ~$0.12 + spoken-turn translation ~$0.09, plus unlogged
-- interim translations) left 8 Hash/min near break-even on the largest pack
-- after a 30% store fee. 10 Hash/min = $0.111111 base per minute.
UPDATE "app"."app_coin_pricing_rates"
SET "effective_to" = '2026-11-19 06:00:00'
WHERE "id" = 'rate_voice_flat_second' AND "effective_to" IS NULL;

INSERT INTO "app"."app_coin_pricing_rates" ("id", "kind", "provider", "model", "unit", "usd_micro_per_million_units", "margin_bps", "created_by_admin", "note", "effective_from") VALUES
  ('rate_voice_flat_second_10', 'stt', '*', '*', 'second', 111111111, 15000, 'seed', 'Flat voice price: 10 Hash/min with margin, covers Soniox and translation of spoken turns', '2026-11-19 06:00:00')
ON CONFLICT ("id") DO NOTHING;
