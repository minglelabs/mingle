-- Persona gender (steers generated photos) and the spec the current AI photo was made from.
ALTER TABLE "app_operator_accounts" ADD COLUMN "persona_gender" TEXT;
ALTER TABLE "app_operator_accounts" ADD COLUMN "avatar_spec" JSONB;
ALTER TABLE "app_operator_accounts" ADD COLUMN "avatar_generated_at" TIMESTAMP(3);
