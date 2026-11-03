-- What the user mostly uses HashChat for (social / work / other), asked
-- during onboarding. Additive only: one nullable column.

-- AlterTable
ALTER TABLE "app"."app_users" ADD COLUMN "usage_purpose" TEXT;
