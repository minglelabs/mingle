-- Apply the public username migrations to the Mingle app schema in Supabase.
-- Run this script once in the Supabase SQL Editor.

BEGIN;

-- The Prisma datasource uses the app schema. Keep every object reference
-- schema-qualified so this script cannot accidentally modify public.app_users.
ALTER TABLE app.app_users
ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_key
ON app.app_users (username);

-- Generate deterministic, unique usernames for legacy users before enforcing
-- the required constraint. Existing usernames are preserved.
DO $$
DECLARE
  user_record RECORD;
  username_base TEXT;
  candidate TEXT;
  suffix TEXT;
  sequence_number INTEGER;
BEGIN
  FOR user_record IN
    SELECT id, name, email
    FROM app.app_users
    WHERE username IS NULL
    ORDER BY id
  LOOP
    username_base := COALESCE(
      NULLIF(regexp_replace(COALESCE(user_record.name, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
      NULLIF(regexp_replace(split_part(COALESCE(user_record.email, ''), '@', 1), '[^A-Za-z0-9_.]', '', 'g'), ''),
      'user'
    );
    username_base := left(lower(username_base), 30);
    candidate := username_base;
    sequence_number := 1;

    WHILE EXISTS (
      SELECT 1
      FROM app.app_users
      WHERE username = candidate
    ) LOOP
      suffix := '_' || sequence_number::TEXT;
      candidate := left(username_base, 30 - length(suffix)) || suffix;
      sequence_number := sequence_number + 1;
    END LOOP;

    UPDATE app.app_users
    SET username = candidate
    WHERE id = user_record.id;
  END LOOP;
END $$;

-- Keep the legacy 1.1.4 server compatible while it shares this database.
-- That server's Prisma client does not know about username and can insert
-- app_users rows without providing it. Generate a deterministic handle for
-- those inserts before the NOT NULL constraint is enforced.
CREATE OR REPLACE FUNCTION app.app_users_assign_username()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  username_base TEXT;
  candidate TEXT;
  suffix TEXT;
  sequence_number INTEGER := 1;
BEGIN
  IF NEW.username IS NOT NULL AND btrim(NEW.username) <> '' THEN
    RETURN NEW;
  END IF;

  username_base := COALESCE(
    NULLIF(regexp_replace(COALESCE(NEW.name, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
    NULLIF(regexp_replace(split_part(COALESCE(NEW.email, ''), '@', 1), '[^A-Za-z0-9_.]', '', 'g'), ''),
    NULLIF(regexp_replace(COALESCE(NEW.external_user_id, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
    NULLIF(regexp_replace(COALESCE(NEW.id, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
    'user'
  );
  username_base := left(lower(username_base), 30);

  -- Serialize fallback-name generation so concurrent legacy inserts cannot
  -- choose the same candidate before the unique index checks it.
  PERFORM pg_advisory_xact_lock(hashtextextended(username_base, 0));

  candidate := username_base;
  WHILE EXISTS (
    SELECT 1
    FROM app.app_users
    WHERE username = candidate
  ) LOOP
    suffix := '_' || sequence_number::TEXT;
    candidate := left(username_base, 30 - length(suffix)) || suffix;
    sequence_number := sequence_number + 1;
  END LOOP;

  NEW.username := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_assign_username_before_insert ON app.app_users;

CREATE TRIGGER app_users_assign_username_before_insert
BEFORE INSERT ON app.app_users
FOR EACH ROW
EXECUTE FUNCTION app.app_users_assign_username();

ALTER TABLE app.app_users
ALTER COLUMN username SET NOT NULL;

COMMIT;
