-- Web (Polar) packs give a larger bonus than the store packs: Polar keeps
-- about 5% + 50 cents, the stores 15-30%. Store rows are unchanged.
-- Bonus: $2.99 +5%, $9.99 +12%, $29.99 +20%, $99.99 +25%.
UPDATE "app"."app_iap_products" SET "bonus_micro" = 150000000, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'seed_web_coin_3000';
UPDATE "app"."app_iap_products" SET "bonus_micro" = 1200000000, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'seed_web_coin_10000';
UPDATE "app"."app_iap_products" SET "bonus_micro" = 6000000000, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'seed_web_coin_30000';
UPDATE "app"."app_iap_products" SET "bonus_micro" = 25000000000, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'seed_web_coin_100000';
