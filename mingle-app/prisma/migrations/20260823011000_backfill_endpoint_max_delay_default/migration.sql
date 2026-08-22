-- Migrate the previous implicit default to the new endpoint safety cap.
UPDATE "app_users"
SET "demo_endpoint_max_delay_ms" = 3000
WHERE "demo_endpoint_max_delay_ms" IS NULL
   OR "demo_endpoint_max_delay_ms" = 2000;
