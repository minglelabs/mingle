-- Rename the public identifier and remove the duplicate display_name field.
-- The trigger is installed before NOT NULL so legacy 1.1.4 inserts remain valid.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'app_users'
      AND column_name = 'username'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'app_users'
      AND column_name = 'handle'
  ) THEN
    ALTER TABLE app.app_users RENAME COLUMN username TO handle;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'app_users'
      AND column_name = 'handle'
  ) THEN
    ALTER TABLE app.app_users ADD COLUMN handle TEXT;
  END IF;
END $$;

-- Preserve a populated legacy name when display_name exists, then remove the
-- duplicate column because name is the only editable display name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'app_users'
      AND column_name = 'display_name'
  ) THEN
    UPDATE app.app_users
    SET name = COALESCE(NULLIF(BTRIM(name), ''), NULLIF(BTRIM(display_name), ''))
    WHERE (name IS NULL OR BTRIM(name) = '')
      AND display_name IS NOT NULL
      AND BTRIM(display_name) <> '';

    ALTER TABLE app.app_users DROP COLUMN display_name;
  END IF;
END $$;

-- A prior draft may have created the old trigger/function name.
DROP TRIGGER IF EXISTS app_users_assign_username_before_insert ON app.app_users;
DROP FUNCTION IF EXISTS app.app_users_assign_username();

-- Normalize any missing legacy handles before enforcing the required field.
UPDATE app.app_users
SET handle = NULL
WHERE handle IS NOT NULL
  AND BTRIM(handle) = '';

DO $$
DECLARE
  user_record RECORD;
  handle_base TEXT;
  candidate TEXT;
  suffix TEXT;
  sequence_number INTEGER;
BEGIN
  FOR user_record IN
    SELECT id, name, email, external_user_id
    FROM app.app_users
    WHERE handle IS NULL
    ORDER BY id
  LOOP
    handle_base := COALESCE(
      NULLIF(regexp_replace(COALESCE(user_record.name, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
      NULLIF(regexp_replace(split_part(COALESCE(user_record.email, ''), '@', 1), '[^A-Za-z0-9_.]', '', 'g'), ''),
      NULLIF(regexp_replace(COALESCE(user_record.external_user_id, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
      'user'
    );
    handle_base := left(lower(handle_base), 30);
    candidate := handle_base;
    sequence_number := 1;

    WHILE EXISTS (
      SELECT 1
      FROM app.app_users
      WHERE handle = candidate
    ) LOOP
      suffix := '_' || sequence_number::TEXT;
      candidate := left(handle_base, 30 - length(suffix)) || suffix;
      sequence_number := sequence_number + 1;
    END LOOP;

    UPDATE app.app_users
    SET handle = candidate
    WHERE id = user_record.id;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('app.app_users_username_key') IS NOT NULL
     AND to_regclass('app.app_users_handle_key') IS NULL THEN
    ALTER INDEX app.app_users_username_key RENAME TO app_users_handle_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_handle_key
ON app.app_users (handle);

CREATE OR REPLACE FUNCTION app.app_users_assign_handle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  handle_base TEXT;
  candidate TEXT;
  suffix TEXT;
  sequence_number INTEGER;
BEGIN
  IF NEW.handle IS NOT NULL AND BTRIM(NEW.handle) <> '' THEN
    NEW.handle := left(lower(BTRIM(NEW.handle)), 30);
    RETURN NEW;
  END IF;

  handle_base := COALESCE(
    NULLIF(regexp_replace(COALESCE(NEW.name, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
    NULLIF(regexp_replace(split_part(COALESCE(NEW.email, ''), '@', 1), '[^A-Za-z0-9_.]', '', 'g'), ''),
    NULLIF(regexp_replace(COALESCE(NEW.external_user_id, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
    NULLIF(regexp_replace(COALESCE(NEW.id, ''), '[^A-Za-z0-9_.]', '', 'g'), ''),
    'user'
  );
  handle_base := left(lower(handle_base), 30);

  PERFORM pg_advisory_xact_lock(hashtextextended(handle_base, 0));

  candidate := handle_base;
  sequence_number := 1;
  WHILE EXISTS (
    SELECT 1
    FROM app.app_users
    WHERE handle = candidate
  ) LOOP
    suffix := '_' || sequence_number::TEXT;
    candidate := left(handle_base, 30 - length(suffix)) || suffix;
    sequence_number := sequence_number + 1;
  END LOOP;

  NEW.handle := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_assign_handle_before_insert ON app.app_users;

CREATE TRIGGER app_users_assign_handle_before_insert
BEFORE INSERT ON app.app_users
FOR EACH ROW
EXECUTE FUNCTION app.app_users_assign_handle();

ALTER TABLE app.app_users
ALTER COLUMN handle SET NOT NULL;
