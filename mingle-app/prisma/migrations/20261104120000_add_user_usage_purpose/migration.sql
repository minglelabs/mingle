-- What the user mostly uses HashChat for (social / work / other), asked
-- during onboarding, plus the optional free-text reason given with "other".
-- Additive only: two nullable columns.

-- AlterTable
ALTER TABLE "app"."app_users" ADD COLUMN "usage_purpose" TEXT,
ADD COLUMN "usage_purpose_note" TEXT;
