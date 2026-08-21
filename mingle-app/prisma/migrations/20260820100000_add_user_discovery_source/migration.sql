-- Store how a new user discovered Mingle for onboarding analytics.
ALTER TABLE "app"."app_users" ADD COLUMN "discovery_source" TEXT;
