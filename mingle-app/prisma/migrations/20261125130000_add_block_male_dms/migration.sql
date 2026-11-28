-- A woman can stop men from opening a new 1:1 room with her. Additive only:
-- one column with a default (no rewrite on Postgres 11+).
ALTER TABLE "app"."app_users" ADD COLUMN "block_male_dms" BOOLEAN NOT NULL DEFAULT false;
