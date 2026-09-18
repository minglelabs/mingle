-- Store the date of birth privately for the signup age policy.
ALTER TABLE "app"."app_users" ADD COLUMN "birth_date" DATE;
