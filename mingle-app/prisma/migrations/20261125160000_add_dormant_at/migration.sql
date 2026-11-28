-- Dormant accounts (owner, 2026-11-25): every account without a profile photo
-- is put to sleep until it adds one and passes the face check
-- (src/server/dormancy.ts). Operator and official accounts are left alone.
-- One nullable column (no rewrite). The owner chose (2026-11-29) not to put
-- existing accounts to sleep at release: no UPDATE here; the column stays empty.
ALTER TABLE "app"."app_users" ADD COLUMN IF NOT EXISTS "dormant_at" TIMESTAMP(3);
