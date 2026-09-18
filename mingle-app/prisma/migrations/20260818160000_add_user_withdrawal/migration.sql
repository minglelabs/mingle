-- Add withdrawal-related columns to app_users table
-- withdrawn_at: timestamp when the user requested withdrawal
-- scheduled_delete_at: timestamp when the account will be permanently dangled (withdrawn_at + 30 days)
-- is_deleted: whether the account has been permanently dangled/anonymized
-- deleted_at: timestamp when the account was permanently dangled

ALTER TABLE "app"."app_users"
  ADD COLUMN IF NOT EXISTS "withdrawn_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "scheduled_delete_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
