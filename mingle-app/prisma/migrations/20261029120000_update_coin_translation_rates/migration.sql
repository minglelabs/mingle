-- Translation models changed after the coin seed: Gemma and Qwen were removed,
-- Claude Haiku 5.5 was added. Close the retired rows (rows are never edited
-- in place otherwise, spec 8) and add Haiku at its first-party price.
UPDATE "app"."app_coin_pricing_rates"
SET "effective_to" = '2026-10-29 00:00:00'
WHERE "id" IN ('seed_tr_gemma_in', 'seed_tr_gemma_out', 'seed_tr_qwen_in', 'seed_tr_qwen_out')
  AND "effective_to" IS NULL;

INSERT INTO "app"."app_coin_pricing_rates" ("id", "kind", "provider", "model", "unit", "usd_micro_per_million_units", "margin_bps", "created_by_admin", "note", "effective_from") VALUES
  ('seed_tr_haiku55_in', 'translation', 'anthropic', 'claude-haiku-5-5', 'input_token', 100000, 15000, 'seed', '$0.10 / 1M input (prompts up to 100K tokens)', '2026-01-01 00:00:00'),
  ('seed_tr_haiku55_out', 'translation', 'anthropic', 'claude-haiku-5-5', 'output_token', 500000, 15000, 'seed', '$0.50 / 1M output (prompts up to 100K tokens)', '2026-01-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;
