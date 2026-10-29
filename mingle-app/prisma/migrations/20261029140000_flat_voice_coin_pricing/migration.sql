-- Flat, per-minute voice pricing (spec 4.2, revision 2). Amounts are the base
-- price before the 1.5x margin, so with the margin a user pays:
--   voice (mic on):  8 Hash per minute, translation of spoken turns included
--   voice playback:  about 5 Hash per conversation minute on top (~22 s of
--                    audio per minute measured), so ~13 per minute with TTS on
--   typed message:   0.3 Hash each, whatever the model or number of languages
-- Rates are averages, not per-model cost: provider cost stays visible in
-- /admin/coins through the recorded units and served model.
UPDATE "app"."app_coin_pricing_rates"
SET "effective_to" = '2026-10-29 00:00:00'
WHERE "kind" IN ('stt', 'tts') AND "effective_to" IS NULL;

INSERT INTO "app"."app_coin_pricing_rates" ("id", "kind", "provider", "model", "unit", "usd_micro_per_million_units", "margin_bps", "created_by_admin", "note", "effective_from") VALUES
  ('rate_voice_flat_second', 'stt', '*', '*', 'second', 88888889, 15000, 'seed', 'Flat voice price: 8 Hash/min with margin, covers Soniox and translation of spoken turns', '2026-10-29 00:00:00'),
  ('rate_tts_flat_second', 'tts', '*', '*', 'second', 151515152, 15000, 'seed', 'Flat playback price: ~13.6 Hash per audio minute (~5 per conversation minute) with margin, any TTS model', '2026-10-29 00:00:00'),
  ('rate_translation_typed_message', 'translation', '*', '*', 'message', 200000000, 15000, 'seed', 'Flat typed-message price: 0.3 Hash with margin, any model or language count', '2026-10-29 00:00:00')
ON CONFLICT ("id") DO NOTHING;
