-- AlterTable
ALTER TABLE "app"."app_users"
ADD COLUMN "api_namespace_history" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "app_version_history" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "latest_api_namespace" TEXT,
ADD COLUMN "latest_app_version" TEXT,
ADD COLUMN "latest_client_platform" TEXT;

-- Backfill legacy release coverage so existing users immediately expose the
-- historical client versions requested for 1.0.0 through 1.0.6.
UPDATE "app"."app_users"
SET "app_version_history" = ARRAY[
  '1.0.0',
  '1.0.1',
  '1.0.2',
  '1.0.3',
  '1.0.4',
  '1.0.5',
  '1.0.6'
]::TEXT[]
WHERE COALESCE("app_version_history", ARRAY[]::TEXT[]) <@ ARRAY[
  '1.0.0',
  '1.0.1',
  '1.0.2',
  '1.0.3',
  '1.0.4',
  '1.0.5',
  '1.0.6'
]::TEXT[];
