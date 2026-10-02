-- Web checkout (Polar) for coins. Additive: one nullable column on
-- app_iap_products and the web product rows. provider_product_id holds the
-- Polar product UUID and is filled from /admin/coins once the products exist
-- in Polar; a web row without it is not sold.
--
-- No $0.99 pack on the web: Polar's fixed fee (50 cents on the Starter plan)
-- would take more than half of it.

-- AlterTable
ALTER TABLE "app"."app_iap_products" ADD COLUMN "provider_product_id" TEXT;

INSERT INTO "app"."app_iap_products" ("id", "platform", "store_product_id", "coin_micro", "bonus_micro", "price_usd_cents", "sort_order", "badge", "updated_at") VALUES
  ('seed_web_coin_3000', 'web', 'coin_3000', 3000000000, 90000000, 299, 2, NULL, CURRENT_TIMESTAMP),
  ('seed_web_coin_10000', 'web', 'coin_10000', 10000000000, 600000000, 999, 3, NULL, CURRENT_TIMESTAMP),
  ('seed_web_coin_30000', 'web', 'coin_30000', 30000000000, 3000000000, 2999, 4, NULL, CURRENT_TIMESTAMP),
  ('seed_web_coin_100000', 'web', 'coin_100000', 100000000000, 15000000000, 9999, 5, 'best_value', CURRENT_TIMESTAMP);
