-- AlterTable
ALTER TABLE "app"."app_users"
ADD COLUMN "api_namespace_history" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "app_version_history" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "latest_api_namespace" TEXT,
ADD COLUMN "latest_app_version" TEXT,
ADD COLUMN "latest_client_platform" TEXT;
