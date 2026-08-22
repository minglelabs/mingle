-- Increase the default endpoint safety cap for newly created users.
ALTER TABLE "app_users"
ALTER COLUMN "demo_endpoint_max_delay_ms" SET DEFAULT 3000;
