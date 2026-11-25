-- Dormant accounts (owner, 2026-11-25): every account without a profile photo
-- is put to sleep until it adds one and passes the face check
-- (src/server/dormancy.ts). Operator and official accounts are left alone.
-- One nullable column (no rewrite) and one UPDATE over the users table.
ALTER TABLE "app"."app_users" ADD COLUMN IF NOT EXISTS "dormant_at" TIMESTAMP(3);

UPDATE "app"."app_users"
SET "dormant_at" = CURRENT_TIMESTAMP
WHERE "dormant_at" IS NULL
  AND ("image" IS NULL OR btrim("image") = '')
  AND "is_operator" = false
  AND "is_official" = false
  AND "is_deleted" = false;
