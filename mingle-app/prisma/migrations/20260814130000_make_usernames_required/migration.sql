-- Backfill public usernames before making the field required.
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
    FROM "app_users"
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
      FROM "app_users"
      WHERE username = candidate
    ) LOOP
      suffix := '_' || sequence_number::TEXT;
      candidate := left(username_base, 30 - length(suffix)) || suffix;
      sequence_number := sequence_number + 1;
    END LOOP;

    UPDATE "app_users"
    SET username = candidate
    WHERE id = user_record.id;
  END LOOP;
END $$;

ALTER TABLE "app_users"
ALTER COLUMN "username" SET NOT NULL;
