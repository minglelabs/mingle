-- Per-model TTS playback prices (replaces the one flat price for every model).
-- Provider cost per audio second, before the 1.5x margin; with the margin a
-- user pays per audio minute, and per conversation minute (~22 s of audio):
--   tts-rt-v2 (Soniox, the default)  $0.70/h         -> 17.5 Hash/min, ~6.4 per conversation minute
--   gemini-3.8-flash-lite-tts        $6.00/1M tokens -> 13.5 Hash/min, ~5.0
--   gemini-3.8-flash-tts             $9.00/1M tokens -> 20.3 Hash/min, ~7.4
-- Gemini audio is 25 tokens per second. Soniox's $0.70/h matched a measured
-- 30-clip test ($0.136 for 708 s). The flat "*" row stays as the fallback for
-- any other model. The model is the one that actually spoke (a Soniox
-- selection that fell back to Gemini is priced as Gemini).
INSERT INTO "app"."app_coin_pricing_rates" ("id", "kind", "provider", "model", "unit", "usd_micro_per_million_units", "margin_bps", "created_by_admin", "note", "effective_from") VALUES
  ('rate_tts_soniox_rt_v2_second', 'tts', 'soniox', 'tts-rt-v2', 'second', 194444444, 15000, 'seed', 'Soniox TTS $0.70 per audio hour: 17.5 Hash per audio minute with margin', '2026-11-18 00:00:00'),
  ('rate_tts_g38fl_second', 'tts', 'google', 'gemini-3.8-flash-lite-tts', 'second', 150000000, 15000, 'seed', '$6.00 / 1M audio output tokens, 25 tokens per second: 13.5 Hash per audio minute with margin', '2026-11-18 00:00:00'),
  ('rate_tts_g38f_second', 'tts', 'google', 'gemini-3.8-flash-tts', 'second', 225000000, 15000, 'seed', '$9.00 / 1M audio output tokens, 25 tokens per second: 20.25 Hash per audio minute with margin', '2026-11-18 00:00:00')
ON CONFLICT ("id") DO NOTHING;
