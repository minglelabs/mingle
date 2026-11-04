-- Public profile gender ('female' | 'male'), shown next to the age on
-- profiles. Additive only: one nullable column and one check constraint.
-- Operator accounts take the gender staff already gave their persona.

-- AlterTable
ALTER TABLE "app"."app_users" ADD COLUMN "gender" TEXT;

ALTER TABLE "app"."app_users" ADD CONSTRAINT "app_users_gender_chk" CHECK ("gender" IS NULL OR "gender" IN ('female', 'male'));

-- Backfill operator accounts from their persona.
UPDATE "app"."app_users" AS u
SET "gender" = o."persona_gender"
FROM "app"."app_operator_accounts" AS o
WHERE o."user_id" = u."id"
  AND o."persona_gender" IN ('female', 'male');
