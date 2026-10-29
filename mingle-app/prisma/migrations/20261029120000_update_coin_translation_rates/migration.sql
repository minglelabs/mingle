-- Translation models changed after the coin seed: Gemma and Qwen were removed,
-- Claude Haiku 5.5 was added, and GPT-6 Luna / Gemini now always run on the
-- fast (priority) tier, which costs twice the standard price. Retired rows are
-- closed, never edited in place (spec 8).
UPDATE "app"."app_coin_pricing_rates"
SET "effective_to" = '2026-10-29 00:00:00'
WHERE "id" IN (
    'seed_tr_gemma_in', 'seed_tr_gemma_out', 'seed_tr_qwen_in', 'seed_tr_qwen_out',
    'seed_tr_luna_in', 'seed_tr_luna_out', 'seed_tr_g25fl_in', 'seed_tr_g25fl_out'
  )
  AND "effective_to" IS NULL;

INSERT INTO "app"."app_coin_pricing_rates" ("id", "kind", "provider", "model", "unit", "usd_micro_per_million_units", "margin_bps", "created_by_admin", "note", "effective_from") VALUES
  ('rate_tr_luna_fast_in', 'translation', 'openai', 'gpt-6-luna', 'input_token', 200000, 15000, 'seed', '$0.10 / 1M input x2 (Fast / priority tier)', '2026-10-29 00:00:00'),
  ('rate_tr_luna_fast_out', 'translation', 'openai', 'gpt-6-luna', 'output_token', 1000000, 15000, 'seed', '$0.50 / 1M output x2 (Fast / priority tier)', '2026-10-29 00:00:00'),
  ('rate_tr_g25fl_prio_in', 'translation', 'google', 'gemini-2.5-flash-lite', 'input_token', 200000, 15000, 'seed', '$0.10 / 1M input x2 (priority tier)', '2026-10-29 00:00:00'),
  ('rate_tr_g25fl_prio_out', 'translation', 'google', 'gemini-2.5-flash-lite', 'output_token', 800000, 15000, 'seed', '$0.40 / 1M output x2 (priority tier)', '2026-10-29 00:00:00'),
  ('rate_tr_haiku55_in', 'translation', 'anthropic', 'claude-haiku-5-5', 'input_token', 100000, 15000, 'seed', '$0.10 / 1M input (no fast tier; prompts up to 100K tokens)', '2026-01-01 00:00:00'),
  ('rate_tr_haiku55_out', 'translation', 'anthropic', 'claude-haiku-5-5', 'output_token', 500000, 15000, 'seed', '$0.50 / 1M output (no fast tier; prompts up to 100K tokens)', '2026-01-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;
