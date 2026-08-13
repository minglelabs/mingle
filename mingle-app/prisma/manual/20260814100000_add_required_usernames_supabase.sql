-- Apply the public username migrations to the Mingle app schema in Supabase.
-- Run this script once in the Supabase SQL Editor.

BEGIN;

-- The Prisma datasource uses the app schema. Keep every object reference
-- schema-qualified so this script cannot accidentally modify public.app_users.
ALTER TABLE app.app_users
ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS app.app_users_username_key
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

ALTER TABLE app.app_users
ALTER COLUMN username SET NOT NULL;

COMMIT;
