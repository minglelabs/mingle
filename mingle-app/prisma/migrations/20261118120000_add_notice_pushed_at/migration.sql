-- When an important notice was pushed to devices (null: not pushed). It is
-- claimed before sending, so one notice is never pushed twice. Additive only.

-- AlterTable
ALTER TABLE "app"."app_notices" ADD COLUMN "pushed_at" TIMESTAMP(3);
