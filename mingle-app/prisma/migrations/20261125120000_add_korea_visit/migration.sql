-- The Korea trip a non-Korean answers at sign-up (dates, undecided, or was
-- there recently): until now only on the phone and in analytics. Additive
-- only: one nullable column.
ALTER TABLE "app"."app_users" ADD COLUMN "korea_visit" JSONB;
