-- Per-character STT and per-output-token translation latency, cached per day like the raw latencies.
ALTER TABLE "app"."admin_dashboard_daily_metrics"
  ADD COLUMN IF NOT EXISTS "stt_ms_per_char_avg" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "stt_ms_per_char_p95" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "translation_ms_per_token_avg" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "translation_ms_per_token_p95" DOUBLE PRECISION;
