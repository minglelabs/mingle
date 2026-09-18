-- Initialize the display-language preference for existing users who have not
-- chosen one yet, using the first primary language selected on their profile.
UPDATE "app"."app_users"
SET "default_display_language" = "primary_languages"[1]
WHERE "default_display_language" IS NULL
  AND cardinality("primary_languages") > 0
  AND "primary_languages"[1] IS NOT NULL
  AND btrim("primary_languages"[1]) <> '';
