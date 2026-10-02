-- Coins + in-app purchases (docs/coin-iap-spec.md). Additive only: ten new
-- tables, their indexes, one foreign key, and seed rows for the price list and
-- the store products. No existing table changes.
--
-- Authored like 20260930085059_add_message_image_texts: the DDL is the output
-- of `prisma migrate diff --from-schema-datamodel <schema before> --to-schema-datamodel
-- prisma/schema.prisma --script`, with table names qualified by the "app" schema.

-- CreateTable
CREATE TABLE "app"."app_coin_wallets" (
    "user_id" TEXT NOT NULL,
    "balance_micro" BIGINT NOT NULL DEFAULT 0,
    "free_balance_micro" BIGINT NOT NULL DEFAULT 0,
    "paid_balance_micro" BIGINT NOT NULL DEFAULT 0,
    "last_daily_grant_at" TIMESTAMP(3),
    "daily_grant_seq" INTEGER NOT NULL DEFAULT 0,
    "lifetime_purchased_micro" BIGINT NOT NULL DEFAULT 0,
    "lifetime_spent_micro" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_coin_wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "app"."app_coin_lots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "is_free" BOOLEAN NOT NULL,
    "granted_micro" BIGINT NOT NULL,
    "remaining_micro" BIGINT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "purchase_id" TEXT,
    "admin_grant_id" TEXT,
    "note" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_coin_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_coin_ledger" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount_micro" BIGINT NOT NULL,
    "balance_after_micro" BIGINT NOT NULL,
    "lot_id" TEXT,
    "usage_charge_id" TEXT,
    "purchase_id" TEXT,
    "admin_grant_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_coin_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_coin_spend_allocations" (
    "id" BIGSERIAL NOT NULL,
    "ledger_id" BIGINT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "amount_micro" BIGINT NOT NULL,

    CONSTRAINT "app_coin_spend_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_coin_usage_charges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "units" JSONB NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "pricing_rate_id" TEXT,
    "cost_usd_micro" BIGINT NOT NULL,
    "margin_bps" INTEGER NOT NULL,
    "charged_micro" BIGINT NOT NULL,
    "uncollected_micro" BIGINT NOT NULL DEFAULT 0,
    "shadow" BOOLEAN NOT NULL DEFAULT false,
    "conversation_id" TEXT,
    "message_id" TEXT,
    "session_key" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_coin_usage_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_coin_pricing_rates" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "usd_micro_per_million_units" BIGINT NOT NULL,
    "margin_bps" INTEGER NOT NULL DEFAULT 15000,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_by_admin" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_coin_pricing_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_iap_products" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "store_product_id" TEXT NOT NULL,
    "coin_micro" BIGINT NOT NULL,
    "bonus_micro" BIGINT NOT NULL DEFAULT 0,
    "price_usd_cents" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "badge" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_iap_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_iap_purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "store_transaction_id" TEXT NOT NULL,
    "store_original_transaction_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "price_amount_micros" BIGINT,
    "price_currency" TEXT,
    "storefront_country" TEXT,
    "raw_payload" JSONB,
    "environment" TEXT,
    "lot_id" TEXT,
    "meta" JSONB,
    "verified_at" TIMESTAMP(3),
    "granted_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_iap_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_iap_store_events" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "notification_type" TEXT,
    "notification_id" TEXT,
    "store_transaction_id" TEXT,
    "raw_payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "process_result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_iap_store_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."app_coin_admin_grants" (
    "id" TEXT NOT NULL,
    "admin_username" TEXT NOT NULL,
    "request_ip" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,
    "amount_micro" BIGINT NOT NULL,
    "applied_micro" BIGINT NOT NULL DEFAULT 0,
    "is_free" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_coin_admin_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_coin_lots_user_spend_order_idx" ON "app"."app_coin_lots"("user_id", "is_free" DESC, "created_at");

-- CreateIndex
CREATE INDEX "app_coin_lots_purchase_id_idx" ON "app"."app_coin_lots"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_coin_ledger_idempotency_key_uidx" ON "app"."app_coin_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "app_coin_ledger_user_id_desc_idx" ON "app"."app_coin_ledger"("user_id", "id" DESC);

-- CreateIndex
CREATE INDEX "app_coin_ledger_created_at_idx" ON "app"."app_coin_ledger"("created_at");

-- CreateIndex
CREATE INDEX "app_coin_spend_allocations_ledger_id_idx" ON "app"."app_coin_spend_allocations"("ledger_id");

-- CreateIndex
CREATE INDEX "app_coin_spend_allocations_lot_id_idx" ON "app"."app_coin_spend_allocations"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_coin_usage_charges_idempotency_key_uidx" ON "app"."app_coin_usage_charges"("idempotency_key");

-- CreateIndex
CREATE INDEX "app_coin_usage_charges_user_created_at_idx" ON "app"."app_coin_usage_charges"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "app_coin_usage_charges_created_at_idx" ON "app"."app_coin_usage_charges"("created_at");

-- CreateIndex
CREATE INDEX "app_coin_pricing_rates_lookup_idx" ON "app"."app_coin_pricing_rates"("kind", "model", "unit", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "app_iap_products_platform_store_product_uidx" ON "app"."app_iap_products"("platform", "store_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_iap_purchases_store_transaction_uidx" ON "app"."app_iap_purchases"("store_transaction_id");

-- CreateIndex
CREATE INDEX "app_iap_purchases_user_created_at_idx" ON "app"."app_iap_purchases"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "app_iap_purchases_created_at_idx" ON "app"."app_iap_purchases"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_iap_store_events_notification_uidx" ON "app"."app_iap_store_events"("notification_id");

-- CreateIndex
CREATE INDEX "app_iap_store_events_store_transaction_idx" ON "app"."app_iap_store_events"("store_transaction_id");

-- CreateIndex
CREATE INDEX "app_iap_store_events_created_at_idx" ON "app"."app_iap_store_events"("created_at");

-- CreateIndex
CREATE INDEX "app_coin_admin_grants_user_created_at_idx" ON "app"."app_coin_admin_grants"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "app"."app_coin_spend_allocations" ADD CONSTRAINT "app_coin_spend_allocations_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "app"."app_coin_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Seed: price list. usd_micro_per_million_units = micro-USD per 1,000,000 units.
-- Sources checked 2026-10-03: soniox.com/pricing, ai.google.dev/gemini-api/docs/pricing,
-- developers.openai.com/api/docs/pricing.
-- effective_from is an explicit UTC literal (not CURRENT_TIMESTAMP, which is session-local).
-- Rows whose note starts with "ASSUMED"
-- could not be confirmed from a public price page and must be reviewed in /admin/coins.
INSERT INTO "app"."app_coin_pricing_rates" ("id", "kind", "provider", "model", "unit", "usd_micro_per_million_units", "margin_bps", "created_by_admin", "note", "effective_from") VALUES
  ('seed_stt_soniox_second', 'stt', 'soniox', '*', 'second', 33333333, 15000, 'seed', 'Soniox real-time $0.12/hour', '2026-01-01 00:00:00'),
  ('seed_tr_g25fl_in', 'translation', 'google', 'gemini-2.5-flash-lite', 'input_token', 100000, 15000, 'seed', '$0.10 / 1M input', '2026-01-01 00:00:00'),
  ('seed_tr_g25fl_out', 'translation', 'google', 'gemini-2.5-flash-lite', 'output_token', 400000, 15000, 'seed', '$0.40 / 1M output', '2026-01-01 00:00:00'),
  ('seed_tr_luna_in', 'translation', 'openai', 'gpt-6-luna', 'input_token', 100000, 15000, 'seed', '$0.10 / 1M input', '2026-01-01 00:00:00'),
  ('seed_tr_luna_out', 'translation', 'openai', 'gpt-6-luna', 'output_token', 500000, 15000, 'seed', '$0.50 / 1M output', '2026-01-01 00:00:00'),
  ('seed_tr_gemma_in', 'translation', 'google', 'gemma-4-31b-it', 'input_token', 100000, 15000, 'seed', 'ASSUMED: no paid-tier price published; priced like gemini-2.5-flash-lite', '2026-01-01 00:00:00'),
  ('seed_tr_gemma_out', 'translation', 'google', 'gemma-4-31b-it', 'output_token', 400000, 15000, 'seed', 'ASSUMED: no paid-tier price published; priced like gemini-2.5-flash-lite', '2026-01-01 00:00:00'),
  ('seed_tr_qwen_in', 'translation', 'openrouter', 'qwen/qwen3.5-9b', 'input_token', 100000, 15000, 'seed', 'ASSUMED: OpenRouter price not confirmed', '2026-01-01 00:00:00'),
  ('seed_tr_qwen_out', 'translation', 'openrouter', 'qwen/qwen3.5-9b', 'output_token', 400000, 15000, 'seed', 'ASSUMED: OpenRouter price not confirmed', '2026-01-01 00:00:00'),
  ('seed_tr_any_in', 'translation', '*', '*', 'input_token', 100000, 15000, 'seed', 'Fallback for unlisted models', '2026-01-01 00:00:00'),
  ('seed_tr_any_out', 'translation', '*', '*', 'output_token', 500000, 15000, 'seed', 'Fallback for unlisted models', '2026-01-01 00:00:00'),
  ('seed_tts_g38fl_sec', 'tts', 'google', 'gemini-3.8-flash-lite-tts', 'second', 150000000, 15000, 'seed', '$6.00 / 1M audio output tokens, 25 tokens per second', '2026-01-01 00:00:00'),
  ('seed_tts_g38fl_char', 'tts', 'google', 'gemini-3.8-flash-lite-tts', 'char', 125000, 15000, 'seed', '$0.50 / 1M text input tokens, ASSUMED 4 chars per token', '2026-01-01 00:00:00'),
  ('seed_tts_g38f_sec', 'tts', 'google', 'gemini-3.8-flash-tts', 'second', 225000000, 15000, 'seed', '$9.00 / 1M audio output tokens, 25 tokens per second', '2026-01-01 00:00:00'),
  ('seed_tts_g38f_char', 'tts', 'google', 'gemini-3.8-flash-tts', 'char', 125000, 15000, 'seed', '$0.50 / 1M text input tokens, ASSUMED 4 chars per token', '2026-01-01 00:00:00'),
  ('seed_tts_inworld_char', 'tts', 'inworld', 'inworld-tts-1.5-mini', 'char', 5000000, 15000, 'seed', 'ASSUMED: $5 / 1M characters, not on the public price page', '2026-01-01 00:00:00'),
  ('seed_tts_any_char', 'tts', '*', '*', 'char', 5000000, 15000, 'seed', 'ASSUMED fallback for unlisted TTS models', '2026-01-01 00:00:00'),
  ('seed_img_g38f_in', 'image_text', 'google', 'gemini-3.8-flash', 'input_token', 750000, 15000, 'seed', '$0.75 / 1M input (through 2026-12-31)', '2026-01-01 00:00:00'),
  ('seed_img_g38f_out', 'image_text', 'google', 'gemini-3.8-flash', 'output_token', 3750000, 15000, 'seed', '$3.75 / 1M output (through 2026-12-31)', '2026-01-01 00:00:00'),
  ('seed_img_g37f_in', 'image_text', 'google', 'gemini-3.7-flash', 'input_token', 750000, 15000, 'seed', '$0.75 / 1M input (through 2026-12-31)', '2026-01-01 00:00:00'),
  ('seed_img_g37f_out', 'image_text', 'google', 'gemini-3.7-flash', 'output_token', 3750000, 15000, 'seed', '$3.75 / 1M output (through 2026-12-31)', '2026-01-01 00:00:00'),
  ('seed_img_g35fl_in', 'image_text', 'google', 'gemini-3.5-flash-lite', 'input_token', 300000, 15000, 'seed', '$0.30 / 1M input', '2026-01-01 00:00:00'),
  ('seed_img_g35fl_out', 'image_text', 'google', 'gemini-3.5-flash-lite', 'output_token', 2500000, 15000, 'seed', '$2.50 / 1M output', '2026-01-01 00:00:00'),
  ('seed_img_g31fl_in', 'image_text', 'google', 'gemini-3.1-flash-lite', 'input_token', 250000, 15000, 'seed', '$0.25 / 1M input', '2026-01-01 00:00:00'),
  ('seed_img_g31fl_out', 'image_text', 'google', 'gemini-3.1-flash-lite', 'output_token', 1500000, 15000, 'seed', '$1.50 / 1M output', '2026-01-01 00:00:00'),
  ('seed_img_any_in', 'image_text', '*', '*', 'input_token', 750000, 15000, 'seed', 'Fallback for unlisted models', '2026-01-01 00:00:00'),
  ('seed_img_any_out', 'image_text', '*', '*', 'output_token', 3750000, 15000, 'seed', 'Fallback for unlisted models', '2026-01-01 00:00:00');

-- Seed: store products. Amounts are micro-coins. $1 = 1,000 coins, with a volume bonus that
-- grows with the pack: +3% ($3), +6% ($10), +10% ($30), +15% ($100).
INSERT INTO "app"."app_iap_products" ("id", "platform", "store_product_id", "coin_micro", "bonus_micro", "price_usd_cents", "sort_order", "badge", "updated_at") VALUES
  ('seed_ios_coin_1000', 'ios', 'coin_1000', 1000000000, 0, 99, 1, NULL, CURRENT_TIMESTAMP),
  ('seed_ios_coin_3000', 'ios', 'coin_3000', 3000000000, 90000000, 299, 2, NULL, CURRENT_TIMESTAMP),
  ('seed_ios_coin_10000', 'ios', 'coin_10000', 10000000000, 600000000, 999, 3, NULL, CURRENT_TIMESTAMP),
  ('seed_ios_coin_30000', 'ios', 'coin_30000', 30000000000, 3000000000, 2999, 4, NULL, CURRENT_TIMESTAMP),
  ('seed_ios_coin_100000', 'ios', 'coin_100000', 100000000000, 15000000000, 9999, 5, 'best_value', CURRENT_TIMESTAMP),
  ('seed_android_coin_1000', 'android', 'coin_1000', 1000000000, 0, 99, 1, NULL, CURRENT_TIMESTAMP),
  ('seed_android_coin_3000', 'android', 'coin_3000', 3000000000, 90000000, 299, 2, NULL, CURRENT_TIMESTAMP),
  ('seed_android_coin_10000', 'android', 'coin_10000', 10000000000, 600000000, 999, 3, NULL, CURRENT_TIMESTAMP),
  ('seed_android_coin_30000', 'android', 'coin_30000', 30000000000, 3000000000, 2999, 4, NULL, CURRENT_TIMESTAMP),
  ('seed_android_coin_100000', 'android', 'coin_100000', 100000000000, 15000000000, 9999, 5, 'best_value', CURRENT_TIMESTAMP);
