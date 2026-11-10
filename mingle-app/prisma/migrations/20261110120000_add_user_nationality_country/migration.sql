-- 국적 (nationality) as its own field: an ISO 3166-1 alpha-2 country, upper
-- case, shown as the flag on the avatar. Separate from the spoken languages.
-- Additive only: one nullable column, one check constraint, a backfill.

-- AlterTable
ALTER TABLE "app"."app_users" ADD COLUMN "nationality_country" TEXT;

ALTER TABLE "app"."app_users" ADD CONSTRAINT "app_users_nationality_country_chk" CHECK ("nationality_country" IS NULL OR "nationality_country" ~ '^[A-Z]{2}$');

-- Operator accounts: the country staff gave the persona.
UPDATE "app"."app_users" AS u
SET "nationality_country" = upper(o."persona_country")
FROM "app"."app_operator_accounts" AS o
WHERE o."user_id" = u."id"
  AND o."persona_country" ~* '^[a-z]{2}$';

-- Everyone else: the country of their first primary language (en -> US,
-- ko -> KR), the same mapping onboarding uses (src/lib/nationality.ts).
UPDATE "app"."app_users" AS u
SET "nationality_country" = m."country"
FROM (VALUES
  ('af', 'ZA'),
  ('sq', 'AL'),
  ('ar', 'SA'),
  ('az', 'AZ'),
  ('eu', 'ES'),
  ('be', 'BY'),
  ('bn', 'BD'),
  ('bs', 'BA'),
  ('bg', 'BG'),
  ('ca', 'ES'),
  ('zh', 'CN'),
  ('zh-CN', 'CN'),
  ('zh-TW', 'TW'),
  ('hr', 'HR'),
  ('cs', 'CZ'),
  ('da', 'DK'),
  ('nl', 'NL'),
  ('en', 'US'),
  ('et', 'EE'),
  ('fi', 'FI'),
  ('fr', 'FR'),
  ('gl', 'ES'),
  ('de', 'DE'),
  ('el', 'GR'),
  ('gu', 'IN'),
  ('he', 'IL'),
  ('hi', 'IN'),
  ('hu', 'HU'),
  ('id', 'ID'),
  ('it', 'IT'),
  ('ja', 'JP'),
  ('kn', 'IN'),
  ('kk', 'KZ'),
  ('ko', 'KR'),
  ('lv', 'LV'),
  ('lt', 'LT'),
  ('mk', 'MK'),
  ('ms', 'MY'),
  ('ml', 'IN'),
  ('mr', 'IN'),
  ('no', 'NO'),
  ('fa', 'IR'),
  ('pl', 'PL'),
  ('pt', 'PT'),
  ('pa', 'IN'),
  ('ro', 'RO'),
  ('ru', 'RU'),
  ('sr', 'RS'),
  ('sk', 'SK'),
  ('sl', 'SI'),
  ('es', 'ES'),
  ('sw', 'TZ'),
  ('sv', 'SE'),
  ('tl', 'PH'),
  ('ta', 'IN'),
  ('te', 'IN'),
  ('th', 'TH'),
  ('tr', 'TR'),
  ('uk', 'UA'),
  ('ur', 'PK'),
  ('vi', 'VN'),
  ('cy', 'GB')
) AS m("language", "country")
WHERE u."nationality_country" IS NULL
  AND m."language" = COALESCE(u."primary_languages"[1], u."nationality");
